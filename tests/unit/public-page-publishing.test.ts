import { describe, expect, it } from "vitest";
import type { IntegrationStatus, ReadinessState } from "@/domain/integration-status/types";
import { buildPublicationReadiness, integrationsAllowPublishing } from "@/domain/public-page-publishing/model";

const profile = {
  id: "marina-a",
  name: "Marina A",
  slug: "marina-a",
  timezone: "Europe/Riga",
  publicDescription: "A public marina description.",
  isPublic: false,
  updatedAt: "2026-09-04T12:00:00.000Z",
};

function integrations(states: [ReadinessState, ReadinessState, ReadinessState]): IntegrationStatus {
  const readiness = (state: ReadinessState) => ({ state, mode: "Test", checks: [], missingRequiredEnvironment: [] });
  return {
    stripe: readiness(states[0]),
    postmark: readiness(states[1]),
    worker: readiness(states[2]),
    health: {
      stripeWebhookEventCount: 0, latestStripeWebhookAt: null, latestStripeWebhookOutcome: null,
      pendingPaymentCount: 0, failedPaymentCount: 0, pendingNotificationCount: 0,
      processingNotificationCount: 0, failedNotificationCount: 0, sentNotificationCount: 0,
      latestNotificationAttemptAt: null, latestNotificationAttemptOutcome: null,
    },
  };
}

const pricing = {
  currency: "EUR",
  model: "per_meter" as const,
  taxBehavior: "exclusive" as const,
  taxRateBps: 2100,
  fees: [],
  seasons: [{ id: "summer", name: "Summer", startsOn: "2026-06-01", endsOn: "2026-10-01", lengthRates: [], meterRateMinor: 300 }],
  updatedAt: "2026-09-04T12:00:00.000Z",
};

describe("public page publishing readiness", () => {
  it("allows a complete profile, complete engine pricing, and integration warnings", () => {
    const status = integrations(["warning", "ready", "warning"]);
    const result = buildPublicationReadiness({ profile, pricing, integrations: status });
    expect(result.ready).toBe(true);
    expect(integrationsAllowPublishing(status)).toBe(true);
  });

  it("blocks a missing public description", () => {
    const result = buildPublicationReadiness({
      profile: { ...profile, publicDescription: " " },
      pricing,
      integrations: integrations(["ready", "ready", "ready"]),
    });
    expect(result.ready).toBe(false);
    expect(result.items.find((item) => item.key === "profile")?.state).toBe("not_ready");
  });

  it("blocks absent or structurally incomplete pricing", () => {
    const status = integrations(["ready", "ready", "ready"]);
    expect(buildPublicationReadiness({ profile, pricing: null, integrations: status }).ready).toBe(false);
    expect(buildPublicationReadiness({
      profile,
      pricing: { ...pricing, seasons: [{ ...pricing.seasons[0], meterRateMinor: null }] },
      integrations: status,
    }).ready).toBe(false);
  });

  it.each([0, 1, 2])("blocks each not-ready integration at index %s", (index) => {
    const states: [ReadinessState, ReadinessState, ReadinessState] = ["ready", "ready", "ready"];
    states[index] = "not_ready";
    const status = integrations(states);
    expect(integrationsAllowPublishing(status)).toBe(false);
    expect(buildPublicationReadiness({ profile, pricing, integrations: status }).ready).toBe(false);
  });
});

