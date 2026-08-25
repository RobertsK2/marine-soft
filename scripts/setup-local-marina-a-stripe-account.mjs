import {
  checkEnvironment,
  createAdminClient,
  createStripe,
  isConnectedAccountId,
  isLocalSupabase,
  isTestStripeSecretKey,
  localSiteUrl,
  printCheck,
  readArgument,
  retrieveTestStandardAccount,
  safeFailure,
  testStandardAccountChecks,
} from "./stripe-phase6-helpers.mjs";

const MARINA_SLUG = "marina-a";
const MARINA_NAME = "Marina A";
const ACCOUNT_METADATA = {
  berthio_environment: "local",
  berthio_marina_slug: MARINA_SLUG,
  berthio_setup: "phase_6",
};

const requestedAccountId = readArgument("account");
const confirmedAccountId = readArgument("confirm-account");
const { values } = checkEnvironment();
const siteUrl = localSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);

if (!isTestStripeSecretKey(values.stripeSecretKey)) {
  console.error("FAIL STRIPE_SECRET_KEY must be a test-mode key.");
  process.exit(1);
}
if (!siteUrl) {
  console.error("FAIL NEXT_PUBLIC_SITE_URL must be an HTTP localhost or 127.0.0.1 URL.");
  process.exit(1);
}
if (requestedAccountId && !isConnectedAccountId(requestedAccountId)) {
  console.error("FAIL --account must contain a real acct_ identifier.");
  process.exit(1);
}
if (confirmedAccountId && !isConnectedAccountId(confirmedAccountId)) {
  console.error("FAIL --confirm-account must contain the exact acct_ identifier returned by this helper.");
  process.exit(1);
}

try {
  const stripe = createStripe(values.stripeSecretKey);
  let account;
  let reused = false;

  if (requestedAccountId) {
    account = await retrieveTestStandardAccount(stripe, requestedAccountId);
    reused = true;
  } else {
    account = await findReusableAccount(stripe);
    reused = Boolean(account);
  }

  if (!account) {
    account = await stripe.v2.core.accounts.create({
      configuration: {
        merchant: {
          capabilities: { card_payments: { requested: true } },
        },
      },
      dashboard: "full",
      defaults: {
        currency: "eur",
        locales: ["lv-LV", "en-GB"],
        profile: {
          doing_business_as: MARINA_NAME,
          product_description: "Local test checkout for Marina A berth reservations.",
        },
        responsibilities: {
          fees_collector: "stripe",
          losses_collector: "stripe",
        },
      },
      display_name: `${MARINA_NAME} (local test)`,
      identity: { country: "LV" },
      include: ["configuration.merchant", "defaults"],
      metadata: ACCOUNT_METADATA,
    }, { idempotencyKey: "berthio-local-marina-a-standard-v2" });
  }

  const checks = testStandardAccountChecks(account);
  const safeConfiguration = checks.testMode
    && checks.open
    && checks.fullDashboard
    && checks.stripeCollectsFees
    && checks.stripeHasNegativeBalanceLiability
    && checks.merchantConfigured;
  if (!safeConfiguration) {
    console.error("FAIL Refusing to use an account that is not an open, test-mode, full-Dashboard merchant account with Stripe-managed fees and negative balance liability.");
    process.exit(1);
  }

  printCheck(reused ? "Reused Marina A test connected account" : "Created Marina A test connected account", true);

  const returnUrl = new URL(`/marina/${MARINA_SLUG}`, siteUrl);
  returnUrl.searchParams.set("stripe_onboarding", "return");
  const refreshUrl = new URL(`/marina/${MARINA_SLUG}`, siteUrl);
  refreshUrl.searchParams.set("stripe_onboarding", "refresh");
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    type: "account_onboarding",
    collection_options: {
      fields: "eventually_due",
      future_requirements: "include",
    },
    refresh_url: refreshUrl.toString(),
    return_url: returnUrl.toString(),
  });

  console.log(`ACCOUNT_ID=${account.id}`);
  console.log(`ONBOARDING_URL=${accountLink.url}`);
  console.log("The onboarding URL is single-use. Rerun this helper to generate a fresh link.");

  if (!confirmedAccountId) {
    console.log("Local mapping was NOT updated.");
    console.log(`After completing onboarding, explicitly confirm this account with: npm run stripe:setup-marina-a -- --confirm-account=${account.id}`);
    process.exit(0);
  }
  if (confirmedAccountId !== account.id) {
    console.error("FAIL Confirmation does not match the account returned by this helper. Local mapping was NOT updated.");
    process.exit(1);
  }
  if (!checks.cardPaymentsActive) {
    console.error("FAIL Card payments are not active yet. Complete the onboarding link, then rerun with the same --confirm-account value. Local mapping was NOT updated.");
    process.exit(1);
  }

  await updateLocalMapping(account.id);
  printCheck("Local Marina A connected-account mapping updated after exact account confirmation", true);
} catch (error) {
  printSetupFailure("Marina A test connected-account setup", error);
  process.exit(1);
}

