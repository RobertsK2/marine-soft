import {
  checkEnvironment,
  createAdminClient,
  createStripe,
  isConnectedAccountId,
  isLocalSupabase,
  isTestStripeSecretKey,
  printCheck,
  readArgument,
  retrieveTestStandardAccount,
  safeFailure,
  testStandardAccountChecks,
} from "./stripe-phase6-helpers.mjs";

const marinaSlug = readArgument("marina", "marina-a");
const accountId = process.env.BERTHIO_STRIPE_ACCOUNT_ID;
const { values } = checkEnvironment();

if (!isLocalSupabase(values.supabaseUrl)) {
  console.error("FAIL Refusing to update a Supabase instance that is not local HTTP localhost.");
  process.exit(1);
}
if (!isTestStripeSecretKey(values.stripeSecretKey)) {
  console.error("FAIL STRIPE_SECRET_KEY must be a test-mode key.");
  process.exit(1);
}
if (!values.supabaseSecretKey) {
  console.error("FAIL SUPABASE_SECRET_KEY is not configured.");
  process.exit(1);
}
if (!isConnectedAccountId(accountId)) {
  console.error("FAIL BERTHIO_STRIPE_ACCOUNT_ID must contain a real acct_ identifier, not the seed placeholder.");
  process.exit(1);
}

try {
  const stripe = createStripe(values.stripeSecretKey);
  const account = await retrieveTestStandardAccount(stripe, accountId);
  const checks = testStandardAccountChecks(account);
  if (!checks.testMode || !checks.open || !checks.fullDashboard || !checks.stripeCollectsFees
    || !checks.stripeHasNegativeBalanceLiability || !checks.merchantConfigured) {
    console.error("FAIL The account is not an open test connected account with full Dashboard access, Stripe-managed fees and negative balance liability, and merchant configuration.");
    process.exit(1);
  }
  if (!checks.cardPaymentsActive) {
    console.error("FAIL The connected account's card payments capability is not active.");
    process.exit(1);
  }
  printCheck("Connected account is accessible, test-mode, full-Dashboard, and card-payments active", true);

  const admin = createAdminClient(values.supabaseUrl, values.supabaseSecretKey);
  const { data, error } = await admin
    .from("marinas")
    .update({ stripe_account_id: accountId })
    .eq("slug", marinaSlug)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    console.error(`FAIL No local marina exists with slug ${marinaSlug}.`);
    process.exit(1);
  }
  printCheck(`Local marina ${marinaSlug} connected-account configuration updated`, true);
  console.log("The account identifier was intentionally not printed.");
} catch (error) {
  safeFailure("Connected-account configuration update", error);
  process.exit(1);
}
