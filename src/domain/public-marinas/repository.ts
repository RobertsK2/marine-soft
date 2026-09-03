import type { SupabaseClient } from "@supabase/supabase-js";
import { safeBrandColor } from "@/domain/public-marinas/model";
import type { PublicMarina } from "@/domain/public-marinas/types";
import type { Database } from "@/types/database";

const PUBLIC_MARINA_COLUMNS =
  "name, slug, timezone, logo_url, cover_image_url, map_image_url, primary_color, public_description, public_description_local, local_language, contact_email, contact_phone, website_url" as const;

export class PublicMarinaRepositoryError extends Error {
  constructor(options?: ErrorOptions) {
    super("Unable to load the public marina profile.", options);
    this.name = "PublicMarinaRepositoryError";
  }
}

export async function getPublicMarinaBySlug(
  supabase: SupabaseClient<Database>,
  slug: string,
): Promise<PublicMarina | null> {
  const { data, error } = await supabase
    .from("marinas")
    .select(PUBLIC_MARINA_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new PublicMarinaRepositoryError({ cause: error });
  }
  if (!data) return null;

  return {
    contactEmail: data.contact_email,
    contactPhone: data.contact_phone,
    coverImageUrl: data.cover_image_url,
    localLanguage: data.local_language,
    localText: data.public_description_local,
    logoUrl: data.logo_url,
    mapImageUrl: data.map_image_url,
    name: data.name,
    primaryColor: safeBrandColor(data.primary_color),
    publicText: data.public_description,
    slug: data.slug,
    timezone: data.timezone,
    websiteUrl: data.website_url,
  };
}
