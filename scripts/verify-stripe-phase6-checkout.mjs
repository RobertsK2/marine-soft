import {
  checkEnvironment,
  createAdminClient,
  createStripe,
  isConnectedAccountId,
  isLocalPlatformFallback,
  printCheck,
  readArgument,
  safeFailure,
} from "./stripe-phase6-helpers.mjs";

const sessionId = readArgument("session");
const marinaSlug = readArgument("marina", "marina-a");
const { values } = checkEnvironment();
const localPlatformFallback = isLocalPlatformFallback(values);

if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId ?? "")) {
  console.error("FAIL Pass the returned test Checkout Session as --session=cs_test_...");
  process.exit(1);
}
if (!/^sk_test_[A-Za-z0-9]+$/.test(values.stripeSecretKey ?? "") || !values.supabaseUrl || !values.supabaseSecretKey) {
  console.error("FAIL Local Stripe and Supabase verification variables are incomplete.");
  process.exit(1);
}

let passed = true;
try {
  const admin = createAdminClient(values.supabaseUrl, values.supabaseSecretKey);
  const { data: marina, error: marinaError } = await admin
    .from("marinas")
    .select("id, stripe_account_id")
    .eq("slug", marinaSlug)
    .maybeSingle();
  if (marinaError) throw marinaError;
  const usesLocalPlatform = Boolean(localPlatformFallback && marina?.stripe_account_id === "acct_testmarinaa");
  if (!marina || (!isConnectedAccountId(marina.stripe_account_id) && !usesLocalPlatform)) {
    console.error(`FAIL Marina ${marinaSlug} has neither a connected account nor the guarded local platform fallback.`);
    process.exit(1);
  }

  const { data: payment, error: paymentError } = await admin
    .from("booking_payments")
    .select("hold_id, status, amount_total_minor, currency, paid_at")
    .eq("marina_id", marina.id)
    .eq("stripe_checkout_session_id", sessionId)
    .maybeSingle();
  if (paymentError) throw paymentError;
  passed = printCheck("A tenant-matched local payment snapshot exists", Boolean(payment)) && passed;
  if (!payment) process.exit(1);

  const stripe = createStripe(values.stripeSecretKey);
  const session = await stripe.checkout.sessions.retrieve(
    sessionId,
    {},
    usesLocalPlatform ? {} : { stripeAccount: marina.stripe_account_id },
  );
  passed = printCheck(
    usesLocalPlatform ? "Checkout Session ran on the local platform test account" : "Checkout Session ran as a connected-account direct charge",
    usesLocalPlatform
      ? session.metadata?.berthio_checkout_scope === "local_platform" && session.metadata?.berthio_account_marker === "acct_testmarinaa"
      : true,
  ) && passed;
  passed = printCheck("Stripe reports the Checkout Session as paid", session.payment_status === "paid") && passed;
  passed = printCheck(
    "Stripe amount and currency match the immutable server snapshot",
    session.amount_total === payment.amount_total_minor && session.currency?.toUpperCase() === payment.currency,
  ) && passed;
  passed = printCheck("Webhook reconciliation marked the local payment paid", payment.status === "paid" && Boolean(payment.paid_at)) && passed;

  const { data: hold, error: holdError } = await admin
    .from("booking_holds")
    .select("payment_confirmed_at")
    .eq("id", payment.hold_id)
    .maybeSingle();
  if (holdError) throw holdError;
  passed = printCheck("Webhook reconciliation confirmed payment on the hold", Boolean(hold?.payment_confirmed_at)) && passed;

  const { data: events, error: eventError } = await admin
    .from("stripe_webhook_events")
    .select("outcome")
    .eq("stripe_checkout_session_id", sessionId);
  if (eventError) throw eventError;
  passed = printCheck("A successful idempotent webhook event was recorded", Boolean(events?.some((event) => ["paid", "already_paid"].includes(event.outcome)))) && passed;
} catch (error) {
  passed = safeFailure("End-to-end Checkout reconciliation", error) && passed;
}

console.log(passed ? "Phase 6 end-to-end Checkout verification passed." : "Phase 6 end-to-end Checkout verification failed.");
process.exitCode = passed ? 0 : 1;
