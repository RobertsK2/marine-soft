import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AdminAuditTable } from "@/components/audit-log/admin-audit-table";
import { toAuditTableEvent } from "@/components/audit-log/audit-table-model";
import shellStyles from "../overview.module.css";
import styles from "@/components/audit-log/audit-settings.module.css";
import { listMarinaAuditEvents } from "@/domain/audit-log/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit Log" };

export default async function AuditPage() {
  const context = await requireMarinaMembership("/dashboard/audit");
  if (context.role !== "marina_admin") notFound();
  const supabase = await createClient();
  const events = await listMarinaAuditEvents(supabase, context.marinaId);

  return (
    <AppShell
      activePage="settings"
      className={`${shellStyles.overview} ${styles.shell}`}
      overviewHeader={<nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/dashboard/settings">Settings</Link><ChevronRight size={14} aria-hidden="true" /><strong aria-current="page">Audit Log</strong></nav>}
      context={context}
      description="Append-only marina profile, integration, pricing, cancellation policy, booking, berth, assignment, and payment activity."
      title="Audit Log"
      wide
    >
      <Link className={styles.back} href="/dashboard/settings"><ArrowLeft size={14} aria-hidden="true" />Back to Settings</Link>
      <header className={styles.heading}><h1>Audit Log</h1><p>Review administrative and operational activity across this marina.</p></header>
      <AdminAuditTable events={events.map(toAuditTableEvent)} timezone={context.timezone} />
    </AppShell>
  );
}
