import { describe, expect, it } from "vitest";
import { validateCancellationPolicyInput } from "@/domain/cancellation-policy/validation";

const validPolicy = {
  evaluationRule: "active_at_evaluation",
  tiers: [
    { policyCode: "none", minDaysBeforeArrival: null, maxDaysBeforeArrival: 1, refundPercent: 0 },
    { policyCode: "partial", minDaysBeforeArrival: 2, maxDaysBeforeArrival: 6, refundPercent: 50 },
    { policyCode: "full", minDaysBeforeArrival: 7, maxDaysBeforeArrival: null, refundPercent: 100 },
  ],
};

describe("cancellation policy validation", () => {
  it("accepts and normalizes complete ordered tiers", () => {
    expect(validateCancellationPolicyInput(validPolicy)).toEqual({ success: true, data: validPolicy });
  });

  it.each([-1, 101, 50.5])("rejects invalid refund percentage %s", (refundPercent) => {
    const result = validateCancellationPolicyInput({ ...validPolicy, tiers: [{ ...validPolicy.tiers[0], refundPercent }] });
    expect(result.success).toBe(false);
  });

  it("rejects overlapping, gapped, and reversed ranges", () => {
    for (const tiers of [
      [{ policyCode: "a", minDaysBeforeArrival: null, maxDaysBeforeArrival: 2, refundPercent: 0 }, { policyCode: "b", minDaysBeforeArrival: 2, maxDaysBeforeArrival: null, refundPercent: 50 }],
      [{ policyCode: "a", minDaysBeforeArrival: null, maxDaysBeforeArrival: 1, refundPercent: 0 }, { policyCode: "b", minDaysBeforeArrival: 3, maxDaysBeforeArrival: null, refundPercent: 50 }],
      [{ policyCode: "a", minDaysBeforeArrival: null, maxDaysBeforeArrival: 3, refundPercent: 0 }, { policyCode: "b", minDaysBeforeArrival: 4, maxDaysBeforeArrival: 2, refundPercent: 50 }, { policyCode: "c", minDaysBeforeArrival: 3, maxDaysBeforeArrival: null, refundPercent: 100 }],
    ]) {
      expect(validateCancellationPolicyInput({ evaluationRule: "active_at_evaluation", tiers }).success).toBe(false);
    }
  });

  it("requires open outer bounds and unique valid codes", () => {
    expect(validateCancellationPolicyInput({ ...validPolicy, tiers: [{ ...validPolicy.tiers[0], minDaysBeforeArrival: 0 }] }).success).toBe(false);
    expect(validateCancellationPolicyInput({ ...validPolicy, tiers: validPolicy.tiers.map((tier) => ({ ...tier, policyCode: "duplicate" })) }).success).toBe(false);
    expect(validateCancellationPolicyInput({ ...validPolicy, tiers: [{ ...validPolicy.tiers[0], policyCode: "Bad code" }] }).success).toBe(false);
  });
});
