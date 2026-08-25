import { afterEach, describe, expect, it, vi } from "vitest";
import { isStripeLocalPlatformFallbackEnabled } from "@/lib/env";

function configureSafeLocalFallback() {
  vi.stubEnv("STRIPE_LOCAL_PLATFORM_FALLBACK", "true");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_localguard");
}

describe("Stripe local platform fallback environment guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless explicitly enabled", () => {
    vi.stubEnv("STRIPE_LOCAL_PLATFORM_FALLBACK", "false");
    expect(isStripeLocalPlatformFallbackEnabled()).toBe(false);
  });

  it("allows only the explicit non-production localhost test-mode combination", () => {
    configureSafeLocalFallback();
    expect(isStripeLocalPlatformFallbackEnabled()).toBe(true);
  });

  it.each([
    ["NODE_ENV", "production"],
    ["NEXT_PUBLIC_SITE_URL", "https://berthio.example"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co"],
    ["STRIPE_SECRET_KEY", "sk_live_forbidden"],
  ])("fails closed when %s is unsafe", (name, value) => {
    configureSafeLocalFallback();
    vi.stubEnv(name, value);
    expect(() => isStripeLocalPlatformFallbackEnabled()).toThrow(/requires non-production localhost URLs/);
  });
});
