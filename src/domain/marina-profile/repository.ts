import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MarinaProfile,
  MarinaProfileInput,
} from "@/domain/marina-profile/types";
import type { Database } from "@/types/database";

const MARINA_PROFILE_COLUMNS =
  "id, name, slug, timezone, public_description, public_description_local, local_language, contact_email, contact_phone, website_url, updated_at" as const;

export class MarinaProfileRepositoryError extends Error {
  constructor(readonly code?: string, options?: ErrorOptions) {
    super("Unable to access the marina profile.", options);
    this.name = "MarinaProfileRepositoryError";
  }
}

export async function getMarinaProfile(
  supabase: SupabaseClient<Database>,
  marinaId: string,
): Promise<MarinaProfile | null> {
  const { data, error } = await supabase
    .from("marinas")
    .select(MARINA_PROFILE_COLUMNS)
    .eq("id", marinaId)
    .maybeSingle();

  if (error) {
    throw new MarinaProfileRepositoryError(error.code, { cause: error });
  }
  return data;
}

function profileRecord(input: MarinaProfileInput) {
  return {
    contact_email: input.contactEmail,
    contact_phone: input.contactPhone,
    local_language: input.localLanguage,
    name: input.name,
    public_description: input.publicDescription,
    public_description_local: input.publicDescriptionLocal,
    timezone: input.timezone,
    website_url: input.websiteUrl,
  };
}

export async function updateMarinaProfile(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  expectedUpdatedAt: string,
  input: MarinaProfileInput,
) {
  const { data, error } = await supabase
    .from("marinas")
    .update(profileRecord(input))
    .eq("id", marinaId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();

  if (error) {
    throw new MarinaProfileRepositoryError(error.code, { cause: error });
  }
  return data ? { status: "updated" as const, updatedAt: data.updated_at } : { status: "conflict" as const };
}
