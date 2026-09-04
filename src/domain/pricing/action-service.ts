import { revalidatePath } from "next/cache";
import { replacePricingConfiguration } from "@/domain/pricing/repository";
import type { PricingConfigurationActionState } from "@/domain/pricing/types";
import { parsePricingConfigurationForm } from "@/domain/pricing/validation";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

export async function updatePricingConfigurationAction(
  expectedUpdatedAt: string | null,
  _state: PricingConfigurationActionState,
  formData: FormData,
): Promise<PricingConfigurationActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") {
    return { status: "error", message: "Marina admin access is required." };
  }
  if (expectedUpdatedAt !== null && !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    return { status: "error", message: "The pricing version is invalid. Refresh and try again." };
  }

  const validation = parsePricingConfigurationForm(formData);
  if (!validation.success) return { status: "error", fieldErrors: validation.errors };

  try {
    const result = await replacePricingConfiguration(
      await createClient(),
      context.marinaId,
      expectedUpdatedAt,
      validation.data,
    );
    if (result.outcome === "conflict") {
      return { status: "error", message: "Pricing changed after this page was opened. Refresh before saving again." };
    }
    revalidatePath("/dashboard/settings/pricing");
    revalidatePath(`/marina/${context.marinaSlug}`);
    return {
      status: "success",
      message: "Pricing configuration updated. Existing booking snapshots were not changed.",
      configuration: validation.data,
      updatedAt: result.updated_at ?? undefined,
    };
  } catch (error) {
    captureServerError(error, { operation: "pricing_configuration_mutation" });
    return { status: "error", message: "Pricing changes could not be saved. Review the values and try again." };
  }

}
