import { notFound } from "next/navigation";
import { updatePricingConfigurationAction } from "@/app/dashboard/settings/pricing/actions";
import { AppShell } from "@/components/app-shell";
import { PricingConfigurationForm } from "@/components/pricing/pricing-configuration-form";
import { loadPricingConfiguration } from "@/domain/pricing/repository";
import type { PricingConfigurationInput } from "@/domain/pricing/types";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pricing configuration" };

const EMPTY_CONFIGURATION: PricingConfigurationInput = {
  currency: "EUR",
  model: "per_meter",
  taxBehavior: "exclusive",
  taxRateBps: 0,
  seasons: [{ name: "Base rate", startsOn: "", endsOn: "", meterRateMinor: 0, lengthRates: [] }],
  fees: [],
};

export default async function PricingSettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings/pricing");
  if (context.role !== "marina_admin") notFound();
  const configuration = await loadPricingConfiguration(await createClient(), context.marinaId);
  const initialConfiguration: PricingConfigurationInput = configuration
    ? {
        currency: configuration.currency,
        model: configuration.model,
        taxBehavior: configuration.taxBehavior,
        taxRateBps: configuration.taxRateBps,
        seasons: configuration.seasons.map((season) => ({
          name: season.name,
          startsOn: season.startsOn,
          endsOn: season.endsOn,
          meterRateMinor: season.meterRateMinor,
          lengthRates: season.lengthRates,
        })),
        fees: configuration.fees,
      }
    : EMPTY_CONFIGURATION;
  const expectedUpdatedAt = configuration?.updatedAt ?? null;
  const action = updatePricingConfigurationAction.bind(null, expectedUpdatedAt);

  return (
    <AppShell context={context} description="Tenant-scoped berth rates, seasons, required fees, and VAT/tax behavior." title="Pricing configuration" wide>
      <PricingConfigurationForm
        action={action}
        configurationVersion={expectedUpdatedAt ?? "new"}
        initialConfiguration={initialConfiguration}
      />
    </AppShell>
  );
}
