"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAvailability } from "@/domain/availability/matching";
import { loadAvailabilitySnapshot } from "@/domain/availability/repository";
import {
  BookingRepositoryError,
  createBooking,
  getBooking,
  updateBookingStatus,
} from "@/domain/bookings/repository";
import {
  BOOKING_STATUSES,
  type BookingFieldErrors,
  type BookingStatus,
} from "@/domain/bookings/types";
import { validateBookingInput } from "@/domain/bookings/validation";
import { bookingNights } from "@/domain/bookings/formatting";
import { calculatePriceSnapshot } from "@/domain/pricing/model";
import { loadPricingCatalog } from "@/domain/pricing/repository";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { createClient } from "@/lib/supabase/server";

export type BookingActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: BookingFieldErrors;
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
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  if (!isUuid(bookingId)) {
    return { status: "error", message: "The booking reference is invalid." };
  }
  const status = formData.get("status");
  if (!isBookingStatus(status) || !["confirmed", "cancelled"].includes(status)) {
    return { status: "error", message: "Choose a valid booking status." };
  }

  const context = await getAuthorizationContext();
  if (!context) return { status: "error", message: "Marina access is required." };

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
