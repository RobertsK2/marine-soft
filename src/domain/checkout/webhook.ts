import "server-only";
import type Stripe from "stripe";
import { isStripeLocalPlatformFallbackEnabled } from "@/lib/env";
import { createPrivilegedClient } from "@/lib/supabase/privileged";
import { stripeCheckoutEventValues } from "@/domain/checkout/model";

export class PaidBookingConfirmationError extends Error {
  constructor(readonly eventId: string) {
    super("Critical: Stripe reports a paid Checkout Session, but no booking was confirmed.");
    this.name = "PaidBookingConfirmationError";
  }
}

export async function processStripeConnectEvent(event: Stripe.Event) {
  const values = stripeCheckoutEventValues(event, isStripeLocalPlatformFallbackEnabled());
  if (!values) return "ignored_incomplete";
  const { data, error } = await createPrivilegedClient().rpc("process_stripe_checkout_event", {
    target_event_id: values.eventId, target_event_type: values.eventType,
    target_stripe_account_id: values.stripeAccountId, target_session_id: values.sessionId,
    target_payment_intent_id: values.paymentIntentId, target_payment_status: values.paymentStatus,
    target_amount_total_minor: values.amountTotalMinor, target_currency: values.currency,
    target_hold_token: values.holdToken,
    target_customer_name: values.customerName,
    target_customer_email: values.customerEmail,
    target_customer_phone: values.customerPhone,
  });
  if (error) throw error;
  if (data === "critical_paid_without_booking") {
    throw new PaidBookingConfirmationError(values.eventId);
  }
  return data;
}
