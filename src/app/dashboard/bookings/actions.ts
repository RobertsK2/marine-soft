"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAvailability } from "@/domain/availability/matching";
import { loadAvailabilitySnapshot } from "@/domain/availability/repository";
import {
  BookingRepositoryError,
  createBooking,
  updateBookingStatus,
} from "@/domain/bookings/repository";
import {
  BOOKING_STATUSES,
  type BookingFieldErrors,
  type BookingStatus,
} from "@/domain/bookings/types";
import { validateBookingInput } from "@/domain/bookings/validation";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export type BookingActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: BookingFieldErrors;
};

export type BerthAssignmentActionState = {
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

export async function updateBookingStatusAction(
  bookingId: string,
  _state: BookingActionState,
  formData: FormData,
): Promise<BookingActionState> {
  if (!isUuid(bookingId)) {
    return { status: "error", message: "The booking reference is invalid." };
  }
  const status = formData.get("status");
  if (!isBookingStatus(status)) {
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
