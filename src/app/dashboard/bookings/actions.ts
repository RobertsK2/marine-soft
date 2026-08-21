"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { validateBookingCapacity } from "@/domain/bookings/capacity";
import {
  BookingRepositoryError,
  createBooking,
  hasPhysicalCapacity,
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
    const hasCapacity = await validateBookingCapacity(
      validation.data,
      (request) => hasPhysicalCapacity(supabase, context.marinaId, request),
    );
    if (!hasCapacity) {
      return {
        status: "error",
        message: "No operational berth can safely accommodate these vessel dimensions.",
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
