import { describe, expect, it } from "vitest";
import {
  resolveAuthCallbackDestination,
  isMarinaRole,
  isProtectedPath,
  isSafeDashboardPath,
  resolveDashboardDestination,
} from "@/lib/auth/authorization";

describe("route classification", () => {
  it("keeps public and future routes public", () => {
    expect(isProtectedPath("/")).toBe(false);
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/auth/callback")).toBe(false);
    expect(isProtectedPath("/marina/riga-city")).toBe(false);
  });

  it("protects only the dashboard tree in Phase 2", () => {
    expect(isProtectedPath("/dashboard")).toBe(true);
    expect(isProtectedPath("/dashboard/settings")).toBe(true);
    expect(isProtectedPath("/bookings")).toBe(false);
  });
});

describe("marina roles", () => {
  it("accepts the two Phase 2 roles", () => {
    expect(isMarinaRole("marina_admin")).toBe(true);
    expect(isMarinaRole("marina_staff")).toBe(true);
  });

  it("rejects unimplemented roles", () => {
    expect(isMarinaRole("operator")).toBe(false);
    expect(isMarinaRole("boater")).toBe(false);
    expect(isMarinaRole(null)).toBe(false);
  });
});

describe("safe dashboard redirects", () => {
  it.each(["/dashboard", "/dashboard/settings", "/dashboard?tab=overview"])(
    "accepts dashboard path %s",
    (path) => expect(isSafeDashboardPath(path)).toBe(true),
  );

  it.each([
    "/",
    "/bookings",
    "https://attacker.example",
    "//attacker.example",
    "/%5cattacker.example",
    "/%255cattacker.example",
    "/%0d%0aLocation:https://attacker.example",
    "dashboard",
  ])("rejects unsafe or out-of-scope path %s", (path) => {
    expect(isSafeDashboardPath(path)).toBe(false);
  });

  it("falls back to the dashboard", () => {
    expect(resolveDashboardDestination("/dashboard/settings")).toBe(
      "/dashboard/settings",
    );
    expect(resolveDashboardDestination("https://attacker.example")).toBe(
      "/dashboard",
    );
  });

  it("allows only the password-reset route outside the dashboard after auth", () => {
    expect(resolveAuthCallbackDestination("/reset-password")).toBe(
      "/reset-password",
    );
    expect(resolveAuthCallbackDestination("/bookings")).toBe("/dashboard");
    expect(resolveAuthCallbackDestination("//attacker.example")).toBe(
      "/dashboard",
    );
  });
});
