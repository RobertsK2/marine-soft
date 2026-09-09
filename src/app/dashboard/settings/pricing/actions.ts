"use server";

import { updatePricingConfigurationAction as updatePricing } from "@/domain/pricing/action-service";
import type { PricingConfigurationActionState } from "@/domain/pricing/types";
import { revalidatePath } from "next/cache";
import { getAuthorizationContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type { PricingConfigurationActionState } from "@/domain/pricing/types";

export async function updatePricingConfigurationAction(
  expectedUpdatedAt: string | null,
  state: PricingConfigurationActionState,
  formData: FormData,
) {
  return updatePricing(expectedUpdatedAt, state, formData);
}

export type PaymentMethodsActionState = { status: "idle" | "success" | "error"; message?: string };

export async function updatePaymentMethodsAction(expectedUpdatedAt: string, _state: PaymentMethodsActionState, data: FormData): Promise<PaymentMethodsActionState> {
  const context = await getAuthorizationContext();
  if (context?.role !== "marina_admin") return { status: "error", message: "Marina admin access is required." };
  const online = data.get("onlinePayment") === "on";
  const atMarina = data.get("payAtMarina") === "on";
  if (!online && !atMarina) return { status: "error", message: "Keep at least one payment method enabled." };
  const { data: updated, error } = await (await createClient()).from("marinas")
    .update({ accepts_online_payment: online, accepts_pay_at_marina: atMarina })
    .eq("id", context.marinaId).eq("updated_at", expectedUpdatedAt).select("id").maybeSingle();
  if (error || !updated) return { status: "error", message: "Payment methods could not be saved. Refresh and try again." };
  revalidatePath("/dashboard/settings/pricing");
  revalidatePath("/dashboard/settings/publishing");
  revalidatePath(`/marina/${context.marinaSlug}`);
  return { status: "success", message: "Accepted booking payment methods updated." };
}
