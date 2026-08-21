import type { SupabaseClient } from "@supabase/supabase-js";
import type { OverviewBooking } from "@/domain/overview/types";
import type { Database } from "@/types/database";

const OVERVIEW_BOOKING_COLUMNS =
  "id, reference, arrival_date, departure_date, eta, etd, customer_name, vessel_name, status, created_at" as const;

export class OverviewRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OverviewRepositoryError";
  }
}

export async function listOverviewBookings(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  today: string,
  recentCreatedAt: string,
): Promise<OverviewBooking[]> {
  const [stayResult, createdResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(OVERVIEW_BOOKING_COLUMNS)
      .eq("marina_id", marinaId)
      .lte("arrival_date", today)
      .gte("departure_date", today),
    supabase
      .from("bookings")
      .select(OVERVIEW_BOOKING_COLUMNS)
      .eq("marina_id", marinaId)
      .gte("created_at", recentCreatedAt),
  ]);

  const error = stayResult.error ?? createdResult.error;
  if (error) {
    throw new OverviewRepositoryError("Unable to load overview bookings.", {
      cause: error,
    });
  }

  const byId = new Map<string, OverviewBooking>();
  for (const booking of [...(stayResult.data ?? []), ...(createdResult.data ?? [])]) {
    byId.set(booking.id, booking);
  }
  return [...byId.values()];
}
