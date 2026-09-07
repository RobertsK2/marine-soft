import { notFound } from "next/navigation";
import { updateCancellationPolicyAction } from "@/app/dashboard/settings/cancellation-policy/actions";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import shellStyles from "../../overview.module.css";
import styles from "@/components/cancellation-policy/cancellation-policy.module.css";
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
    <AppShell activePage="settings" context={context} className={`${shellStyles.overview} ${styles.shell}`} title="Cancellation policy" description="Configure cancellation windows and refund recommendations." wide overviewHeader={<div className={styles.breadcrumb}><Link href="/dashboard/settings">Settings</Link><span>/</span><strong>Cancellation Policy</strong></div>}>
      <Link className={styles.back} href="/dashboard/settings">← Back to Settings</Link>
      <header className={styles.heading}><h1>Cancellation Policy</h1><p>Configure cancellation windows, refund recommendations, and timeline coverage.</p></header>
      <CancellationPolicyForm
        action={action}
        initialPolicy={{ evaluationRule: policy.evaluationRule, tiers: policy.tiers }}
        policyVersion={policy.updatedAt}
      />
    </AppShell>
  );
}

