import type { SupabaseClient } from "@supabase/supabase-js";
import type { Berth, BerthInput, BerthStatus } from "@/domain/berths/types";
import type { Database } from "@/types/database";

export class BerthRepositoryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BerthRepositoryError";
  }
}

function berthRecord(input: BerthInput) {
  return {
    code: input.code,
    zone: input.zone,
    max_length_m: input.maxLengthM,
    max_beam_m: input.maxBeamM,
    max_draft_m: input.maxDraftM,
    priority: input.priority,
    status: input.status,
    allow_smaller_vessels: input.allowSmallerVessels,
  };
}

export async function listBerths(
  supabase: SupabaseClient<Database>,
  marinaId: string,
): Promise<Berth[]> {
  const { data, error } = await supabase
    .from("berths")
    .select("*")
    .eq("marina_id", marinaId)
    .order("priority", { ascending: true })
    .order("code", { ascending: true });

  if (error) {
    throw new BerthRepositoryError("Unable to load berth inventory.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function getBerth(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  berthId: string,
): Promise<Berth | null> {
  const { data, error } = await supabase
    .from("berths")
    .select("*")
    .eq("id", berthId)
    .eq("marina_id", marinaId)
    .maybeSingle();

  if (error) {
    throw new BerthRepositoryError("Unable to load berth details.", error.code, {
      cause: error,
    });
  }
  return data;
}

export async function createBerth(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  input: BerthInput,
) {
  const { data, error } = await supabase
    .from("berths")
    .insert({ marina_id: marinaId, ...berthRecord(input) })
    .select("id")
    .single();

  if (error) {
    throw new BerthRepositoryError("Unable to create berth.", error.code, {
      cause: error,
    });
  }
  return data.id;
}

export async function updateBerth(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  berthId: string,
  input: BerthInput,
) {
  const { data, error } = await supabase
    .from("berths")
    .update(berthRecord(input))
    .eq("id", berthId)
    .eq("marina_id", marinaId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new BerthRepositoryError("Unable to update berth.", error.code, {
      cause: error,
    });
  }
  return Boolean(data);
}

export async function updateBerthStatus(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  berthId: string,
  status: BerthStatus,
) {
  const { data, error } = await supabase
    .from("berths")
    .update({ status })
    .eq("id", berthId)
    .eq("marina_id", marinaId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new BerthRepositoryError("Unable to update berth status.", error.code, {
      cause: error,
    });
  }
  return Boolean(data);
}
