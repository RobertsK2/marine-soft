import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { captureServerError } from "@/lib/monitoring/server";

describe("server error monitoring", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
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
});
