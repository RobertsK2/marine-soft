import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CancellationPolicyConfiguration, CancellationPolicyInput } from "@/domain/cancellation-policy/types";
import type { Database, Json } from "@/types/database";

export class CancellationPolicyRepositoryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CancellationPolicyRepositoryError";
  }
}

export async function loadCancellationPolicy(
  supabase: SupabaseClient<Database>,
  marinaId: string,
): Promise<CancellationPolicyConfiguration | null> {
  const [policyResult, tiersResult] = await Promise.all([
    supabase.from("marina_cancellation_policies").select("evaluation_rule, updated_at").eq("marina_id", marinaId).maybeSingle(),
    supabase.from("marina_cancellation_policy_tiers")
      .select("policy_code, min_days_before_arrival, max_days_before_arrival, refund_percent")
      .eq("marina_id", marinaId).order("sort_order"),
  ]);
  const error = policyResult.error ?? tiersResult.error;
  if (error) throw new CancellationPolicyRepositoryError("Unable to load cancellation policy.", { cause: error });
  if (!policyResult.data) return null;
  return {
    evaluationRule: policyResult.data.evaluation_rule,
    updatedAt: policyResult.data.updated_at,
    tiers: (tiersResult.data ?? []).map((tier) => ({
      policyCode: tier.policy_code,
      minDaysBeforeArrival: tier.min_days_before_arrival,
      maxDaysBeforeArrival: tier.max_days_before_arrival,
      refundPercent: tier.refund_percent,
    })),
  };
}

export async function replaceCancellationPolicy(
  supabase: SupabaseClient<Database>,
  marinaId: string,
  expectedUpdatedAt: string,
  policy: CancellationPolicyInput,
) {
  const { data, error } = await supabase.rpc("replace_marina_cancellation_policy", {
    target_marina_id: marinaId,
    expected_updated_at: expectedUpdatedAt,
    requested_policy: policy as unknown as Json,
  });
  if (error) throw new CancellationPolicyRepositoryError("Unable to save cancellation policy.", { cause: error });
  return data[0] ?? { outcome: "conflict", updated_at: null };
}
