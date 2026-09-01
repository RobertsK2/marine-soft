"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAvailability } from "@/domain/availability/matching";
import { loadAvailabilitySnapshot } from "@/domain/availability/repository";
import {
  BookingRepositoryError,
  createBooking,
  getBooking,
  listBookingPriceAdjustments,
  updateBookingStatus,
} from "@/domain/bookings/repository";
import {
  BOOKING_STATUSES,
  type BookingFieldErrors,
  type BookingStatus,
} from "@/domain/bookings/types";
import { validateBookingInput } from "@/domain/bookings/validation";
import { bookingNights } from "@/domain/bookings/formatting";
import { extensionNights, parseExtensionBerthOptions } from "@/domain/booking-extensions/model";
import type { BookingExtensionPreview } from "@/domain/booking-extensions/types";
import type { CancellationPreview } from "@/domain/booking-cancellations/types";
import { calculatePriceSnapshot } from "@/domain/pricing/model";
import { loadPricingCatalog } from "@/domain/pricing/repository";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { createClient } from "@/lib/supabase/server";

export type BookingActionState = {
  status: "idle" | "confirmation" | "success" | "error";
  message?: string;
  fieldErrors?: BookingFieldErrors;
  cancellation?: CancellationPreview;
};

export type BookingChangeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: BookingFieldErrors;
};

export type BerthAssignmentActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type OperationalTransitionActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type BookingExtensionActionState = {
  status: "idle" | "preview" | "success" | "error";
  message?: string;
  preview?: BookingExtensionPreview;
};

function formValues(formData: FormData) {
  return {
    arrivalDate: formData.get("arrivalDate"),
    departureDate: formData.get("departureDate"),
    eta: formData.get("eta"),
    etd: formData.get("etd"),
    customerName: formData.get("customerName"),
    customerEmail: formData.get("customerEmail"),
    customerPhone: formData.get("customerPhone"),
    vesselName: formData.get("vesselName"),
    vesselLengthM: formData.get("vesselLengthM"),
    vesselBeamM: formData.get("vesselBeamM"),
    vesselDraftM: formData.get("vesselDraftM"),
  };
}

function isBookingStatus(value: unknown): value is BookingStatus {
  return typeof value === "string" && BOOKING_STATUSES.some((status) => status === value);
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function repositoryFailure(error: unknown): BookingActionState {
  captureServerError(error, { operation: "booking_mutation" });
  if (error instanceof BookingRepositoryError && error.code === "23505") {
    return { status: "error", message: "A booking reference collision occurred. Try again." };
  }
  if (error instanceof BookingRepositoryError && error.code === "P0001") {
    return {
      status: "error",
      message: "An active public checkout hold has priority for this capacity. Wait for it to expire or choose another stay or vessel.",
    };
  }
  return {
    status: "error",
    message: "Booking changes could not be saved. Review the values and try again.",
  };
}

export async function createBookingAction(
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  const validation = validateBookingInput(formValues(formData));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.errors };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  let bookingId: string;
  try {
    const supabase = await createClient();
    const availabilityRequest = {
      marinaId: context.marinaId,
      arrivalDate: validation.data.arrivalDate,
      departureDate: validation.data.departureDate,
      vesselLengthM: validation.data.vesselLengthM,
      vesselBeamM: validation.data.vesselBeamM,
      vesselDraftM: validation.data.vesselDraftM,
    };
    const snapshot = await loadAvailabilitySnapshot(supabase, availabilityRequest);
    const availability = checkAvailability(
      availabilityRequest,
      snapshot.berths,
      snapshot.bookings,
    );
    if (!availability.available) {
      return {
        status: "error",
        message: "No safe berth capacity is available for this vessel and stay.",
      };
    }

    const booking = await createBooking(supabase, context.marinaId, validation.data);
    bookingId = booking.id;
  } catch (error) {
    return repositoryFailure(error);
  }

  revalidatePath("/dashboard/bookings");
  redirect(`/dashboard/bookings/${bookingId}`);
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountMinor / 100);
}

