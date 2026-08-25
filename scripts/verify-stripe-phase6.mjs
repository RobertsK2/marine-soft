import {
  checkEnvironment,
  createAdminClient,
  createStripe,
  isConnectedAccountId,
  isLocalPlatformFallback,
  isTestStripeSecretKey,
  printCheck,
  readArgument,
  retrieveTestStandardAccount,
  safeFailure,
  testStandardAccountChecks,
} from "./stripe-phase6-helpers.mjs";

const marinaSlug = readArgument("marina", "marina-a");
const { values, checks } = checkEnvironment();
const localPlatformFallback = isLocalPlatformFallback(values);
let passed = true;

for (const [label, result] of checks) passed = printCheck(label, result) && passed;

if (isTestStripeSecretKey(values.stripeSecretKey)) {
  try {
    const stripe = createStripe(values.stripeSecretKey);
    await stripe.v2.core.accounts.list({ limit: 1 });
    passed = printCheck("STRIPE_SECRET_KEY authenticates to a Stripe test Connect platform", true) && passed;
  } catch (error) {
    passed = safeFailure("STRIPE_SECRET_KEY authenticates to Stripe", error) && passed;
  }
}

if (/^whsec_[A-Za-z0-9]+$/.test(values.stripeWebhookSecret ?? "")) {
  try {
    const stripe = createStripe(values.stripeSecretKey);
    const payload = JSON.stringify({ id: "evt_local_phase6_config_check", object: "event" });
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: values.stripeWebhookSecret });
    const event = stripe.webhooks.constructEvent(payload, header, values.stripeWebhookSecret);
    passed = printCheck("STRIPE_CONNECT_WEBHOOK_SECRET verifies a signed payload", event.id === "evt_local_phase6_config_check") && passed;
  } catch (error) {
    passed = safeFailure("STRIPE_CONNECT_WEBHOOK_SECRET verifies a signed payload", error) && passed;
  }
}

if (values.supabaseUrl && values.supabaseSecretKey) {
  try {
    const admin = createAdminClient(values.supabaseUrl, values.supabaseSecretKey);
    const { data: marina, error } = await admin
      .from("marinas")
      .select("id, stripe_account_id")
      .eq("slug", marinaSlug)
      .maybeSingle();
    if (error) throw error;

    const usesLocalPlatform = Boolean(localPlatformFallback && marina?.stripe_account_id === "acct_testmarinaa");
    const configured = Boolean(marina && (isConnectedAccountId(marina.stripe_account_id) || usesLocalPlatform));
    passed = printCheck(
      usesLocalPlatform
        ? `Marina ${marinaSlug} uses the guarded local platform-account fallback`
        : `Marina ${marinaSlug} has a non-placeholder acct_ configuration`,
      configured,
    ) && passed;

    if (configured && !usesLocalPlatform && isTestStripeSecretKey(values.stripeSecretKey)) {
      try {
        const stripe = createStripe(values.stripeSecretKey);
        const account = await retrieveTestStandardAccount(stripe, marina.stripe_account_id);
        const checks = testStandardAccountChecks(account);
        const standardEquivalent = checks.testMode && checks.open && checks.fullDashboard
          && checks.stripeCollectsFees && checks.stripeHasNegativeBalanceLiability && checks.merchantConfigured;
        passed = printCheck("Configured marina account is reachable with the Standard-equivalent Accounts v2 configuration", standardEquivalent) && passed;
        passed = printCheck("Configured marina account has active card payments", standardEquivalent && checks.cardPaymentsActive) && passed;
      } catch (error) {
        passed = safeFailure("Configured marina account is reachable through the platform", error) && passed;
      }
    }
  } catch (error) {
    passed = safeFailure(`Marina ${marinaSlug} configuration is readable`, error) && passed;
  }
}

console.log(passed ? "Phase 6 local Stripe preflight passed." : "Phase 6 local Stripe preflight is incomplete.");
process.exitCode = passed ? 0 : 1;
