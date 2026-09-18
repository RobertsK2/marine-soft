function configuredOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
      ? url.origin : null;
  } catch {
    return null;
  }
}

export function securityHeaders(environment: NodeJS.ProcessEnv) {
  const production = environment.NODE_ENV === "production";
  const supabase = configuredOrigin(environment.NEXT_PUBLIC_SUPABASE_URL);
  const sentry = configuredOrigin(environment.NEXT_PUBLIC_SENTRY_DSN);
  const posthog = environment.NEXT_PUBLIC_POSTHOG_KEY
    ? configuredOrigin(environment.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com") : null;
  const posthogAssets = posthog === "https://eu.i.posthog.com" ? "https://eu-assets.i.posthog.com" : posthog;
  const supabaseSocket = supabase ? supabase.replace(/^http/, "ws") : null;
  const connect = ["'self'", supabase, supabaseSocket, sentry, posthog, posthogAssets, "https://api.stripe.com"].filter(Boolean).join(" ");
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"} https://js.stripe.com${posthog ? ` ${posthog} ${posthogAssets}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src https://checkout.stripe.com https://js.stripe.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.stripe.com",
    "frame-ancestors 'none'",
    ...(production && configuredOrigin(environment.NEXT_PUBLIC_SITE_URL)?.startsWith("https:") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    { key: "X-Frame-Options", value: "DENY" },
    ...(production && configuredOrigin(environment.NEXT_PUBLIC_SITE_URL)?.startsWith("https:")
      ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
  ];
}
