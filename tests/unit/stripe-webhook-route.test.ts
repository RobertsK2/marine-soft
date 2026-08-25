import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
const webhookSecret = "whsec_phase6_unit_test";
const stripe = new Stripe("sk_test_phase6_unit_test");
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ getStripeServerEnv: () => ({ secretKey: "sk_test_phase6_unit_test", webhookSecret }) }));
vi.mock("@/lib/stripe/server", () => ({ getStripe: () => stripe }));
vi.mock("@/domain/checkout/webhook", () => ({ processStripeConnectEvent: mocks.process }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));

import { POST } from "@/app/api/stripe/connect/webhook/route";

describe("Stripe Connect webhook route", () => {
  beforeEach(() => mocks.process.mockReset().mockResolvedValue("paid"));

  it("rejects a missing or invalid Stripe signature", async () => {
    expect((await POST(new Request("http://localhost/api/stripe/connect/webhook", { method: "POST", body: "{}" }))).status).toBe(400);
    expect((await POST(new Request("http://localhost/api/stripe/connect/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "bad" } }))).status).toBe(400);
  });

  it("verifies the raw body before processing", async () => {
    const payload = JSON.stringify({ id: "evt_signed", object: "event", type: "checkout.session.completed", account: "acct_test", data: { object: {} } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const response = await POST(new Request("http://localhost/api/stripe/connect/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith(expect.objectContaining({ id: "evt_signed" }));
  });

  it("returns a retryable error when paid booking confirmation is critical", async () => {
    mocks.process.mockRejectedValueOnce(new Error("Critical paid-without-booking invariant"));
    const payload = JSON.stringify({ id: "evt_critical", object: "event", type: "checkout.session.completed", account: "acct_test", data: { object: {} } });
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const response = await POST(new Request("http://localhost/api/stripe/connect/webhook", { method: "POST", body: payload, headers: { "stripe-signature": signature } }));
    expect(response.status).toBe(500);
  });
});
