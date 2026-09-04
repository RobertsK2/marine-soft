import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import * as Sentry from "@sentry/nextjs";
import { captureServerError, serializeServerError } from "@/lib/monitoring/server";

describe("server error monitoring", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    vi.clearAllMocks();
  });

  it("preserves an Error message and its original cause", () => {
    const original = new Error("SUPABASE_SECRET_KEY is not configured.");
    const wrapped = new Error("Public availability failed.", { cause: original });

    expect(serializeServerError(wrapped)).toMatchObject({
      name: "Error",
      message: "Public availability failed.",
      cause: {
        name: "Error",
        message: "SUPABASE_SECRET_KEY is not configured.",
      },
    });
  });

  it("keeps safe Supabase error fields from non-Error objects", () => {
    expect(
      serializeServerError({
        message: "Query failed.",
        code: "PGRST000",
        details: "Connection unavailable.",
        hint: "Retry later.",
        secret: "must-not-be-logged",
      }),
    ).toEqual({
      name: "NonErrorThrown",
      message: "Query failed.",
      code: "PGRST000",
      details: "Connection unavailable.",
      hint: "Retry later.",
    });
  });

  it("sends a controlled server exception and safe context to Sentry when configured", () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.ingest.sentry.io/1";
    const error = new Error("Controlled pilot verification error");

    captureServerError(error, { operation: "pilot_monitoring_verification" });

    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      extra: { operation: "pilot_monitoring_verification" },
    });
  });
});
