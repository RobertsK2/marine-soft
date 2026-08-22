import { describe, expect, it } from "vitest";
import { serializeServerError } from "@/lib/monitoring/server";

describe("server error monitoring", () => {
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
});
