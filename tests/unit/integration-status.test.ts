import { describe, expect, it } from "vitest";
import { buildIntegrationStatus } from "@/domain/integration-status/model";

const emptyHealth = {
  stripeWebhookEventCount: 0,
  latestStripeWebhookAt: null,
  latestStripeWebhookOutcome: null,
  pendingPaymentCount: 0,
  failedPaymentCount: 0,
  pendingNotificationCount: 0,
  processingNotificationCount: 0,
  failedNotificationCount: 0,
  sentNotificationCount: 0,
  latestNotificationAttemptAt: null,
  latestNotificationAttemptOutcome: null,
};

describe("integration readiness", () => {
  it("reports missing required configuration without returning secret values", () => {
    const status = buildIntegrationStatus({ environment: {}, nodeEnvironment: "production", stripeAccountConfigured: false, stripeAccountIsLocalMarker: false, health: emptyHealth });
    expect(status.stripe.state).toBe("not_ready");
    expect(status.stripe.missingRequiredEnvironment).toEqual(["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_CONNECT_WEBHOOK_SECRET"]);
    expect(status.email.missingRequiredEnvironment).toEqual(["RESEND_API_KEY", "EMAIL_FROM"]);
    expect(status.worker.missingRequiredEnvironment).toEqual(["NOTIFICATION_WORKER_SECRET"]);
  });

  it("detects production-ready Stripe, Resend, and worker configuration", () => {
    const secrets = {
      STRIPE_SECRET_KEY: ["rk", "live", "privatevalue123"].join("_"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_publicvalue123",
      STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec", "privatevalue123"].join("_"),
      RESEND_API_KEY: "re_private_value",
      EMAIL_FROM: "Berthio <bookings@berthio.example>",
      NOTIFICATION_WORKER_SECRET: "worker-private-value-with-more-than-32-bytes",
      NOTIFICATION_WORKER_SCHEDULED: "true",
    };
    const status = buildIntegrationStatus({ environment: secrets, nodeEnvironment: "production", stripeAccountConfigured: true, stripeAccountIsLocalMarker: false, health: emptyHealth });
    expect(status.stripe.state).toBe("ready");
    expect(status.email.state).toBe("ready");
    expect(status.worker.state).toBe("ready");
    const serialized = JSON.stringify(status);
    for (const secret of [secrets.STRIPE_SECRET_KEY, secrets.STRIPE_CONNECT_WEBHOOK_SECRET, secrets.RESEND_API_KEY, secrets.NOTIFICATION_WORKER_SECRET]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("distinguishes guarded local fallback from email delivery readiness", () => {
    const environment = {
      STRIPE_SECRET_KEY: ["sk", "test", "localvalue"].join("_"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_localvalue",
      STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec", "localvalue"].join("_"),
      STRIPE_LOCAL_PLATFORM_FALLBACK: "true",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      RESEND_API_KEY: "invalid_key",
      EMAIL_FROM: "bookings@example.test",
      NOTIFICATION_WORKER_SECRET: "short",
    };
    const status = buildIntegrationStatus({ environment, nodeEnvironment: "development", stripeAccountConfigured: true, stripeAccountIsLocalMarker: true, health: emptyHealth });
    expect(status.stripe.mode).toBe("Local development fallback");
    expect(status.stripe.state).toBe("warning");
    expect(status.email.mode).toBe("Resend delivery");
    expect(status.email.state).toBe("not_ready");
    expect(status.worker.state).toBe("warning");
  });

  it("rejects a local fallback outside its existing safety conditions", () => {
    const status = buildIntegrationStatus({
      environment: {
        STRIPE_SECRET_KEY: ["sk", "test", "localvalue"].join("_"),
        NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_localvalue",
        STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec", "localvalue"].join("_"),
        STRIPE_LOCAL_PLATFORM_FALLBACK: "true",
        NEXT_PUBLIC_SITE_URL: "https://berthio.example",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      },
      nodeEnvironment: "production",
      stripeAccountConfigured: true,
      stripeAccountIsLocalMarker: true,
      health: emptyHealth,
    });
    expect(status.stripe.mode).toBe("Invalid local fallback");
    expect(status.stripe.state).toBe("not_ready");
  });
});
