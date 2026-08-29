import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { BerthMapStatusForm } from "@/components/marina-map/berth-status-form";
import { BerthStatusBadge } from "@/components/berths/berth-status";
import { formatMetres } from "@/domain/berths/formatting";
import type { MappedBerth } from "@/domain/marina-map/types";
import type { BerthStatusActionState } from "@/app/dashboard/berths/actions";

type StatusAction = (
  berthId: string,
  state: BerthStatusActionState,
  formData: FormData,
) => Promise<BerthStatusActionState>;

export function BerthDetailsPanel({
  mappedBerth,
  updateStatusAction,
}: {
  mappedBerth: MappedBerth | null;
  updateStatusAction?: StatusAction;
}) {
  if (!mappedBerth) {
    return (
      <aside className="map-detail-panel map-detail-empty" aria-live="polite">
        <span>Berth detail</span>
        <h2>Select a berth</h2>
        <p>Choose a numbered berth on the chart to inspect its live Supabase record.</p>
      </aside>
    );
  }

  const { berth, assignments } = mappedBerth;
  return (
    <aside className="map-detail-panel" aria-live="polite" aria-labelledby="selected-berth-heading">
      <div className="map-detail-heading">
        <div>
          <span>{berth.zone}</span>
          <h2 id="selected-berth-heading">Berth {berth.code}</h2>
        </div>
        <BerthStatusBadge status={berth.status} />
      </div>
      <dl className="map-detail-list">
        <div><dt>Max length</dt><dd>{formatMetres(berth.max_length_m)}</dd></div>
        <div><dt>Max beam</dt><dd>{formatMetres(berth.max_beam_m)}</dd></div>
        <div><dt>Max draft</dt><dd>{formatMetres(berth.max_draft_m)}</dd></div>
        <div><dt>Priority</dt><dd>{berth.priority} <small>lower first</small></dd></div>
        <div><dt>Smaller vessels</dt><dd>{berth.allow_smaller_vessels ? "Allowed" : "Exact class"}</dd></div>
      </dl>
      {assignments.length > 0 ? (
        <section className="map-assignment-list" aria-label="Real berth assignments">
          <h3>Real assignment{assignments.length === 1 ? "" : "s"}</h3>
          {assignments.map((assignment) => (
            <Link href={`/dashboard/bookings/${assignment.bookingId}`} key={assignment.bookingId}>
              <strong>{assignment.reference}</strong>
              <span>{assignment.arrivalDate} → {assignment.departureDate}</span>
              <small>{assignment.status === "checked_in" ? "Occupied" : "Reserved"}</small>
            </Link>
          ))}
        </section>
      ) : <p className="map-readonly-note">No real booking assignment.</p>}
      {updateStatusAction ? (
        <BerthMapStatusForm
          action={updateStatusAction.bind(null, berth.id)}
          status={berth.status}
        />
      ) : (
        <p className="map-readonly-note">Marina admin access is required to change status.</p>
      )}
      <Link className="text-link" href={`/dashboard/berths/${berth.id}`}>
        Open full berth record <ExternalLink size={15} aria-hidden="true" />
      </Link>
      <p className="map-berth-id">BERTH ID / {berth.id}</p>
    </aside>
  );
}
