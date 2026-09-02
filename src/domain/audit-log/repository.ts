import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuditEvent } from "./types";

export class AuditLogRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AuditLogRepositoryError";
  }
}

async function listAuditEvents(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  filters: { bookingId?: string; berthId?: string },
  limit: number,
): Promise<AuditEvent[]> {
  let query = supabase
    .from("audit_events")
    .select("*")
    .eq("marina_id", marinaId)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);
  if (filters.bookingId) query = query.eq("booking_id", filters.bookingId);
  if (filters.berthId) query = query.eq("berth_id", filters.berthId);
  const { data, error } = await query;
  if (error) throw new AuditLogRepositoryError("Unable to load audit history.", { cause: error });
  return data;
}

export function listMarinaAuditEvents(supabase: SupabaseClient<Database>, marinaId: string, limit = 250) {
  return listAuditEvents(supabase, marinaId, {}, limit);
}

export function listBookingAuditEvents(supabase: SupabaseClient<Database>, marinaId: string, bookingId: string) {
  return listAuditEvents(supabase, marinaId, { bookingId }, 100);
}

export function listBerthAuditEvents(supabase: SupabaseClient<Database>, marinaId: string, berthId: string) {
  return listAuditEvents(supabase, marinaId, { berthId }, 100);
}
