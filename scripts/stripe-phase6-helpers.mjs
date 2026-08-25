import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const localHosts = new Set(["127.0.0.1", "localhost"]);

export function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

export function checkEnvironment() {
  const values = {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    stripeWebhookSecret: process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
    stripeLocalPlatformFallback: process.env.STRIPE_LOCAL_PLATFORM_FALLBACK,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  };

  return {
    values,
    checks: [
      ["STRIPE_SECRET_KEY is a test-mode secret key", /^sk_test_[A-Za-z0-9]+$/.test(values.stripeSecretKey ?? "")],
      ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is a test-mode publishable key", /^pk_test_[A-Za-z0-9]+$/.test(values.stripePublishableKey ?? "")],
      ["STRIPE_CONNECT_WEBHOOK_SECRET has the expected signing-secret shape", /^whsec_[A-Za-z0-9]+$/.test(values.stripeWebhookSecret ?? "")],
      ["NEXT_PUBLIC_SUPABASE_URL is configured", isHttpUrl(values.supabaseUrl)],
      ["SUPABASE_SECRET_KEY is configured server-side", Boolean(values.supabaseSecretKey)],
    ],
  };
}

export function isLocalSupabase(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" && localHosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isConnectedAccountId(value) {
  return /^acct_[A-Za-z0-9]+$/.test(value ?? "") && value !== "acct_testmarinaa";
}

export function isTestStripeSecretKey(value) {
  return /^sk_test_[A-Za-z0-9]+$/.test(value ?? "");
}

export function localSiteUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" || !localHosts.has(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isLocalPlatformFallback(values) {
  return values.stripeLocalPlatformFallback === "true"
    && isTestStripeSecretKey(values.stripeSecretKey)
    && isLocalSupabase(values.supabaseUrl)
    && Boolean(localSiteUrl(values.siteUrl));
}

export async function retrieveTestStandardAccount(stripe, accountId) {
  return stripe.v2.core.accounts.retrieve(accountId, {
    include: ["configuration.merchant", "defaults"],
  });
}

export function testStandardAccountChecks(account) {
  const responsibilities = account.defaults?.responsibilities;
  const cardPayments = account.configuration?.merchant?.capabilities?.card_payments;

  return {
    testMode: account.livemode === false,
    open: account.closed !== true,
    fullDashboard: account.dashboard === "full",
    stripeCollectsFees: responsibilities?.fees_collector === "stripe",
    stripeHasNegativeBalanceLiability: responsibilities?.losses_collector === "stripe",
    merchantConfigured: account.applied_configurations.includes("merchant"),
    cardPaymentsActive: cardPayments?.status === "active",
  };
}

export function createStripe(secretKey) {
  return new Stripe(secretKey, { maxNetworkRetries: 1 });
}

export function createAdminClient(url, secretKey) {
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function printCheck(label, passed) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  return passed;
}

export function safeFailure(label, error) {
  const category = typeof error === "object" && error && "type" in error
    ? String(error.type)
    : "verification_error";
  console.error(`FAIL ${label} (${category})`);
  return false;
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
