import { ArrowLeft, Pencil, Ruler } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuditHistory } from "@/components/audit-log/audit-history";
import { BerthStatusBadge } from "@/components/berths/berth-status";
import { formatBerthTimestamp, formatMetres } from "@/domain/berths/formatting";
import { listBerthAuditEvents } from "@/domain/audit-log/repository";
import { getBerth } from "@/domain/berths/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function BerthDetailsPage({
  params,
}: {
  params: Promise<{ berthId: string }>;
}) {
  const { berthId } = await params;
  const context = await requireMarinaMembership(`/dashboard/berths/${berthId}`);
  const supabase = await createClient();
  const berth = await getBerth(supabase, context.marinaId, berthId);
  if (!berth) notFound();
  const auditEvents = await listBerthAuditEvents(supabase, context.marinaId, berth.id);

  return (
    <AppShell
      context={context}
      description="Physical suitability limits and current operating state."
      title={`Berth ${berth.code}`}
      wide
    >
      <div className="detail-toolbar">
        <Link className="text-link" href="/dashboard/berths">
          <ArrowLeft size={16} aria-hidden="true" /> Back to inventory
        </Link>
        {context.role === "marina_admin" ? (
          <Link className="button button-primary" href={`/dashboard/berths/${berth.id}/edit`}>
            <Pencil size={16} aria-hidden="true" /> Edit berth
          </Link>
        ) : null}
      </div>

      <div className="berth-detail-grid">
        <section className="berth-detail-primary">
          <div className="detail-code-line">
            <span>{berth.zone}</span>
            <BerthStatusBadge status={berth.status} />
          </div>
          <h2>{berth.code}</h2>
          <p>Assignment priority <strong>{berth.priority}</strong> / lower values first</p>
        </section>

        <section className="dimension-panel" aria-labelledby="capacity-heading">
          <div className="panel-heading"><Ruler size={18} aria-hidden="true" /><h2 id="capacity-heading">Maximum vessel dimensions</h2></div>
          <dl>
            <div><dt>Length</dt><dd>{formatMetres(berth.max_length_m)}</dd></div>
            <div><dt>Beam</dt><dd>{formatMetres(berth.max_beam_m)}</dd></div>
            <div><dt>Draft</dt><dd>{formatMetres(berth.max_draft_m)}</dd></div>
          </dl>
        </section>

        <section className="berth-rule-panel">
          <span>Smaller vessel rule</span>
          <strong>{berth.allow_smaller_vessels ? "Allowed" : "Not allowed"}</strong>
          <p>{berth.allow_smaller_vessels ? "Later matching may consider this berth for vessels below all physical limits." : "Later matching must not use this berth as a larger fallback."}</p>
        </section>

        <section className="record-panel">
          <span>Record</span>
          <dl>
            <div><dt>Created</dt><dd>{formatBerthTimestamp(berth.created_at, context.timezone)}</dd></div>
            <div><dt>Updated</dt><dd>{formatBerthTimestamp(berth.updated_at, context.timezone)}</dd></div>
            <div><dt>Berth ID</dt><dd>{berth.id}</dd></div>
          </dl>
        </section>

        <AuditHistory events={auditEvents} timezone={context.timezone} />
      </div>
    </AppShell>
  );
}
