import type Stripe from "stripe";

export type CheckoutSnapshot = {
  holdToken: string;
  paymentId: string;
  marinaName: string;
  marinaSlug: string;
  amountTotalMinor: number;
  currency: string;
  siteUrl: string;
  integrationIdentifier: string;
  localPlatformAccountMarker?: string;
};

export const LOCAL_PLATFORM_ACCOUNT_MARKER = "acct_testmarinaa";

export function buildCheckoutSessionParams(snapshot: CheckoutSnapshot): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    integration_identifier: snapshot.integrationIdentifier,
    phone_number_collection: { enabled: true },
    client_reference_id: snapshot.holdToken,
    line_items: [{ quantity: 1, price_data: {
      currency: snapshot.currency.toLowerCase(),
      unit_amount: snapshot.amountTotalMinor,
      product_data: { name: `${snapshot.marinaName} berth stay` },
    } }],
    metadata: {
      hold_token: snapshot.holdToken,
      payment_id: snapshot.paymentId,
      ...(snapshot.localPlatformAccountMarker ? {
        berthio_checkout_scope: "local_platform",
        berthio_account_marker: snapshot.localPlatformAccountMarker,
      } : {}),
    },
    payment_intent_data: { metadata: { hold_token: snapshot.holdToken, payment_id: snapshot.paymentId } },
    success_url: `${snapshot.siteUrl}/marina/${encodeURIComponent(snapshot.marinaSlug)}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${snapshot.siteUrl}/marina/${encodeURIComponent(snapshot.marinaSlug)}?checkout=cancelled#booking-entry`,
  };
}

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "checkout.session.expired",
]);

export function stripeCheckoutEventValues(event: Stripe.Event, allowLocalPlatformFallback = false) {
  if (!RELEVANT_EVENTS.has(event.type)) return null;
  const session = event.data.object as Stripe.Checkout.Session;
  const holdToken = session.metadata?.hold_token;
  const localAccountMarker = allowLocalPlatformFallback
    && session.metadata?.berthio_checkout_scope === "local_platform"
    && session.metadata?.berthio_account_marker === LOCAL_PLATFORM_ACCOUNT_MARKER
    ? LOCAL_PLATFORM_ACCOUNT_MARKER
    : null;
  const stripeAccountId = event.account ?? localAccountMarker;
  if (!stripeAccountId || !holdToken || session.amount_total === null || !session.currency) return null;
  const customerDetails = session.customer_details;
  return {
    eventId: event.id, eventType: event.type, stripeAccountId,
    sessionId: session.id,
    paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
    paymentStatus: session.payment_status, amountTotalMinor: session.amount_total,
    currency: session.currency, holdToken,
    customerName: customerDetails?.name ?? null,
    customerEmail: customerDetails?.email ?? null,
    customerPhone: customerDetails?.phone ?? null,
  };
}
