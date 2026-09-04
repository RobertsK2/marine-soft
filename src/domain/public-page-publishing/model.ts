import type { IntegrationStatus, ReadinessState } from "@/domain/integration-status/types";
import type { PricingConfiguration } from "@/domain/pricing/types";
import type { PublicationProfile, PublicationReadiness } from "@/domain/public-page-publishing/types";

function integrationDetail(name: string, state: ReadinessState) {
  if (state === "ready") return `${name} is configured for the current environment.`;
  if (state === "warning") return `${name} has a non-blocking environment warning. Review it before production use.`;
  return `${name} has required configuration missing or invalid.`;
}

export function integrationsAllowPublishing(status: IntegrationStatus) {
  return [status.stripe.state, status.postmark.state, status.worker.state]
    .every((state) => state !== "not_ready");
}

export function buildPublicationReadiness({
  profile,
  pricing,
  integrations,
}: {
  profile: PublicationProfile;
  pricing: PricingConfiguration | null;
  integrations: IntegrationStatus;
}): PublicationReadiness {
  const profileReady = Boolean(
    profile.name.trim()
      && profile.slug.trim()
      && profile.timezone.trim()
      && profile.publicDescription?.trim(),
  );
  const pricingReady = Boolean(
    pricing
      && pricing.seasons.length > 0
      && pricing.seasons.every((season) => pricing.model === "per_meter"
        ? season.meterRateMinor !== null
        : season.lengthRates.length > 0),
  );

  const items = [
    {
      key: "profile" as const,
      label: "Public marina profile",
      state: profileReady ? "ready" as const : "not_ready" as const,
      detail: profileReady
        ? "Name, public slug, timezone, and public description are present."
        : "Add a name, public slug, supported timezone, and public description.",
      href: "/dashboard/settings",
    },
    {
      key: "pricing" as const,
      label: "Booking pricing",
      state: pricingReady ? "ready" as const : "not_ready" as const,
      detail: pricingReady
        ? "The existing pricing engine has a base configuration and a rate for every season."
        : "Configure base pricing and at least one complete seasonal rate.",
      href: "/dashboard/settings/pricing",
    },
    ...([
      ["stripe", "Stripe Connect", integrations.stripe.state],
      ["postmark", "Postmark", integrations.postmark.state],
      ["worker", "Notification worker", integrations.worker.state],
    ] as const).map(([key, label, state]) => ({
      key,
      label,
      state,
      detail: integrationDetail(label, state),
      href: "/dashboard/settings/integrations",
    })),
  ];

  return {
    ready: items.every((item) => item.state !== "not_ready"),
    items,
  };
}

