import { describe, expect, it, vi } from "vitest";
import { cancellationPolicy, formatCancellationPolicy, recommendedRefund } from "@/domain/booking-cancellations/model";
import { updateBookingStatusAction } from "@/domain/bookings/action-service";
import { formatMoney } from "@/domain/bookings/formatting";
import { getStripe } from "@/lib/stripe/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), createClient: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthorizationContext: mocks.auth }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));
vi.mock("@/lib/stripe/server", () => ({ getStripe: vi.fn() }));
vi.mock("@/domain/pricing/repository", () => ({ loadPricingCatalog: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const tiers = [
  { policyCode: "no_refund_under_2_days", minDaysBeforeArrival: null, maxDaysBeforeArrival: 1, refundPercent: 0 },
  { policyCode: "partial_refund_2_to_6_days", minDaysBeforeArrival: 2, maxDaysBeforeArrival: 6, refundPercent: 50 },
  { policyCode: "full_refund_7_days", minDaysBeforeArrival: 7, maxDaysBeforeArrival: null, refundPercent: 100 },
];

describe("booking cancellation policy", () => {
  it.each([
    [10, "full_refund_7_days", 100],
    [5, "partial_refund_2_to_6_days", 50],
    [1, "no_refund_under_2_days", 0],
  ])("returns the policy for %s days", (days, code, percent) => {
    expect(cancellationPolicy(days, tiers)).toEqual({ policyCode: code, refundPercent: percent });
  });

  it("selects a configurable tier without a hard-coded fallback", () => {
    expect(cancellationPolicy(8, [{ policyCode: "custom", minDaysBeforeArrival: null, maxDaysBeforeArrival: null, refundPercent: 35 }]))
      .toEqual({ policyCode: "custom", refundPercent: 35 });
    expect(cancellationPolicy(8, [])).toBeNull();
  });

  it("calculates only a recommendation and supports unpaid bookings", () => {
    expect(recommendedRefund(10001, 50)).toBe(5000);
    expect(recommendedRefund(null, 100)).toBeNull();
  });
});

describe("saved cancellation display", () => {
  it.each([[4379, "€43.79"], [0, "€0.00"]])("formats %s stored euro cents", (minor, expected) => {
    expect(formatMoney(minor, "EUR")).toBe(expected);
  });

  it.each([
    ["partial_refund_2_to_6_days", "Partial refund (2 to 6 days before arrival)"],
    ["no_refund_under_2_days", "No refund (under 2 days before arrival)"],
    ["seasonal_flex", "Seasonal flex"],
  ])("formats the stored policy code %s", (code, expected) => {
    expect(formatCancellationPolicy(code)).toBe(expected);
  });
});

it("confirms cancellation through the booking RPC without calling Stripe", async () => {
  const bookingId = "a1000000-0000-4000-8000-000000000001";
  const expectedUpdatedAt = "2026-11-23T13:00:00Z";
  const refundsCreate = vi.fn();
  vi.mocked(getStripe).mockReturnValue({ refunds: { create: refundsCreate } } as unknown as ReturnType<typeof getStripe>);
  mocks.auth.mockResolvedValue({ userId: "staff", marinaId: "marina-a", role: "marina_staff" });
  mocks.rpc.mockResolvedValue({ data: [{
    outcome: "cancelled", refund_recommendation_minor: 4379, refund_percent: 50,
    currency: "EUR", released_assignment_count: 0,
  }], error: null });
  const form = new FormData();
  form.set("confirmCancellation", "true");
  form.set("cancellationReason", "Customer requested cancellation");

  await expect(updateBookingStatusAction(bookingId, expectedUpdatedAt, { status: "idle" }, form))
    .resolves.toMatchObject({ status: "success", message: expect.stringContaining("€43.79 (50%)") });
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("audited_confirm_booking_cancellation", {
    target_marina_id: "marina-a", target_booking_id: bookingId, target_actor_id: "staff",
    expected_updated_at: expectedUpdatedAt, cancellation_reason: "Customer requested cancellation",
  });
  expect(mocks.createClient).not.toHaveBeenCalled();
  expect(getStripe).not.toHaveBeenCalled();
  expect(refundsCreate).not.toHaveBeenCalled();
});
