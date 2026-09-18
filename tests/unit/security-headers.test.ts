import { describe, expect, it } from "vitest";
import { securityHeaders } from "@/lib/security/headers";

function header(name: string, environment: NodeJS.ProcessEnv) {
  return securityHeaders(environment).find((item) => item.key === name)?.value;
}

describe("security headers", () => {
  it("constrains framing and resources while allowing configured providers", () => {
    const environment = {
      NODE_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "https://pilot.berthio.example",
      NEXT_PUBLIC_SUPABASE_URL: "https://pilot.supabase.co",
      NEXT_PUBLIC_SENTRY_DSN: "https://public@o1.ingest.sentry.io/1",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    } as const;
    const csp = header("Content-Security-Policy", environment);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self' https://pilot.supabase.co wss://pilot.supabase.co https://o1.ingest.sentry.io https://eu.i.posthog.com");
    expect(csp).toContain("https://eu-assets.i.posthog.com");
    expect(csp).toContain("https://js.stripe.com");
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(header("Strict-Transport-Security", environment)).toBe("max-age=31536000");
    expect(header("X-Content-Type-Options", environment)).toBe("nosniff");
    expect(header("X-Frame-Options", environment)).toBe("DENY");
  });

  it("does not send HSTS or upgrade local HTTP traffic", () => {
    const environment = { NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" } as const;
    expect(header("Strict-Transport-Security", environment)).toBeUndefined();
    expect(header("Content-Security-Policy", environment)).not.toContain("upgrade-insecure-requests");
  });
});
