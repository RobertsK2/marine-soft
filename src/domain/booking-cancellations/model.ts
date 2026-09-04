import type { CancellationPolicyTier } from "@/domain/cancellation-policy/types";

export function cancellationPolicy(daysUntilArrival: number, tiers: CancellationPolicyTier[]) {
  const tier = tiers.find((candidate) =>
    (candidate.minDaysBeforeArrival === null || daysUntilArrival >= candidate.minDaysBeforeArrival) &&
    (candidate.maxDaysBeforeArrival === null || daysUntilArrival <= candidate.maxDaysBeforeArrival));
  return tier ? { policyCode: tier.policyCode, refundPercent: tier.refundPercent } : null;
}

export function recommendedRefund(totalMinor: number | null, refundPercent: number) {
  return totalMinor === null ? null : Math.floor(totalMinor * refundPercent / 100);
}
