import { ArrowLeft, Check, ChevronRight, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AuditHistory } from "@/components/audit-log/audit-history";
import { BerthDetailStatusForm } from "@/components/berths/berth-detail-status-form";
import { BerthStatusBadge } from "@/components/berths/berth-status";
import { formatMetres } from "@/domain/berths/formatting";
import { listBerthAuditEvents } from "@/domain/audit-log/repository";
import { listBerthAssignments } from "@/domain/berth-assignments/repository";
import { getBerth } from "@/domain/berths/repository";
import { listBookings } from "@/domain/bookings/repository";
import { updateBerthStatusAction } from "@/app/dashboard/berths/actions";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../../overview.module.css";
import styles from "@/components/berths/berth-detail.module.css";

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
  const [auditEvents, assignments, bookings] = await Promise.all([
    listBerthAuditEvents(supabase, context.marinaId, berth.id),
    listBerthAssignments(supabase, context.marinaId),
    listBookings(supabase, context.marinaId),
  ]);
  const currentAssignment = assignments.find((assignment) => assignment.berth_id === berth.id && assignment.ended_at === null) ?? null;
  const currentBooking = currentAssignment ? bookings.find((booking) => booking.id === currentAssignment.booking_id) ?? null : null;
  const vesselFits = currentBooking ? currentBooking.vessel_length_m <= berth.max_length_m
    && currentBooking.vessel_beam_m <= berth.max_beam_m && currentBooking.vessel_draft_m <= berth.max_draft_m : null;
  const statusAction = updateBerthStatusAction.bind(null, berth.id);

  return (
    <AppShell
      activePage="berths"
      className={`${shellStyles.overview} ${styles.shell}`}
      context={context}
      description="Physical suitability limits and current operating state."
      title={`Berth ${berth.code}`}
      wide
      overviewHeader={<nav aria-label="Breadcrumb" className={styles.breadcrumb}><Link href="/dashboard/berths">Berths</Link><ChevronRight size={13} aria-hidden="true" /><span>Inventory</span><ChevronRight size={13} aria-hidden="true" /><strong aria-current="page">Berth {berth.code}</strong></nav>}
    >
      <Link className={styles.back} href="/dashboard/berths"><ArrowLeft size={14} aria-hidden="true" />Back to Berths</Link>
      <header className={styles.header}>
        <div><div className={styles.titleLine}><h1>Berth {berth.code} · {berth.zone}</h1><BerthStatusBadge status={berth.status} /></div><p>Physical berth limits, current assignment, and operational history.</p></div>
        {context.role === "marina_admin" ? (
          <Link className={styles.edit} href={`/dashboard/berths/${berth.id}/edit`}><Pencil size={14} aria-hidden="true" />Edit Berth</Link>
        ) : null}
      </header>
      <div className={styles.layout}>
        <main className={styles.main}>
          <section className={styles.card} aria-labelledby="physical-limits"><h2 className={styles.sectionTitle} id="physical-limits">Physical Limits &amp; Specifications</h2>
            <dl className={styles.dimensions}><div><dt>Maximum Length</dt><dd>{berth.max_length_m}<small> m</small></dd></div><div><dt>Maximum Beam</dt><dd>{berth.max_beam_m}<small> m</small></dd></div><div><dt>Maximum Draft</dt><dd>{berth.max_draft_m}<small> m</small></dd></div></dl>
            <dl className={styles.properties}><div><dt>Zone / Basin</dt><dd>{berth.zone}</dd></div><div><dt>Berth Structure</dt><dd>Not recorded</dd></div><div><dt>Allow Smaller Vessels</dt><dd>{berth.allow_smaller_vessels ? "Yes" : "No"}</dd></div><div><dt>Assignment Priority</dt><dd><span className={styles.priority}>{berth.priority}</span></dd></div></dl>
          </section>
          <section className={styles.card} aria-labelledby="current-assignment"><div className={styles.assignmentHeader}><h2 className={styles.sectionTitle} id="current-assignment">Current Assignment</h2>{currentBooking ? <Link href={`/dashboard/bookings/${currentBooking.id}`}>Open Booking Detail →</Link> : null}</div>
            {currentAssignment && currentBooking ? <div className={styles.assignment}><div><strong>Booking {currentBooking.reference}</strong><p>{currentBooking.customer_name} · {currentBooking.vessel_name ?? "Unnamed vessel"} ({formatMetres(currentBooking.vessel_length_m)} × {formatMetres(currentBooking.vessel_beam_m)})</p><p>Stay: {currentAssignment.arrival_date} – {currentAssignment.departure_date}</p></div><span className={`${styles.fit} ${vesselFits ? "" : styles.fitWarning}`}>{vesselFits ? <Check size={13} aria-hidden="true" /> : <TriangleAlert size={13} aria-hidden="true" />}{vesselFits ? "Within Limits" : "Outside Limits"}</span></div> : <p className={styles.empty}>No current booking is assigned to this berth.</p>}
          </section>
          <section className={`${styles.card} ${styles.history}`}><AuditHistory events={auditEvents} timezone={context.timezone} title="Berth Activity History" /></section>
        </main>
        <aside className={styles.sidebar} aria-label="Berth summary"><div className={styles.sideHeader}><span className={styles.code}>{berth.code}</span><div><small>{berth.zone}</small><strong>Physical Berth</strong></div><BerthStatusBadge status={berth.status} /></div>
          <dl className={styles.summary}><div><dt>Max Length</dt><dd>{formatMetres(berth.max_length_m)}</dd></div><div><dt>Max Beam</dt><dd>{formatMetres(berth.max_beam_m)}</dd></div><div><dt>Max Draft</dt><dd>{formatMetres(berth.max_draft_m)}</dd></div><div><dt>Zone / Basin</dt><dd>{berth.zone}</dd></div></dl>
          {context.role === "marina_admin" ? <BerthDetailStatusForm action={statusAction} status={berth.status} /> : null}
        </aside>
      </div>
    </AppShell>
  );
}
