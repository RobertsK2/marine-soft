import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), localPlatformFallback: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getSiteUrl: () => "https://berthio.test",
  isStripeLocalPlatformFallbackEnabled: mocks.localPlatformFallback,
}));
vi.mock("@/lib/stripe/server", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));

import { createCheckoutForHold } from "@/domain/checkout/service";

const prepared = {
  outcome: "ready", payment_id: "70000000-0000-4000-8000-000000000001",
  hold_id: "h", marina_id: "m", marina_slug: "marina-a", marina_name: "Marina A",
  stripe_account_id: "acct_testmarinaa", amount_total_minor: 9272, currency: "EUR",
  price_snapshot: {}, hold_expires_at: "2026-12-01T00:00:00Z", existing_checkout_session_id: null,
};

function fakeStripe(create: ReturnType<typeof vi.fn>) {
  return { checkout: { sessions: { create, retrieve: vi.fn(), expire: vi.fn().mockResolvedValue({}) } } } as unknown as Stripe;
}

describe("Stripe checkout service", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.localPlatformFallback.mockReset().mockReturnValue(false);
  });

  it("creates a connected-account direct Checkout once and attaches it", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [prepared], error: null }).mockResolvedValueOnce({ data: true, error: null });
    const create = vi.fn().mockResolvedValue({ id: "cs_test_one", url: "https://checkout.stripe.com/c/pay/cs_test_one" });
    const result = await createCheckoutForHold("61000000-0000-4000-8000-000000000001", fakeStripe(create));
    expect(result.url).toContain("checkout.stripe.com");
    expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(9272);
    expect(create.mock.calls[0][1]).toEqual({ stripeAccount: "acct_testmarinaa", idempotencyKey: `berthio-checkout-${prepared.payment_id}` });
    expect(mocks.rpc).toHaveBeenLastCalledWith("attach_booking_checkout_session", { target_payment_id: prepared.payment_id, target_session_id: "cs_test_one" });
  });

  it("uses the platform account only for the explicit local placeholder fallback", async () => {
    mocks.localPlatformFallback.mockReturnValue(true);
    mocks.rpc.mockResolvedValueOnce({ data: [prepared], error: null }).mockResolvedValueOnce({ data: true, error: null });
    const create = vi.fn().mockResolvedValue({ id: "cs_test_local", url: "https://checkout.stripe.com/c/pay/cs_test_local" });
    await createCheckoutForHold("61000000-0000-4000-8000-000000000001", fakeStripe(create));
    expect(create.mock.calls[0][1]).toEqual({ idempotencyKey: `berthio-checkout-${prepared.payment_id}` });
    expect(create.mock.calls[0][0].metadata).toMatchObject({
      berthio_checkout_scope: "local_platform",
      berthio_account_marker: "acct_testmarinaa",
    });
  });

  it("marks the payment failed and releases the hold when Stripe creation fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [prepared], error: null }).mockResolvedValueOnce({ data: true, error: null });
    await expect(createCheckoutForHold("61000000-0000-4000-8000-000000000001", fakeStripe(vi.fn().mockRejectedValue(new Error("Stripe unavailable"))))).rejects.toThrow("Unable to create Stripe Checkout");
    expect(mocks.rpc).toHaveBeenLastCalledWith("fail_booking_checkout_creation", { target_payment_id: prepared.payment_id });
  });
});
