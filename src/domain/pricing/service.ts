import "server-only";
import type { PublicBookingSearch } from "@/domain/public-booking/types";
import { calculatePriceSnapshot } from "@/domain/pricing/model";
import { loadPricingCatalog } from "@/domain/pricing/repository";
import type { PublicPriceQuote } from "@/domain/pricing/types";
import { createPrivilegedClient } from "@/lib/supabase/privileged";

export class PublicPricingServiceError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PublicPricingServiceError";
  }
}

export async function getPublicPriceQuote(
  marinaSlug: string,
  search: PublicBookingSearch,
): Promise<PublicPriceQuote | null> {
  const supabase = createPrivilegedClient();
  const { data: marina, error } = await supabase
    .from("marinas")
    .select("id")
    .eq("slug", marinaSlug)
    .eq("is_public", true)
    .maybeSingle();

  if (error) {
    throw new PublicPricingServiceError("Unable to resolve public marina pricing scope.", {
      cause: error,
    });
  }
  if (!marina) return null;

  try {
    const catalog = await loadPricingCatalog(supabase, marina.id);
    return catalog ? calculatePriceSnapshot(search, catalog) : null;
  } catch (pricingError) {
    throw new PublicPricingServiceError("Unable to calculate public marina pricing.", {
      cause: pricingError,
    });
  }
}
