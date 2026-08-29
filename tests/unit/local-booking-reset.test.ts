import { describe, expect, it } from "vitest";
// The development utility is native ESM JavaScript and intentionally lives outside the app bundle.
// @ts-expect-error No declaration file is needed for this script-only module.
import { assertLocalSupabaseUrl, buildResetSql, parseBookingTarget } from "../../scripts/reset-local-test-booking.mjs";

describe("local booking reset utility", () => {
  it.each([
    "https://project.supabase.co",
    "http://192.168.1.50:54321",
    "file:///tmp/database",
  ])("refuses a non-local Supabase URL: %s", (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/refusing/i);
  });

  it.each(["http://127.0.0.1:54321", "http://localhost:54321"])(
    "accepts an HTTP loopback Supabase URL: %s",
    (url) => expect(assertLocalSupabaseUrl(url).origin).toBe(url),
  );

  it("requires one injection-safe explicit booking identifier", () => {
    expect(parseBookingTarget("BK-A7C921CB09")).toEqual({ kind: "reference", value: "BK-A7C921CB09" });
    expect(parseBookingTarget("2539f02d-7158-4cee-8055-22d0acf268ae")).toEqual({
      kind: "id",
      value: "2539f02d-7158-4cee-8055-22d0acf268ae",
    });
    expect(() => parseBookingTarget("BK-A7C921CB09'; drop table bookings; --")).toThrow(/explicit booking/i);
    expect(() => parseBookingTarget("")).toThrow(/explicit booking/i);
  });

  it("limits the bypass to one transaction and one production trigger", () => {
    const sql = buildResetSql(parseBookingTarget("BK-A7C921CB09"));
    expect(sql).toContain("lock table public.bookings in access exclusive mode");
    expect(sql).toContain("disable trigger bookings_enforce_operational_transition");
    expect(sql).toContain("enable trigger bookings_enforce_operational_transition");
    expect(sql).toContain("where bookings.id = (select id from local_booking_reset_target)");
    expect(sql).not.toContain("disable trigger all");
    expect(sql.trim().endsWith("commit;")).toBe(true);
  });
});
