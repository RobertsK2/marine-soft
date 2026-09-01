export function cancellationPolicy(daysUntilArrival: number) {
  if (daysUntilArrival >= 7) return { policyCode: "full_refund_7_days", refundPercent: 100 };
  if (daysUntilArrival >= 2) return { policyCode: "partial_refund_2_to_6_days", refundPercent: 50 };
  return { policyCode: "no_refund_under_2_days", refundPercent: 0 };
}

export function recommendedRefund(totalMinor: number | null, refundPercent: number) {
  return totalMinor === null ? null : Math.floor(totalMinor * refundPercent / 100);
}
