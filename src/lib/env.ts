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

export function getSiteUrl() {
  const value = readRequiredPublicValue("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL);
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development.");
  }
  return url.origin;
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
