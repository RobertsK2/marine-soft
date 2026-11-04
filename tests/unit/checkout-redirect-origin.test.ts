import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteUrl, resolveSiteUrl } from "@/lib/env";
import { buildCheckoutSessionParams } from "@/domain/checkout/model";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));
import { issueGuestManagementUrl, verifyGuestAccessToken } from "@/domain/guest-access/service";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

const preview = {
  NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview",
  VERCEL_URL: "berthio-preview-123.vercel.app",
  VERCEL_PROJECT_PRODUCTION_URL: "berthio.example",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

const scenarios = [
  { name: "Preview overrides a copied localhost setting", env: preview, origin: "https://berthio-preview-123.vercel.app" },
  { name: "Preview does not send guests to Production", env: { ...preview, NEXT_PUBLIC_SITE_URL: "https://berthio.example" }, origin: "https://berthio-preview-123.vercel.app" },
  { name: "Preview supports a branch host fallback", env: { ...preview, VERCEL_URL: "", VERCEL_BRANCH_URL: "berthio-git-feature.vercel.app" }, origin: "https://berthio-git-feature.vercel.app" },
  { name: "Production prefers its configured custom domain", env: { ...preview, VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://marinas.example/" }, origin: "https://marinas.example" },
  { name: "Production rejects a stale local setting and uses the project domain", env: { ...preview, VERCEL_ENV: "production" }, origin: "https://berthio.example" },
  { name: "Production falls back to the active deployment when needed", env: { ...preview, VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "" }, origin: "https://berthio-preview-123.vercel.app" },
  { name: "Custom Vercel environments stay on their own deployment", env: { ...preview, VERCEL_ENV: "staging" }, origin: "https://berthio-preview-123.vercel.app" },
  { name: "Missing VERCEL_ENV still resolves to the active hosted URL", env: { ...preview, VERCEL_ENV: "" }, origin: "https://berthio-preview-123.vercel.app" },
  { name: "Local development remains explicit", env: { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" }, origin: "http://localhost:3000" },
  { name: "Local production-build verification remains supported", env: { NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000" }, origin: "http://127.0.0.1:3000" },
];

describe("deployment-owned Checkout redirect URLs", () => {
  it.each(scenarios)("$name", ({ env, origin }) => {
    const siteUrl = resolveSiteUrl(env);
    expect(siteUrl).toBe(origin);
    const params = buildCheckoutSessionParams({
      siteUrl, marinaSlug: "marina/a", marinaName: "Test marina", holdToken: "hold-token",
      paymentId: "payment-id", amountTotalMinor: 9272, currency: "EUR", integrationIdentifier: "berthio_phase6_abcdefgh",
    });
    expect(params.success_url).toBe(`${origin}/marina/marina%2Fa/checkout/return?session_id={CHECKOUT_SESSION_ID}`);
    expect(params.cancel_url).toBe(`${origin}/marina/marina%2Fa?checkout=cancelled#booking-entry`);
    expect(params.metadata).toEqual({ hold_token: "hold-token", payment_id: "payment-id" });
    expect(params.line_items?.[0]).toMatchObject({ price_data: { unit_amount: 9272, currency: "eur" } });
  });

  it.each(["http://localhost:3000", "https://localhost", "https://127.0.0.1", "https://127.1", "https://[::1]", "https://localhost.", "https://guest.localhost", "https://0.0.0.0"])("never emits a deployed loopback origin: %s", (local) => {
    expect(resolveSiteUrl({ ...preview, VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: local })).toBe("https://berthio.example");
    expect(() => resolveSiteUrl({ ...preview, VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: local, VERCEL_URL: "localhost:3000", VERCEL_PROJECT_PRODUCTION_URL: "" })).toThrow();
  });

  it("fails closed when Preview lacks an active public host, even with a Production URL", () => {
    expect(() => resolveSiteUrl({ ...preview, VERCEL_URL: "", NEXT_PUBLIC_SITE_URL: "https://berthio.example" })).toThrow(/VERCEL_URL/);
    expect(() => resolveSiteUrl({ VERCEL: "1", NEXT_PUBLIC_SITE_URL: "http://localhost:3000" })).toThrow();
    expect(() => resolveSiteUrl({})).toThrow();
  });

  it.each(["https://user:password@example.test", "https://example.test/path", "https://example.test?next=bad", "https://example.test#bad", "http://example.test", "//example.test"])("rejects invalid origin configuration: %s", (value) => {
    expect(() => resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: value })).toThrow();
  });

  it("reads the runtime deployment environment and retains the exact signed guest token", async () => {
    for (const key of ["VERCEL", "VERCEL_ENV", "VERCEL_URL", "VERCEL_PROJECT_PRODUCTION_URL", "NEXT_PUBLIC_SITE_URL"]) {
      vi.stubEnv(key, preview[key as keyof typeof preview]);
    }
    vi.stubEnv("GUEST_ACCESS_SIGNING_SECRET", "origin-regression-signing-secret-with-more-than-32-bytes");
    mocks.rpc.mockResolvedValue({ data: [{ grant_id: "74000000-0000-4000-8000-000000000001", expires_at: "2099-03-01T12:00:00Z" }], error: null });
    expect(getSiteUrl()).toBe("https://berthio-preview-123.vercel.app");
    const first = new URL((await issueGuestManagementUrl("booking-id"))!);
    vi.stubEnv("VERCEL_URL", "berthio-preview-456.vercel.app");
    const second = new URL((await issueGuestManagementUrl("booking-id"))!);
    expect(first.origin).toBe("https://berthio-preview-123.vercel.app");
    expect(second.origin).toBe("https://berthio-preview-456.vercel.app");
    expect(first.pathname).toBe(second.pathname);
    expect(verifyGuestAccessToken(first.pathname.split("/").at(-1)!)).not.toBeNull();
  });
});
