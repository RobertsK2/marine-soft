import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Booking,
  BookingInput,
  BookingPriceAdjustment,
  BookingStatus,
} from "@/domain/bookings/types";
import type { Database } from "@/types/database";
import { deriveBookingPaymentBalance, isPaymentOverdue } from "@/domain/booking-payments/model";
import type { BookingPaymentBalance } from "@/domain/booking-payments/types";
import type { BookingSort } from "@/domain/bookings/list-sorting";

export class BookingRepositoryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BookingRepositoryError";
  }
}

function bookingRecord(input: BookingInput) {
  return {
    arrival_date: input.arrivalDate,
    departure_date: input.departureDate,
    eta: input.eta,
    etd: input.etd,
    customer_name: input.customerName,
    customer_email: input.customerEmail,
    customer_phone: input.customerPhone,
    vessel_name: input.vesselName,
    vessel_length_m: input.vesselLengthM,
    vessel_beam_m: input.vesselBeamM,
    vessel_draft_m: input.vesselDraftM,
  };
}

export async function listBookings(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  sort: BookingSort = "newest",
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("marina_id", marinaId)
    .order(sort === "arrival" ? "arrival_date" : "created_at", { ascending: sort === "arrival" })
    .order("id", { ascending: false });

  if (error) {
    throw new BookingRepositoryError("Unable to load bookings.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function getBooking(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  bookingId: string,
): Promise<Booking | null> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("id", bookingId)
    .eq("marina_id", marinaId)
    .maybeSingle();

  if (error) {
    throw new BookingRepositoryError("Unable to load booking.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function getBookingCancellationEvent(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  bookingId: string,
) {
  const { data, error } = await supabase
    .from("booking_cancellation_events")
    .select("cancelled_at, policy_code, refund_percent, refund_recommendation_minor, currency, paid_total_minor")
    .eq("marina_id", marinaId)
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) {
    throw new BookingRepositoryError("Unable to load booking cancellation.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function listBookingPriceAdjustments(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  bookingId: string,
): Promise<BookingPriceAdjustment[]> {
  const { data, error } = await supabase
    .from("booking_price_adjustments")
    .select("*")
    .eq("marina_id", marinaId)
    .eq("booking_id", bookingId)
    .order("changed_at", { ascending: false });

  if (error) {
    throw new BookingRepositoryError("Unable to load booking price history.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function getBookingPaymentBalance(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  booking: Booking,
): Promise<BookingPaymentBalance> {
  const { data, error } = await supabase
    .from("booking_payment_balances")
    .select("*")
    .eq("marina_id", marinaId)
    .eq("booking_id", booking.id)
    .maybeSingle();
  if (error) throw new BookingRepositoryError("Unable to load booking payment balance.", error.code, { cause: error });
  const balance = data ?? deriveBookingPaymentBalance(booking);
  return { ...balance, overdue: isPaymentOverdue(balance.balance_due_minor, balance.due_at) };
}

export async function createBooking(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  actorId: string,
  requestId: string,
  input: BookingInput,
  totalMinor: number,
) {
  const { data, error } = await supabase
    .rpc("create_manual_booking_with_balance", {
      target_marina_id: marinaId,
      target_actor_id: actorId,
      requested_request_id: requestId,
      requested_booking: bookingRecord(input),
      requested_total_minor: totalMinor,
    })
    .single();

  if (error) {
    throw new BookingRepositoryError("Unable to create booking.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function updateBookingStatus(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  bookingId: string,
  status: BookingStatus,
) {
  const { data, error } = await supabase
    .from("bookings")
    .update({ status })
    .eq("id", bookingId)
    .eq("marina_id", marinaId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new BookingRepositoryError("Unable to update booking status.", error.code, {
      cause: error,
    });
  }
  return Boolean(data);
}
