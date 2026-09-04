"use server";

import { updatePricingConfigurationAction as updatePricing } from "@/domain/pricing/action-service";
import type { PricingConfigurationActionState } from "@/domain/pricing/types";

export type { PricingConfigurationActionState } from "@/domain/pricing/types";

export async function updatePricingConfigurationAction(
  expectedUpdatedAt: string | null,
  state: PricingConfigurationActionState,
  formData: FormData,
) {
  return updatePricing(expectedUpdatedAt, state, formData);
}
