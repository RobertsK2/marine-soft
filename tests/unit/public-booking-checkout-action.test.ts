import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ hold: vi.fn(), payAtMarina: vi.fn(), requester: vi.fn(), checkout: vi.fn(), marina: vi.fn(), redirect: vi.fn(), capture: vi.fn(), guestUrl: vi.fn() }));
vi.mock("@/domain/booking-holds/service", () => ({ createPublicBookingHold: mocks.hold, confirmPublicPayAtMarinaBooking: mocks.payAtMarina }));
vi.mock("@/domain/guest-access/service", () => ({ issueGuestManagementUrl: mocks.guestUrl }));
vi.mock("@/domain/booking-holds/requester", () => ({ getBookingHoldRequester: mocks.requester }));
vi.mock("@/domain/checkout/service", () => ({ createCheckoutForHold: mocks.checkout }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: mocks.capture }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.marina };
  return { from: () => query };
} }));

import { startBookingCheckoutAction } from "@/app/marina/[slug]/actions";

const key = "70000000-0000-4000-8000-000000000001";
function form() {
  const data = new FormData();
  Object.entries({ holdIdempotencyKey: key, arrivalDate: "2026-12-10", departureDate: "2026-12-12", eta: "14:30", etd: "10:00", vesselLengthM: "12", vesselBeamM: "3.8", vesselDraftM: "2.1", vesselName: "Aurora" }).forEach(([k, v]) => data.set(k, v));
  return data;
}
const run = (data = form()) => startBookingCheckoutAction("marina-a", { status: "idle" }, data);

describe("one-step public booking checkout", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T12:00:00Z"));
    mocks.marina.mockResolvedValue({ data: { timezone: "Europe/Riga", accepts_online_payment: true, accepts_pay_at_marina: false }, error: null });
    mocks.requester.mockResolvedValue({ sessionHash: "server-session", networkHash: "server-network" });
    mocks.hold.mockResolvedValue({ outcome: "created", holdToken: "private-token", expiresAt: "2026-09-09T12:15:00Z" });
    mocks.checkout.mockResolvedValue({ outcome: "ready", url: "https://checkout.stripe.com/c/pay/cs_test_one" });
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });
  });

  it.each(["created", "existing"])("redirects immediately after a %s protected hold", async (outcome) => {
    mocks.hold.mockResolvedValue({ outcome, holdToken: "private-token", expiresAt: "2026-09-09T12:15:00Z" });
    const data = form();
    data.set("sessionHash", "forged");
    data.set("priceTotalMinor", "1");
    await expect(run(data)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.hold).toHaveBeenCalledWith("marina-a", key, expect.objectContaining({ vesselLengthM: 12 }), { sessionHash: "server-session", networkHash: "server-network" });
    expect(mocks.checkout).toHaveBeenCalledExactlyOnceWith("private-token");
    expect(mocks.redirect).toHaveBeenCalledWith("https://checkout.stripe.com/c/pay/cs_test_one");
  });

  it.each(["unavailable", "closed", "idempotency_conflict", "not_found"])("requires rechecking and never calls Stripe when hold is %s", async (outcome) => {
    mocks.hold.mockResolvedValue({ outcome });
    const result = await run();
    expect(result).toMatchObject({ status: "error", requiresAvailabilityCheck: true });
    if (outcome === "unavailable") expect(result.message).toContain("Availability has changed");
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("preserves anonymous rate limiting", async () => {
    mocks.hold.mockResolvedValue({ outcome: "rate_limited" });
    expect(await run()).toMatchObject({ status: "error", message: expect.stringContaining("Too many") });
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it.each(["holdIdempotencyKey", "arrivalDate", "vesselLengthM"])("validates %s before creating inventory or payment", async (field) => {
    const data = form(); data.set(field, "invalid");
    expect(await run(data)).toMatchObject({ status: "error", requiresAvailabilityCheck: true });
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("allows a checkout failure retry with the same booking attempt", async () => {
    mocks.checkout.mockRejectedValueOnce(new Error("timeout"));
    expect(await run()).toMatchObject({ status: "error" });
    mocks.hold.mockResolvedValue({ outcome: "existing", holdToken: "private-token", expiresAt: "2026-09-09T12:15:00Z" });
    await expect(run()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.hold.mock.calls[0]).toEqual(mocks.hold.mock.calls[1]);
    expect(mocks.checkout.mock.calls).toEqual([["private-token"], ["private-token"]]);
  });

  it("does not redirect to an unexpected checkout host", async () => {
    mocks.checkout.mockResolvedValue({ outcome: "ready", url: "https://example.com" });
    expect(await run()).toMatchObject({ status: "error" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["confirmed", "existing"])("confirms pay-at-marina once for outcome %s without calling Stripe", async (outcome) => {
    mocks.marina.mockResolvedValue({ data: { timezone: "Europe/Riga", accepts_online_payment: true, accepts_pay_at_marina: true }, error: null });
    mocks.payAtMarina.mockResolvedValue({ outcome, bookingId: "booking-one" });
    mocks.guestUrl.mockResolvedValue("https://berthio.test/guest/bookings/signed-token");
    const data = form();
    data.set("paymentMethod", "marina");
    data.set("customerName", "Guest Person");
    data.set("customerEmail", "guest@example.test");
    data.set("customerPhone", "+37120000000");
    await expect(run(data)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.payAtMarina).toHaveBeenCalledExactlyOnceWith(
      "marina-a", key, expect.objectContaining({ vesselLengthM: 12 }),
      { sessionHash: "server-session", networkHash: "server-network" },
      { customerName: "Guest Person", customerEmail: "guest@example.test", customerPhone: "+37120000000" },
    );
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("https://berthio.test/guest/bookings/signed-token?confirmation=1");
  });

  it("rejects a disabled payment method before allocating inventory", async () => {
    const data = form();
    data.set("paymentMethod", "marina");
    expect(await run(data)).toMatchObject({ status: "error", requiresAvailabilityCheck: true });
    expect(mocks.hold).not.toHaveBeenCalled();
    expect(mocks.payAtMarina).not.toHaveBeenCalled();
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
