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
    expect(status.postmark.missingRequiredEnvironment).toEqual(["POSTMARK_SERVER_TOKEN", "POSTMARK_FROM_EMAIL"]);
    expect(status.worker.missingRequiredEnvironment).toEqual(["NOTIFICATION_WORKER_SECRET"]);
  });

  it("detects production-ready Stripe, Postmark, and worker configuration", () => {
    const secrets = {
      STRIPE_SECRET_KEY: ["rk", "live", "privatevalue123"].join("_"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_publicvalue123",
      STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec", "privatevalue123"].join("_"),
      POSTMARK_SERVER_TOKEN: "postmark-private-value",
      POSTMARK_FROM_EMAIL: "Berthio <bookings@berthio.example>",
      POSTMARK_MESSAGE_STREAM: "outbound",
      NOTIFICATION_WORKER_SECRET: "worker-private-value-with-more-than-32-bytes",
      NOTIFICATION_WORKER_SCHEDULED: "true",
    };
    const status = buildIntegrationStatus({ environment: secrets, nodeEnvironment: "production", stripeAccountConfigured: true, stripeAccountIsLocalMarker: false, health: emptyHealth });
    expect(status.stripe.state).toBe("ready");
    expect(status.postmark.state).toBe("ready");
    expect(status.worker.state).toBe("ready");
    const serialized = JSON.stringify(status);
    for (const secret of [secrets.STRIPE_SECRET_KEY, secrets.STRIPE_CONNECT_WEBHOOK_SECRET, secrets.POSTMARK_SERVER_TOKEN, secrets.NOTIFICATION_WORKER_SECRET]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("distinguishes guarded local fallback and Postmark test delivery from production readiness", () => {
    const environment = {
      STRIPE_SECRET_KEY: ["sk", "test", "localvalue"].join("_"),
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_localvalue",
      STRIPE_CONNECT_WEBHOOK_SECRET: ["whsec", "localvalue"].join("_"),
      STRIPE_LOCAL_PLATFORM_FALLBACK: "true",
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      POSTMARK_SERVER_TOKEN: "POSTMARK_API_TEST",
      POSTMARK_FROM_EMAIL: "bookings@example.test",
      NOTIFICATION_WORKER_SECRET: "short",
    };
    const status = buildIntegrationStatus({ environment, nodeEnvironment: "development", stripeAccountConfigured: true, stripeAccountIsLocalMarker: true, health: emptyHealth });
    expect(status.stripe.mode).toBe("Local development fallback");
    expect(status.stripe.state).toBe("warning");
    expect(status.postmark.mode).toBe("Test delivery");
    expect(status.postmark.state).toBe("warning");
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
