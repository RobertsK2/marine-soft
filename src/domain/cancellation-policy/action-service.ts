import { revalidatePath } from "next/cache";
import { replaceCancellationPolicy } from "@/domain/cancellation-policy/repository";
import type { CancellationPolicyActionState } from "@/domain/cancellation-policy/types";
import { parseCancellationPolicyForm } from "@/domain/cancellation-policy/validation";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export async function updateCancellationPolicyAction(
  expectedUpdatedAt: string,
  _state: CancellationPolicyActionState,
  formData: FormData,
): Promise<CancellationPolicyActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") return { status: "error", message: "Marina admin access is required." };
  if (!Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The cancellation policy version is invalid. Refresh and try again." };
  }
  const validation = parseCancellationPolicyForm(formData);
  if (!validation.success) return { status: "error", fieldErrors: validation.errors };

  try {
    const result = await replaceCancellationPolicy(await createClient(), context.marinaId, expectedUpdatedAt, validation.data);
    if (result.outcome === "conflict") {
      return { status: "error", message: "The cancellation policy changed after this page was opened. Refresh before saving again." };
    }
    revalidatePath("/dashboard/settings/cancellation-policy");
    return {
      status: "success",
      message: result.outcome === "unchanged"
        ? "Cancellation policy is already up to date."
        : "Cancellation policy updated. Existing bookings and financial history were not changed.",
      policy: validation.data,
      updatedAt: result.updated_at ?? expectedUpdatedAt,
    };
  } catch (error) {
    captureServerError(error, { operation: "cancellation_policy_mutation", marinaId: context.marinaId });
    return { status: "error", message: "Cancellation policy could not be saved. Review the tiers and try again." };
  }
}
