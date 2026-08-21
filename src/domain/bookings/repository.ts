import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Booking,
  BookingInput,
  BookingStatus,
} from "@/domain/bookings/types";
import type { Database } from "@/types/database";

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
): Promise<Booking[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select("*")
    .eq("marina_id", marinaId)
    .order("arrival_date", { ascending: true })
    .order("reference", { ascending: true });

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

export async function createBooking(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  input: BookingInput,
) {
  const { data, error } = await supabase
    .from("bookings")
    .insert({ marina_id: marinaId, ...bookingRecord(input) })
    .select("id, reference")
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
