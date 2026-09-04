import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuditHistory } from "@/components/audit-log/audit-history";
import { listMarinaAuditEvents } from "@/domain/audit-log/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function AuditPage() {
  const context = await requireMarinaMembership("/dashboard/audit");
  if (context.role !== "marina_admin") notFound();
  const supabase = await createClient();
  const events = await listMarinaAuditEvents(supabase, context.marinaId);

  return (
    <AppShell
      context={context}
      description="Append-only marina profile, integration, pricing, cancellation policy, booking, berth, assignment, and payment activity."
      title="Audit log"
      wide
    >
      <div className="audit-log-summary">
        <span>Latest records</span>
        <strong>{events.length}</strong>
        <p>Newest first / maximum 250 events</p>
      </div>
      <AuditHistory events={events} timezone={context.timezone} title="Full marina history" />
    </AppShell>
  );
}
