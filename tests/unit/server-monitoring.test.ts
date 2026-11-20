import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { captureCheckoutFailure, captureServerError } from "@/lib/monitoring/server";

describe("server error monitoring", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not send original messages, causes or caller payloads to Sentry", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const secret = "private-guest-and-provider-payload";
    captureServerError(new Error(secret, { cause: new Error(secret) }), {
      operation: "stripe_connect_webhook",
      eventId: secret,
    });

    const [reported, options] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect(reported).toBeInstanceOf(Error);
    expect((reported as Error).message).toBe("Server operation failed");
    expect(JSON.stringify(options)).not.toContain(secret);
    expect(options).toEqual({ extra: { operation: "stripe_connect_webhook" } });
  });

  it("rejects an unsafe operation label", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    captureServerError("secret", { operation: "secret=private-token" });
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toEqual({ extra: { operation: "unknown" } });
  });

  it("reports only classified Checkout fields to Sentry", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const secret = "private_guest_provider_payload";
    captureCheckoutFailure(Object.assign(new Error(secret), {
      diagnosticStage: "stripe_api",
      cause: { type: "StripeInvalidRequestError", code: "resource_missing", message: secret, requestId: secret },
    }));

    const [reported, options] = vi.mocked(Sentry.captureException).mock.calls[0];
    expect((reported as Error).message).toBe("Server operation failed");
    expect(options).toEqual({ extra: {
      operation: "stripe_checkout_create", stage: "stripe_api",
      category: "stripe_invalid_request", stripeCode: "resource_missing",
    } });
    expect(JSON.stringify(options)).not.toContain(secret);
  });

  it("prints only classified Checkout fields to runtime logs", () => {
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const secret = "private_guest_provider_payload";
    captureCheckoutFailure(Object.assign(new Error(secret), {
      diagnosticStage: "payment_preparation",
      cause: { code: secret, message: secret },
    }));

    expect(log).toHaveBeenCalledExactlyOnceWith("Berthio server error", {
      operation: "stripe_checkout_create", stage: "payment_preparation", category: "database",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
    log.mockRestore();
  });
});
