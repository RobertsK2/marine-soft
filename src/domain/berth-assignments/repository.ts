import type { SupabaseClient } from "@supabase/supabase-js";
import { listBerths } from "@/domain/berths/repository";
import type { Booking } from "@/domain/bookings/types";
import { buildBookingBerthAssignmentState } from "@/domain/berth-assignments/model";
import type { BerthAssignment } from "@/domain/berth-assignments/types";
import type { Database } from "@/types/database";

export class BerthAssignmentRepositoryError extends Error {
  constructor(message: string, readonly code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BerthAssignmentRepositoryError";
  }
}

export async function listBerthAssignments(
  supabase: SupabaseClient<Database>,
  marinaId: string,
): Promise<BerthAssignment[]> {
  const { data, error } = await supabase
    .from("booking_berth_assignments")
    .select("*")
    .eq("marina_id", marinaId)
    .order("assigned_at", { ascending: false });
  if (error) throw new BerthAssignmentRepositoryError("Unable to load berth assignments.", error.code, { cause: error });
  return data;
}

export async function getBookingBerthAssignmentState(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  booking: Booking,
) {
  const [berths, assignments] = await Promise.all([
    listBerths(supabase, marinaId),
    listBerthAssignments(supabase, marinaId),
  ]);
  return buildBookingBerthAssignmentState(booking, berths, assignments);
}
