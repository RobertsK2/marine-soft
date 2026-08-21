import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
} from "@/domain/availability/types";
import type { Database } from "@/types/database";

export class AvailabilityRepositoryError extends Error {
  constructor(message: string, readonly code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AvailabilityRepositoryError";
  }
}

export async function loadAvailabilitySnapshot(
  supabase: SupabaseClient<Database>,
  request: AvailabilityRequest,
) {
  const [berthResult, bookingResult] = await Promise.all([
    supabase
      .from("berths")
      .select("id, marina_id, code, priority, status, allow_smaller_vessels, max_length_m, max_beam_m, max_draft_m")
      .eq("marina_id", request.marinaId),
    supabase
      .from("bookings")
      .select("id, marina_id, arrival_date, departure_date, status, vessel_length_m, vessel_beam_m, vessel_draft_m")
      .eq("marina_id", request.marinaId)
      .in("status", ["confirmed", "checked_in"]),
  ]);

  const error = berthResult.error ?? bookingResult.error;
  if (error) {
    throw new AvailabilityRepositoryError(
      "Unable to load marina availability.",
      error.code,
      { cause: error },
    );
  }

  const berths: AvailabilityBerth[] = (berthResult.data ?? []).map((berth) => ({
    id: berth.id,
    marinaId: berth.marina_id,
    code: berth.code,
    priority: berth.priority,
    status: berth.status,
    allowSmallerVessels: berth.allow_smaller_vessels,
    maxLengthM: berth.max_length_m,
    maxBeamM: berth.max_beam_m,
    maxDraftM: berth.max_draft_m,
  }));
  const bookings: AvailabilityBooking[] = (bookingResult.data ?? []).map((booking) => ({
    id: booking.id,
    marinaId: booking.marina_id,
    arrivalDate: booking.arrival_date,
    departureDate: booking.departure_date,
    status: booking.status,
    vesselLengthM: booking.vessel_length_m,
    vesselBeamM: booking.vessel_beam_m,
    vesselDraftM: booking.vessel_draft_m,
  }));

  return { berths, bookings };
}
