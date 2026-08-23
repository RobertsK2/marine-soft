import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingCatalog, PricingSeason } from "@/domain/pricing/types";
import type { Database } from "@/types/database";

export class PricingRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PricingRepositoryError";
  }
}

export async function loadPricingCatalog(
  supabase: SupabaseClient<Database>,
  marinaId: string,
): Promise<PricingCatalog | null> {
  const [configResult, seasonsResult, lengthRatesResult, meterRatesResult, feesResult] =
    await Promise.all([
      supabase
        .from("marina_pricing_configs")
        .select("currency, model, tax_behavior, tax_rate_bps")
        .eq("marina_id", marinaId)
        .maybeSingle(),
      supabase
        .from("pricing_seasons")
        .select("id, name, starts_on, ends_on")
        .eq("marina_id", marinaId)
        .order("starts_on"),
      supabase
        .from("pricing_season_length_rates")
        .select("season_id, min_length_m, max_length_m, nightly_rate_minor")
        .eq("marina_id", marinaId)
        .order("min_length_m"),
      supabase
        .from("pricing_season_meter_rates")
        .select("season_id, nightly_rate_per_meter_minor")
        .eq("marina_id", marinaId),
      supabase
        .from("marina_mandatory_fees")
        .select("name, fee_type, amount_minor, percentage_bps")
        .eq("marina_id", marinaId)
        .order("sort_order")
        .order("name"),
    ]);

  const error =
    configResult.error ??
    seasonsResult.error ??
    lengthRatesResult.error ??
    meterRatesResult.error ??
    feesResult.error;
  if (error) {
    throw new PricingRepositoryError("Unable to load marina pricing.", {
      cause: error,
    });
  }
  if (!configResult.data) return null;

  const seasons = new Map<string, PricingSeason>(
    (seasonsResult.data ?? []).map((season) => [
      season.id,
      {
        id: season.id,
        name: season.name,
        startsOn: season.starts_on,
        endsOn: season.ends_on,
        lengthRates: [],
        meterRateMinor: null,
      },
    ]),
  );

  for (const rate of lengthRatesResult.data ?? []) {
    seasons.get(rate.season_id)?.lengthRates.push({
      minLengthM: rate.min_length_m,
      maxLengthM: rate.max_length_m,
      nightlyRateMinor: rate.nightly_rate_minor,
    });
  }
  for (const rate of meterRatesResult.data ?? []) {
    const season = seasons.get(rate.season_id);
    if (season) season.meterRateMinor = rate.nightly_rate_per_meter_minor;
  }

  return {
    currency: configResult.data.currency,
    model: configResult.data.model,
    taxBehavior: configResult.data.tax_behavior,
    taxRateBps: configResult.data.tax_rate_bps,
    seasons: [...seasons.values()],
    fees: (feesResult.data ?? []).map((fee) => ({
      name: fee.name,
      type: fee.fee_type,
      amountMinor: fee.amount_minor,
      percentageBps: fee.percentage_bps,
    })),
  };
}
