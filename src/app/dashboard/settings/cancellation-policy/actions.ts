"use server";

import { updateCancellationPolicyAction as updatePolicy } from "@/domain/cancellation-policy/action-service";
import type { CancellationPolicyActionState } from "@/domain/cancellation-policy/types";

export type { CancellationPolicyActionState } from "@/domain/cancellation-policy/types";

export async function updateCancellationPolicyAction(
  expectedUpdatedAt: string,
  state: CancellationPolicyActionState,
  formData: FormData,
) {
  return updatePolicy(expectedUpdatedAt, state, formData);
}
