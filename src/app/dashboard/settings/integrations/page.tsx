import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { IntegrationStatusPanel } from "@/components/integration-status/integration-status-panel";
import { loadIntegrationStatus } from "@/domain/integration-status/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../../overview.module.css";
import styles from "@/components/integration-status/integration-settings.module.css";

export const metadata = { title: "Integrations" };

export default async function IntegrationStatusPage() {
  const context = await requireMarinaMembership("/dashboard/settings/integrations");
  if (context.role !== "marina_admin") notFound();
  const status = await loadIntegrationStatus(await createClient(), context.marinaId);

  return (
    <AppShell activePage="settings" className={`${shellStyles.overview} ${styles.shell}`} context={context} description="Service connection readiness." title="Integrations" wide overviewHeader={<nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/dashboard/settings">Settings</Link><ChevronRight size={14} aria-hidden="true" /><strong aria-current="page">Integrations</strong></nav>}>
      <Link className={styles.back} href="/dashboard/settings"><ArrowLeft size={14} aria-hidden="true" />Back to Settings</Link>
      <header className={styles.heading}><h1>Integrations</h1><p>Review service connection readiness for payments, booking emails, and background workers.</p></header>
      <IntegrationStatusPanel status={status} timezone={context.timezone} checkedAt={new Date().toISOString()} monitoringConfigured={Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN)} />
    </AppShell>
  );
}