function printSetupFailure(label, error) {
  if (!error || typeof error !== "object" || error.type !== "StripeInvalidRequestError") {
    safeFailure(label, error);
    return;
  }

  const fields = {
    message: error.message,
    code: error.code,
    param: error.param,
    type: error.type,
    requestId: error.requestId ?? error.raw?.requestId,
  };
  console.error(`FAIL ${label}`);
  for (const [name, value] of Object.entries(fields)) {
    console.error(`Stripe ${name}: ${redactSecrets(value ?? "not_provided")}`);
  }
}

function redactSecrets(value) {
  let redacted = String(value);
  const configuredSecrets = [
    values.stripeSecretKey,
    values.stripePublishableKey,
    values.stripeWebhookSecret,
    values.supabaseSecretKey,
  ].filter((secret) => typeof secret === "string" && secret.length > 0);

  for (const secret of configuredSecrets) redacted = redacted.replaceAll(secret, "[REDACTED]");
  return redacted
    .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9_-]+\b/g, "[REDACTED_STRIPE_SECRET]")
    .replace(/\bwhsec_[A-Za-z0-9_-]+\b/g, "[REDACTED_WEBHOOK_SECRET]")
    .replace(/\bsb_secret_[A-Za-z0-9_-]+\b/g, "[REDACTED_SUPABASE_SECRET]");
}

async function findReusableAccount(stripe) {
  const matches = [];
  for await (const candidate of stripe.v2.core.accounts.list({
    applied_configurations: ["merchant"],
    limit: 20,
  })) {
    if (candidate.metadata?.berthio_environment === ACCOUNT_METADATA.berthio_environment
      && candidate.metadata?.berthio_marina_slug === ACCOUNT_METADATA.berthio_marina_slug
      && candidate.closed !== true) {
      matches.push(candidate.id);
      if (matches.length > 1) break;
    }
  }

  if (matches.length > 1) {
    console.error("FAIL More than one reusable Marina A local test account exists. Rerun with --account=acct_... to select one explicitly.");
    process.exit(1);
  }
  return matches.length === 1
    ? retrieveTestStandardAccount(stripe, matches[0])
    : null;
}

async function updateLocalMapping(accountId) {
  if (!isLocalSupabase(values.supabaseUrl)) {
    throw new Error("Refusing to update a Supabase instance that is not local HTTP localhost.");
  }
  if (!values.supabaseSecretKey) {
    throw new Error("SUPABASE_SECRET_KEY is not configured.");
  }

  const admin = createAdminClient(values.supabaseUrl, values.supabaseSecretKey);
  const { data, error } = await admin
    .from("marinas")
    .update({ stripe_account_id: accountId })
    .eq("slug", MARINA_SLUG)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No local marina exists with slug ${MARINA_SLUG}.`);
}
