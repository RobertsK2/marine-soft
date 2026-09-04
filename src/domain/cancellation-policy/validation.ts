import type {
  CancellationPolicyFieldErrors,
  CancellationPolicyInput,
  CancellationPolicyTier,
} from "@/domain/cancellation-policy/types";

const POLICY_CODE = /^[a-z][a-z0-9_]{0,79}$/;
const MAX_TIERS = 20;
const MAX_DAY_THRESHOLD = 36_500;

type Result =
  | { success: true; data: CancellationPolicyInput }
  | { success: false; errors: CancellationPolicyFieldErrors };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nullableInteger(value: unknown) {
  if (value === null) return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  return Number.NaN;
}

export function validateCancellationPolicyInput(value: unknown): Result {
  const record = objectValue(value);
  if (!record || record.evaluationRule !== "active_at_evaluation") {
    return { success: false, errors: { configuration: "Cancellation policy format is invalid." } };
  }
  if (!Array.isArray(record.tiers) || record.tiers.length < 1 || record.tiers.length > MAX_TIERS) {
    return { success: false, errors: { tiers: `Configure 1–${MAX_TIERS} cancellation tiers.` } };
  }

  const tiers: CancellationPolicyTier[] = [];
  const codes = new Set<string>();
  for (const [index, valueTier] of record.tiers.entries()) {
    const tier = objectValue(valueTier);
    const policyCode = typeof tier?.policyCode === "string" ? tier.policyCode.trim() : "";
    const minDaysBeforeArrival = nullableInteger(tier?.minDaysBeforeArrival);
    const maxDaysBeforeArrival = nullableInteger(tier?.maxDaysBeforeArrival);
    const refundPercent = tier?.refundPercent;
    if (!POLICY_CODE.test(policyCode)) {
      return { success: false, errors: { tiers: `Tier ${index + 1} needs a lowercase policy code using letters, numbers, or underscores.` } };
    }
    if (codes.has(policyCode)) {
      return { success: false, errors: { tiers: "Cancellation policy codes must be unique." } };
    }
    if ((minDaysBeforeArrival !== null && (!Number.isInteger(minDaysBeforeArrival) || Math.abs(minDaysBeforeArrival) > MAX_DAY_THRESHOLD)) ||
        (maxDaysBeforeArrival !== null && (!Number.isInteger(maxDaysBeforeArrival) || Math.abs(maxDaysBeforeArrival) > MAX_DAY_THRESHOLD))) {
      return { success: false, errors: { tiers: `Tier ${index + 1} has an invalid whole-day threshold.` } };
    }
    if (!Number.isInteger(refundPercent) || (refundPercent as number) < 0 || (refundPercent as number) > 100) {
      return { success: false, errors: { tiers: `Tier ${index + 1} refund percentage must be a whole number from 0 to 100.` } };
    }
    codes.add(policyCode);
    tiers.push({ policyCode, minDaysBeforeArrival, maxDaysBeforeArrival, refundPercent: refundPercent as number });
  }

  if (tiers[0].minDaysBeforeArrival !== null) {
    return { success: false, errors: { tiers: "The first tier must have no minimum day threshold." } };
  }
  if (tiers.at(-1)?.maxDaysBeforeArrival !== null) {
    return { success: false, errors: { tiers: "The final tier must have no maximum day threshold." } };
  }
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    if (tier.minDaysBeforeArrival !== null && tier.maxDaysBeforeArrival !== null && tier.minDaysBeforeArrival > tier.maxDaysBeforeArrival) {
      return { success: false, errors: { tiers: `Tier ${index + 1} has reversed day thresholds.` } };
    }
    if (index > 0) {
      const previous = tiers[index - 1];
      if (previous.maxDaysBeforeArrival === null || tier.minDaysBeforeArrival !== previous.maxDaysBeforeArrival + 1) {
        return { success: false, errors: { tiers: "Tiers must be ordered from lowest to highest and cover every day without gaps or overlaps." } };
      }
    }
    if (index < tiers.length - 1 && tier.maxDaysBeforeArrival === null) {
      return { success: false, errors: { tiers: "Only the final tier may have no maximum day threshold." } };
    }
  }
  return { success: true, data: { evaluationRule: "active_at_evaluation", tiers } };
}

export function parseCancellationPolicyForm(formData: FormData): Result {
  const serialized = formData.get("policy");
  if (typeof serialized !== "string" || serialized.length > 100_000) {
    return { success: false, errors: { configuration: "Cancellation policy is missing or too large." } };
  }
  try {
    return validateCancellationPolicyInput(JSON.parse(serialized));
  } catch {
    return { success: false, errors: { configuration: "Cancellation policy is not valid JSON." } };
  }
}
