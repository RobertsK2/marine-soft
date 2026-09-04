import { notFound } from "next/navigation";
import { updateCancellationPolicyAction } from "@/app/dashboard/settings/cancellation-policy/actions";
import { AppShell } from "@/components/app-shell";
import { CancellationPolicyForm } from "@/components/cancellation-policy/cancellation-policy-form";
import { loadCancellationPolicy } from "@/domain/cancellation-policy/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Cancellation policy" };

export default async function CancellationPolicySettingsPage() {
  const context = await requireMarinaMembership("/dashboard/settings/cancellation-policy");
  if (context.role !== "marina_admin") notFound();
  const policy = await loadCancellationPolicy(await createClient(), context.marinaId);
  if (!policy) throw new Error("Cancellation policy is not configured for this marina.");
  const action = updateCancellationPolicyAction.bind(null, policy.updatedAt);

  return (
    <AppShell context={context} description="Tenant-scoped refund recommendation tiers for staff cancellation decisions." title="Cancellation policy" wide>
      <CancellationPolicyForm
        action={action}
        initialPolicy={{ evaluationRule: policy.evaluationRule, tiers: policy.tiers }}
        policyVersion={policy.updatedAt}
      />
    </AppShell>
  );
}
