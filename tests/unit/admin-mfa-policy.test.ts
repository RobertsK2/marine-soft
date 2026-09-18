import { describe, expect, it } from "vitest";
import { needsAdminMfa } from "@/lib/auth/mfa-policy";

describe("marina admin MFA policy", () => {
  it("requires AAL2 for admins in production and for local policy verification", () => {
    expect(needsAdminMfa("marina_admin", "aal1", { NODE_ENV: "production" })).toBe(true);
    expect(needsAdminMfa("marina_admin", undefined, { NODE_ENV: "production" })).toBe(true);
    expect(needsAdminMfa("marina_admin", "aal2", { NODE_ENV: "production" })).toBe(false);
    expect(needsAdminMfa("marina_admin", "aal1", { NODE_ENV: "test", BERTHIO_REQUIRE_ADMIN_MFA: "true" })).toBe(true);
    expect(needsAdminMfa("marina_staff", "aal1", { NODE_ENV: "production" })).toBe(false);
  });
});
