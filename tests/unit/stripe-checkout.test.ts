import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { buildCheckoutSessionParams, stripeCheckoutEventValues } from "@/domain/checkout/model";

describe("Stripe Connect checkout model", () => {
  it("uses only the server snapshot amount and card/wallet rail", () => {
    const params = buildCheckoutSessionParams({ holdToken: "hold-token", paymentId: "payment-id", marinaName: "Marina A", marinaSlug: "marina-a", amountTotalMinor: 9272, currency: "EUR", siteUrl: "https://berthio.test", integrationIdentifier: "berthio_phase6_abcdefgh" });
    expect(params.payment_method_types).toBeUndefined();
    expect(params.integration_identifier).toBe("berthio_phase6_abcdefgh");
    expect(params.phone_number_collection).toEqual({ enabled: true });
    expect(params.line_items?.[0]).toMatchObject({ quantity: 1, price_data: { currency: "eur", unit_amount: 9272 } });
    expect(params.metadata).toEqual({ hold_token: "hold-token", payment_id: "payment-id" });
  });

  it("builds server-owned success and cancellation destinations", () => {
    const params = buildCheckoutSessionParams({ holdToken: "h", paymentId: "p", marinaName: "A", marinaSlug: "marina/a", amountTotalMinor: 1, currency: "EUR", siteUrl: "https://berthio.test", integrationIdentifier: "berthio_phase6_abcdefgh" });
    expect(params.success_url).toContain("/marina/marina%2Fa/checkout/return?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe("https://berthio.test/marina/marina%2Fa?checkout=cancelled#booking-entry");
  });

  it("extracts signed Connect session reconciliation fields", () => {
    const event = { id: "evt_1", type: "checkout.session.completed", account: "acct_1", data: { object: { id: "cs_test_1", amount_total: 9272, currency: "eur", payment_status: "paid", payment_intent: "pi_1", metadata: { hold_token: "hold-1" }, customer_details: { name: "Ada Sailor", email: "ADA@example.test", phone: "+37120000000" } } } } as unknown as Stripe.Event;
    expect(stripeCheckoutEventValues(event)).toMatchObject({ eventId: "evt_1", stripeAccountId: "acct_1", amountTotalMinor: 9272, holdToken: "hold-1", customerName: "Ada Sailor", customerEmail: "ADA@example.test", customerPhone: "+37120000000" });
  });

  it("accepts a signed platform Session only when the guarded local fallback metadata matches", () => {
    const event = { id: "evt_local", type: "checkout.session.completed", data: { object: {
      id: "cs_test_local", amount_total: 9272, currency: "eur", payment_status: "paid", payment_intent: "pi_local",
      metadata: { hold_token: "hold-local", berthio_checkout_scope: "local_platform", berthio_account_marker: "acct_testmarinaa" },
    } } } as unknown as Stripe.Event;
    expect(stripeCheckoutEventValues(event)).toBeNull();
    expect(stripeCheckoutEventValues(event, true)).toMatchObject({
      stripeAccountId: "acct_testmarinaa", sessionId: "cs_test_local", holdToken: "hold-local",
    });
  });

  it("rejects irrelevant or incomplete events", () => {
    expect(stripeCheckoutEventValues({ type: "customer.created" } as Stripe.Event)).toBeNull();
    expect(stripeCheckoutEventValues({ type: "checkout.session.completed", data: { object: {} } } as unknown as Stripe.Event)).toBeNull();
  });
});
