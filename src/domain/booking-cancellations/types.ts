export type CancellationPreview = {
  policyCode: string;
  refundPercent: number;
  refundRecommendationMinor: number | null;
  paidTotalMinor: number | null;
  currency: string | null;
  assignmentCount: number;
};
