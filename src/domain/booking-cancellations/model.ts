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

const policyLabels = new Map([
  ["full_refund_7_days", "Full refund (7 or more days before arrival)"],
  ["partial_refund_2_to_6_days", "Partial refund (2 to 6 days before arrival)"],
  ["no_refund_under_2_days", "No refund (under 2 days before arrival)"],
]);

export function formatCancellationPolicy(code: string) {
  return policyLabels.get(code) ?? code.replace(/_+/g, " ").trim().replace(/^./, (first) => first.toUpperCase());
}
