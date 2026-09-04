import { describe, expect, it } from "vitest";
import { cancellationPolicy, recommendedRefund } from "@/domain/booking-cancellations/model";

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
