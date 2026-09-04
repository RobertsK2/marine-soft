export type CancellationPolicyTier = {
  policyCode: string;
  minDaysBeforeArrival: number | null;
  maxDaysBeforeArrival: number | null;
  refundPercent: number;
};

export type CancellationPolicyInput = {
  evaluationRule: "active_at_evaluation";
  tiers: CancellationPolicyTier[];
};

export type CancellationPolicyConfiguration = CancellationPolicyInput & {
  updatedAt: string;
};

export type CancellationPolicyFieldErrors = Partial<Record<"tiers" | "configuration", string>>;

export type CancellationPolicyActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: CancellationPolicyFieldErrors;
  policy?: CancellationPolicyInput;
  updatedAt?: string;
};
