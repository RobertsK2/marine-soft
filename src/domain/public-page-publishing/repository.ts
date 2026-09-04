import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadIntegrationStatus } from "@/domain/integration-status/repository";
import { loadPricingConfiguration } from "@/domain/pricing/repository";
import { buildPublicationReadiness } from "@/domain/public-page-publishing/model";
import type { PublicationProfile } from "@/domain/public-page-publishing/types";
import type { Database } from "@/types/database";

export class PublicationRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublicationRepositoryError";
  }
}

export async function loadPublicationSettings(
  supabase: SupabaseClient<Database>,
  marinaId: string,
) {
  const [profileResult, pricing, integrations] = await Promise.all([
    supabase
      .from("marinas")
      .select("id, name, slug, timezone, public_description, is_public, updated_at")
      .eq("id", marinaId)
      .maybeSingle(),
    loadPricingConfiguration(supabase, marinaId),
    loadIntegrationStatus(supabase, marinaId),
  ]);
  if (profileResult.error) {
    throw new PublicationRepositoryError("Unable to load publication settings.", {
      cause: profileResult.error,
    });
  }
  if (!profileResult.data) throw new PublicationRepositoryError("Marina publication settings were not found.");

  const profile: PublicationProfile = {
    id: profileResult.data.id,
    name: profileResult.data.name,
    slug: profileResult.data.slug,
    timezone: profileResult.data.timezone,
    publicDescription: profileResult.data.public_description,
    isPublic: profileResult.data.is_public,
    updatedAt: profileResult.data.updated_at,
  };
  return {
    profile,
    pricing,
    integrations,
    readiness: buildPublicationReadiness({ profile, pricing, integrations }),
  };
}

