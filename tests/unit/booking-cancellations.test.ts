import { describe, expect, it } from "vitest";
import { cancellationPolicy, recommendedRefund } from "@/domain/booking-cancellations/model";

describe("booking cancellation policy", () => {
  it.each([
    [10, "full_refund_7_days", 100],
    [5, "partial_refund_2_to_6_days", 50],
    [1, "no_refund_under_2_days", 0],
  ])("returns the policy for %s days", (days, code, percent) => {
    expect(cancellationPolicy(days)).toEqual({ policyCode: code, refundPercent: percent });
  });

  it("calculates only a recommendation and supports unpaid bookings", () => {
    expect(recommendedRefund(10001, 50)).toBe(5000);
    expect(recommendedRefund(null, 100)).toBeNull();
  });
});