async function calculateExtensionPrice(
  marinaId: string,
  timezone: string,
  booking: Awaited<ReturnType<typeof getBooking>>,
  requestedDeparture: string,
) {
  if (!booking?.price_snapshot) return null;
  const privileged = createPrivilegedClient();
  const catalog = await loadPricingCatalog(privileged, marinaId);
  if (!catalog) throw new Error("Pricing is not configured for this extension.");
  return calculatePriceSnapshot({
    arrivalDate: booking.arrival_date,
    departureDate: requestedDeparture,
    eta: booking.eta,
    etd: booking.etd,
    marinaTimezone: timezone,
    stayNights: bookingNights(booking.arrival_date, requestedDeparture),
    vesselName: booking.vessel_name,
    vesselLengthM: booking.vessel_length_m,
    vesselBeamM: booking.vessel_beam_m,
    vesselDraftM: booking.vessel_draft_m,
  }, catalog);
}

export async function previewBookingExtensionAction(
  bookingId: string,
  expectedUpdatedAt: string,
  _state: BookingExtensionActionState,
  formData: FormData,
): Promise<BookingExtensionActionState> {
  const requestedDeparture = String(formData.get("requestedDeparture") ?? "");
  if (!isUuid(bookingId) || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The booking version is invalid. Refresh and try again." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  try {
    const privileged = createPrivilegedClient();
    const booking = await getBooking(privileged, context.marinaId, bookingId);
    if (!booking) return { status: "error", message: "Booking not found for this marina." };
    const addedNights = extensionNights(booking.departure_date, requestedDeparture);
    if (addedNights === null) {
      return { status: "error", message: "Choose a departure date after the current departure." };
    }

    const calculatedPriceSnapshot = await calculateExtensionPrice(
      context.marinaId, context.timezone, booking, requestedDeparture,
    );
    const [previewResult, adjustments] = await Promise.all([
      privileged.rpc("preview_booking_extension", {
        target_marina_id: context.marinaId,
        target_booking_id: bookingId,
        target_actor_id: context.userId,
        expected_updated_at: expectedUpdatedAt,
        requested_departure: requestedDeparture,
      }),
      listBookingPriceAdjustments(privileged, context.marinaId, bookingId),
    ]);
    if (previewResult.error) throw previewResult.error;
    const result = previewResult.data?.[0];
    if (!result) throw new Error("Extension preview returned no result.");

    const errors: Record<string, string> = {
      unauthorized: "Marina access is required.",
      not_found: "Booking not found for this marina.",
      not_extendable: "Only confirmed or checked-in bookings can be extended.",
      stale: "This booking changed after the page loaded. Refresh before continuing.",
      invalid_departure: "Choose a departure date after the current departure.",
      impossible: "The extension is not possible: no capacity-safe berth plan covers the added nights.",
    };
    if (errors[result.outcome]) return { status: "error", message: errors[result.outcome] };
    if (!["same_berth", "move_required", "unassigned_available"].includes(result.outcome)) {
      throw new Error(`Unexpected extension preview outcome: ${result.outcome}`);
    }

    const latestAdjustment = adjustments[0] ?? null;
    const previousTotalMinor = latestAdjustment?.revised_price_total_minor
      ?? booking.price_total_minor;
    const revisedTotalMinor = calculatedPriceSnapshot?.totalMinor ?? null;
    const differenceFromPaidMinor = revisedTotalMinor !== null && booking.price_total_minor !== null
      ? revisedTotalMinor - booking.price_total_minor
      : null;
    const berthOptions = parseExtensionBerthOptions(result.berth_options);
    if (result.outcome === "move_required" && berthOptions.length === 0) {
      throw new Error("A required berth move had no valid alternatives.");
    }

    return {
      status: "preview",
      message: result.outcome === "same_berth"
        ? `Extension validated on berth ${result.current_berth_code}. Confirm to save it.`
        : result.outcome === "move_required"
          ? `Berth ${result.current_berth_code} cannot serve the added nights. Choose and confirm a planned move.`
          : "Capacity is available. This unassigned booking can be extended without creating a berth assignment.",
      preview: {
        expectedUpdatedAt,
        originalDeparture: booking.departure_date,
        requestedDeparture,
        addedNights,
        currentBerthCode: result.current_berth_code,
        moveRequired: result.move_required,
        berthOptions,
        currency: booking.price_currency,
        previousTotalMinor,
        revisedTotalMinor,
        differenceFromPaidMinor,
      },
    };
  } catch (error) {
    captureServerError(error, { operation: "booking_extension_preview", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "The extension could not be previewed. No changes were saved." };
  }
}

export async function confirmBookingExtensionAction(
  bookingId: string,
  expectedUpdatedAt: string,
  _state: BookingExtensionActionState,
  formData: FormData,
): Promise<BookingExtensionActionState> {
  const requestedDeparture = String(formData.get("requestedDeparture") ?? "");
  const moveBerthValue = String(formData.get("moveBerthId") ?? "");
  const moveBerthId = moveBerthValue || null;
  if (
    !isUuid(bookingId)
    || Number.isNaN(Date.parse(expectedUpdatedAt))
    || (moveBerthId !== null && !isUuid(moveBerthId))
  ) {
    return { status: "error", message: "The extension confirmation is invalid. Preview it again." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  try {
    const privileged = createPrivilegedClient();
    const booking = await getBooking(privileged, context.marinaId, bookingId);
    if (!booking) return { status: "error", message: "Booking not found for this marina." };
    if (extensionNights(booking.departure_date, requestedDeparture) === null) {
      return { status: "error", message: "The booking changed. Preview the extension again." };
    }
    const calculatedPriceSnapshot = await calculateExtensionPrice(
      context.marinaId, context.timezone, booking, requestedDeparture,
    );
    const { data, error } = await privileged.rpc("confirm_booking_extension", {
      target_marina_id: context.marinaId,
      target_booking_id: bookingId,
      target_actor_id: context.userId,
      expected_updated_at: expectedUpdatedAt,
      requested_departure: requestedDeparture,
      requested_move_berth_id: moveBerthId,
      calculated_price_snapshot: calculatedPriceSnapshot,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Extension confirmation returned no result.");

    const errors: Record<string, string> = {
      unauthorized: "Marina access is required.",
      not_found: "Booking not found for this marina.",
      not_extendable: "Only confirmed or checked-in bookings can be extended.",
      stale: "The booking changed after preview. Refresh and preview the extension again.",
      invalid_departure: "The requested departure is no longer a valid extension.",
      impossible: "Capacity changed after preview. The extension was not saved.",
      move_invalid: "The selected move berth is no longer available. Preview the extension again.",
      move_not_required: "The selected berth move is not required. Preview the extension again.",
      invalid_price: "The server price changed or is invalid. The extension was not saved.",
    };
    if (errors[result.outcome]) return { status: "error", message: errors[result.outcome] };
    if (!["extended_same_berth", "extended_with_move", "extended_unassigned"].includes(result.outcome)) {
      throw new Error(`Unexpected extension confirmation outcome: ${result.outcome}`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/bookings");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath("/dashboard/marina-map");

    const priceNote = result.price_difference_minor !== null && result.price_currency
      ? result.price_difference_minor > 0
        ? ` ${formatMoney(result.price_difference_minor, result.price_currency)} remains due; no payment was taken.`
        : result.price_difference_minor < 0
          ? ` ${formatMoney(Math.abs(result.price_difference_minor), result.price_currency)} is refundable; no refund was issued.`
          : " The total remains settled against the original payment."
      : "";
    const message = result.outcome === "extended_same_berth"
      ? `Stay extended on berth ${result.current_berth_code}.${priceNote}`
      : result.outcome === "extended_with_move"
        ? `Stay extended. Planned move from berth ${result.current_berth_code} to ${result.move_berth_code} confirmed for ${booking.departure_date}.${priceNote}`
        : `Unassigned stay extended. No berth assignment was created.${priceNote}`;
    return { status: "success", message };
  } catch (error) {
    captureServerError(error, { operation: "booking_extension_confirm", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "The extension could not be confirmed. No changes were saved." };
  }
}

export async function updateBookingDetailsAction(
  bookingId: string,
  expectedUpdatedAt: string,
  _state: BookingChangeActionState,
  formData: FormData,
): Promise<BookingChangeActionState> {
  if (!isUuid(bookingId) || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The booking version is invalid. Refresh and try again." };
  }

  const validation = validateBookingInput(formValues(formData));
  if (!validation.success) {
    return { status: "error", fieldErrors: validation.errors };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  try {
    const privileged = createPrivilegedClient();
    const current = await getBooking(privileged, context.marinaId, bookingId);
    if (!current) return { status: "error", message: "Booking not found for this marina." };
    const { count: activeSegmentCount, error: segmentError } = await privileged
      .from("booking_berth_assignments")
      .select("id", { count: "exact", head: true })
      .eq("marina_id", context.marinaId)
      .eq("booking_id", bookingId)
      .is("ended_at", null);
    if (segmentError) throw segmentError;
    if ((activeSegmentCount ?? 0) > 1) {
      return {
        status: "error",
        message: "General booking edits are locked while a planned berth-move schedule exists. Use the extension control for added nights.",
      };
    }

    const priceAffecting = current.arrival_date !== validation.data.arrivalDate
      || current.departure_date !== validation.data.departureDate
      || current.vessel_length_m !== validation.data.vesselLengthM;
    let calculatedPriceSnapshot = null;

    if (priceAffecting && current.price_snapshot) {
      const catalog = await loadPricingCatalog(privileged, context.marinaId);
      if (!catalog) {
        return {
          status: "error",
          message: "Pricing is not configured for the revised stay. No changes were saved.",
        };
      }
      calculatedPriceSnapshot = calculatePriceSnapshot({
        arrivalDate: validation.data.arrivalDate,
        departureDate: validation.data.departureDate,
        eta: validation.data.eta,
        etd: validation.data.etd,
        marinaTimezone: context.timezone,
        stayNights: bookingNights(validation.data.arrivalDate, validation.data.departureDate),
        vesselName: validation.data.vesselName,
        vesselLengthM: validation.data.vesselLengthM,
        vesselBeamM: validation.data.vesselBeamM,
        vesselDraftM: validation.data.vesselDraftM,
      }, catalog);
    }

    const { data, error } = await privileged.rpc("update_booking_details", {
      target_marina_id: context.marinaId,
      target_booking_id: bookingId,
      target_actor_id: context.userId,
      expected_updated_at: expectedUpdatedAt,
      requested_arrival: validation.data.arrivalDate,
      requested_departure: validation.data.departureDate,
      requested_eta: validation.data.eta,
      requested_etd: validation.data.etd,
      requested_customer_name: validation.data.customerName,
      requested_customer_email: validation.data.customerEmail,
      requested_customer_phone: validation.data.customerPhone,
      requested_vessel_name: validation.data.vesselName,
      requested_length_m: validation.data.vesselLengthM,
      requested_beam_m: validation.data.vesselBeamM,
      requested_draft_m: validation.data.vesselDraftM,
      calculated_price_snapshot: calculatedPriceSnapshot,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Booking detail update returned no result.");

    const errors: Record<string, string> = {
      unauthorized: "Marina access is required.",
      not_found: "Booking not found for this marina.",
      not_editable: "Only confirmed bookings can be edited in this phase.",
      stale: "This booking changed after the form loaded. Refresh before saving again.",
      invalid: "The revised booking values are invalid. No changes were saved.",
      unavailable: "No safe berth capacity is available for the revised vessel and stay.",
      assignment_invalid: "The current berth would become invalid or conflict with another assignment. Keep the current stay and vessel limits, or reassign the berth first.",
      invalid_price: "The server price no longer matches this booking. No changes were saved.",
    };
    if (errors[result.outcome]) return { status: "error", message: errors[result.outcome] };
    if (result.outcome === "unchanged") {
      return { status: "success", message: "No booking details changed." };
    }
    if (result.outcome !== "updated") throw new Error(`Unexpected booking update outcome: ${result.outcome}`);

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/bookings");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath("/dashboard/marina-map");

    const assignmentNote = result.assignment_preserved
      ? " The current berth was revalidated and preserved in assignment history."
      : "";
    if (result.price_difference_minor !== null && result.price_currency && result.revised_total_minor !== null) {
      const revised = formatMoney(result.revised_total_minor, result.price_currency);
      if (result.price_difference_minor > 0) {
        return {
          status: "success",
          message: `Changes saved. Revised total: ${revised}. ${formatMoney(result.price_difference_minor, result.price_currency)} remains due; no payment was taken.${assignmentNote}`,
        };
      }
      if (result.price_difference_minor < 0) {
        return {
          status: "success",
          message: `Changes saved. Revised total: ${revised}. ${formatMoney(Math.abs(result.price_difference_minor), result.price_currency)} is refundable; no refund was issued.${assignmentNote}`,
        };
      }
      return { status: "success", message: `Changes saved. Price remains ${revised}.${assignmentNote}` };
    }
    return { status: "success", message: `Changes saved.${assignmentNote}` };
  } catch (error) {
    captureServerError(error, { operation: "booking_detail_update", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "Booking changes could not be saved. Refresh and try again." };
  }
}

export async function updateBookingStatusAction(
  bookingId: string,
  expectedUpdatedAt: string,
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  if (!isUuid(bookingId) || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The booking reference is invalid." };
  }
  const status = formData.get("confirmCancellation") === "true" ? "cancelled" : formData.get("status");
  if (!isBookingStatus(status) || !["confirmed", "cancelled"].includes(status)) {
    return { status: "error", message: "Choose a valid booking status." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  if (status === "cancelled" && formData.get("confirmCancellation") !== "true") {
    try {
      const privileged = createPrivilegedClient();
      const { data, error } = await privileged.rpc("preview_booking_cancellation", {
        target_marina_id: context.marinaId,
        target_booking_id: bookingId,
        target_actor_id: context.userId,
        expected_updated_at: expectedUpdatedAt,
      });
      if (error) throw error;
      const result = data?.[0];
      if (!result) throw new Error("Cancellation preview returned no result.");
      const messages: Record<string, string> = {
        unauthorized: "Marina access is required.",
        not_found: "Booking not found for this marina.",
        stale: "This booking changed after the form loaded. Refresh before cancelling.",
        already_cancelled: "This booking is already cancelled.",
        not_cancellable: "Only confirmed bookings can be cancelled in this workflow.",
      };
      if (messages[result.outcome]) return { status: "error", message: messages[result.outcome] };
      if (result.outcome !== "ready") throw new Error(`Unexpected cancellation preview: ${result.outcome}`);
      const refund = result.refund_recommendation_minor === null || !result.currency
        ? "No refund recommendation is available for this booking."
        : `${formatMoney(result.refund_recommendation_minor, result.currency)} refund recommended (${result.refund_percent}%).`;
      return {
        status: "confirmation",
        message: `${refund} This is a recommendation only; no refund will be issued automatically. Confirm cancellation to release future capacity.`,
        cancellation: {
          policyCode: result.policy_code ?? "unknown",
          refundPercent: result.refund_percent ?? 0,
          refundRecommendationMinor: result.refund_recommendation_minor,
          paidTotalMinor: result.paid_total_minor,
          currency: result.currency,
          assignmentCount: result.assignment_count,
        },
      };
    } catch (error) {
      captureServerError(error, { operation: "booking_cancellation_preview", bookingId, marinaId: context.marinaId });
      return { status: "error", message: "Cancellation could not be previewed. No changes were saved." };
    }
  }

  if (status === "cancelled" && formData.get("confirmCancellation") === "true") {
    try {
      const privileged = createPrivilegedClient();
      const { data, error } = await privileged.rpc("confirm_booking_cancellation", {
        target_marina_id: context.marinaId,
        target_booking_id: bookingId,
        target_actor_id: context.userId,
        expected_updated_at: expectedUpdatedAt,
        cancellation_reason: String(formData.get("cancellationReason") ?? ""),
      });
      if (error) throw error;
      const result = data?.[0];
      if (!result) throw new Error("Cancellation confirmation returned no result.");
      const messages: Record<string, string> = {
        unauthorized: "Marina access is required.",
        not_found: "Booking not found for this marina.",
        stale: "The booking changed after preview. Refresh and preview cancellation again.",
        already_cancelled: "This booking is already cancelled.",
        not_cancellable: "Only confirmed bookings can be cancelled in this workflow.",
        invalid_reason: "Add a cancellation reason of 500 characters or fewer.",
      };
      if (messages[result.outcome]) return { status: "error", message: messages[result.outcome] };
      if (result.outcome !== "cancelled") throw new Error(`Unexpected cancellation confirmation: ${result.outcome}`);
      revalidatePath("/dashboard");
      revalidatePath("/dashboard/bookings");
      revalidatePath(`/dashboard/bookings/${bookingId}`);
      revalidatePath("/dashboard/marina-map");
      const refund = result.refund_recommendation_minor !== null && result.currency
        ? ` Refund recommendation: ${formatMoney(result.refund_recommendation_minor, result.currency)} (${result.refund_percent}%). No refund was issued.`
        : " No refund was issued.";
      return { status: "success", message: `Booking cancelled. ${result.released_assignment_count} future berth assignment(s) released.${refund}` };
    } catch (error) {
      captureServerError(error, { operation: "booking_cancellation_confirm", bookingId, marinaId: context.marinaId });
      return { status: "error", message: "Cancellation could not be saved. No changes were saved." };
    }
  }

  try {
    const supabase = await createClient();
    const updated = await updateBookingStatus(
      supabase,
      context.marinaId,
      bookingId,
      status,
    );
    if (!updated) return { status: "error", message: "Booking not found or not editable." };
  } catch (error) {
    return repositoryFailure(error);
  }

  revalidatePath("/dashboard/bookings");
  revalidatePath(`/dashboard/bookings/${bookingId}`);
  redirect(`/dashboard/bookings/${bookingId}`);
}

export async function transitionBookingStayAction(
  bookingId: string,
  _state: OperationalTransitionActionState,
  formData: FormData,
): Promise<OperationalTransitionActionState> {
  const targetStatus = formData.get("targetStatus");
  if (!isUuid(bookingId) || (targetStatus !== "checked_in" && targetStatus !== "checked_out")) {
    return { status: "error", message: "The requested operational transition is invalid." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("transition_booking_stay", {
      target_booking_id: bookingId,
      target_status: targetStatus,
      allow_unassigned_check_in: formData.get("allowUnassignedCheckIn") === "true",
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Operational transition returned no result.");

    const messages: Record<string, string> = {
      checked_in: result.berth_code
        ? `Checked in at berth ${result.berth_code}. The berth is now occupied.`
        : "Checked in with the unassigned-berth exception recorded.",
      checked_out: result.berth_code
        ? `Checked out from berth ${result.berth_code}. The berth is no longer occupied.`
        : "Checked out. The actual departure time was recorded.",
      assignment_required: "Assign a berth before check-in, or explicitly acknowledge the unassigned check-in exception.",
      invalid_transition: "The booking changed or is not in the required prior state. Refresh and try again.",
      invalid_target: "Only check-in and check-out are available here.",
      not_found: "Booking not found for this marina.",
      unauthorized: "Marina access is required.",
    };
    if (result.outcome !== "checked_in" && result.outcome !== "checked_out") {
      return { status: "error", message: messages[result.outcome] ?? "The transition could not be completed." };
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/bookings");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath("/dashboard/marina-map");
    return { status: "success", message: messages[result.outcome] };
  } catch (error) {
    captureServerError(error, { operation: "booking_operational_transition", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "Check-in or check-out could not be saved. Refresh and try again." };
  }
}

export async function assignBookingBerthAction(
  bookingId: string,
  _state: BerthAssignmentActionState,
  formData: FormData,
): Promise<BerthAssignmentActionState> {
  const berthId = String(formData.get("berthId") ?? "");
  if (!isUuid(bookingId) || !isUuid(berthId)) {
    return { status: "error", message: "Choose a valid berth." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

  try {
    const supabase = await createClient();
    const { count: activeSegmentCount, error: segmentError } = await supabase
      .from("booking_berth_assignments")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", bookingId)
      .is("ended_at", null);
    if (segmentError) throw segmentError;
    if ((activeSegmentCount ?? 0) > 1) {
      return { status: "error", message: "Direct reassignment is locked while a planned extension move exists." };
    }
    const { data, error } = await supabase.rpc("assign_booking_berth", {
      target_booking_id: bookingId,
      target_berth_id: berthId,
    });
    if (error) throw error;
    const result = data?.[0];
    if (!result) throw new Error("Berth assignment returned no result.");

    const messages: Record<string, string> = {
      assigned: `Berth ${result.berth_code} assigned.`,
      reassigned: `Booking reassigned to berth ${result.berth_code}. Prior assignment kept in history.`,
      existing: `Berth ${result.berth_code} is already assigned.`,
      conflict: `Berth ${result.berth_code} has an overlapping assignment. Choose another berth.`,
      incompatible: `Berth ${result.berth_code} does not safely fit this vessel.`,
      berth_unavailable: `Berth ${result.berth_code} is blocked or out of service.`,
      booking_not_assignable: "Only confirmed bookings can be assigned in this phase.",
      berth_not_found: "That berth is not part of this marina.",
      not_found: "Booking not found for this marina.",
      unauthorized: "Marina access is required.",
    };
    if (!["assigned", "reassigned", "existing"].includes(result.outcome)) {
      return { status: "error", message: messages[result.outcome] ?? "The berth could not be assigned." };
    }

    revalidatePath(`/dashboard/bookings/${bookingId}`);
    revalidatePath("/dashboard/marina-map");
    return { status: "success", message: messages[result.outcome] };
  } catch (error) {
    captureServerError(error, { operation: "booking_berth_assignment", bookingId, marinaId: context.marinaId });
    return { status: "error", message: "The berth assignment could not be saved. Try again." };
  }
}
