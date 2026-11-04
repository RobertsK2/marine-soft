function readRequiredPublicValue(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name} is not configured.`);
  }
  return normalized;
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  );
}

export function getSupabaseEnv() {
  return {
    url: readRequiredPublicValue(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: readRequiredPublicValue(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function getDemoBookingUrl() {
  const value = process.env.NEXT_PUBLIC_DEMO_BOOKING_URL?.trim();
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

type SiteEnvironment = Record<string, string | undefined>;

function siteOrigin(value: string | undefined, allowLocal = false) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.replace(/\.$/, "");
    const local = hostname === "localhost" || hostname.endsWith(".localhost") ||
      /^127\./.test(hostname) || hostname === "0.0.0.0" || hostname === "[::1]";
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (local) return allowLocal && ["http:", "https:"].includes(url.protocol) ? url.origin : null;
    return url.protocol === "https:" && hostname.includes(".") ? url.origin : null;
  } catch {
    return null;
  }
}

function vercelOrigin(host: string | undefined) {
  // Vercel system variables contain a hostname, without a scheme or path.
  return host?.trim() ? siteOrigin(`https://${host.trim()}`) : null;
}

export function resolveSiteUrl(environment: SiteEnvironment) {
  const vercelEnvironment = environment.VERCEL_ENV?.trim();
  const onVercel = environment.VERCEL === "1" || Boolean(environment.VERCEL_URL) ||
    Boolean(vercelEnvironment && vercelEnvironment !== "development");
  const deployed = onVercel && vercelEnvironment !== "development";
  if (deployed) {
    // A shared canonical setting must never send a Preview guest into Production.
    if (vercelEnvironment !== "production") {
      const preview = vercelOrigin(environment.VERCEL_URL) || vercelOrigin(environment.VERCEL_BRANCH_URL);
      if (preview) return preview;
      throw new Error("A public VERCEL_URL or VERCEL_BRANCH_URL is required for this deployment.");
    }
    const production = siteOrigin(environment.NEXT_PUBLIC_SITE_URL) ||
      vercelOrigin(environment.VERCEL_PROJECT_PRODUCTION_URL) || vercelOrigin(environment.VERCEL_URL);
    if (production) return production;
    throw new Error("A public HTTPS application origin is required for this deployment.");
  }
  // Loopback is explicit configuration for local runs, including local `next
  // start` verification. It is never a fallback for a hosted Vercel deployment.
  const configured = siteOrigin(environment.NEXT_PUBLIC_SITE_URL, true);
  if (configured) return configured;
  throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS origin (or an explicit local origin for local runs).");
}

export function getSiteUrl() {
  // Read the server environment at call time rather than baking a NEXT_PUBLIC_
  // value into redirect URLs. Callers never derive destinations from Host input.
  return resolveSiteUrl(process.env);
}

export function getGuestAccessSigningSecret() {
  const value = (
    process.env.GUEST_ACCESS_SIGNING_SECRET
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  )?.trim();
  if (!value || Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("GUEST_ACCESS_SIGNING_SECRET must contain at least 32 bytes.");
  }
  return value;
}

export function getStripeServerEnv() {
  return {
    secretKey: readRequiredPublicValue("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
    webhookSecret: readRequiredPublicValue("STRIPE_CONNECT_WEBHOOK_SECRET", process.env.STRIPE_CONNECT_WEBHOOK_SECRET),
  };
}

export function isStripeLocalPlatformFallbackEnabled() {
  if (process.env.STRIPE_LOCAL_PLATFORM_FALLBACK?.trim() !== "true") return false;

  const siteUrl = new URL(readRequiredPublicValue("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL));
  const supabaseUrl = new URL(readRequiredPublicValue("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL));
  const secretKey = readRequiredPublicValue("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY);
  const localHosts = new Set(["localhost", "127.0.0.1"]);
  const safe = process.env.NODE_ENV !== "production"
    && siteUrl.protocol === "http:" && localHosts.has(siteUrl.hostname)
    && supabaseUrl.protocol === "http:" && localHosts.has(supabaseUrl.hostname)
    && /^sk_test_[A-Za-z0-9]+$/.test(secretKey);

  if (!safe) {
    throw new Error("STRIPE_LOCAL_PLATFORM_FALLBACK requires non-production localhost URLs and a Stripe test-mode secret key.");
  }
  return true;
}
