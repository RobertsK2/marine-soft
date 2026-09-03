import { Plus, Ruler, Rows3, Upload } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BerthStatusBadge } from "@/components/berths/berth-status";
import { formatMetres } from "@/domain/berths/formatting";
import { listBerths } from "@/domain/berths/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Berths" };

export default async function BerthsPage() {
  const context = await requireMarinaMembership("/dashboard/berths");
  const supabase = await createClient();
  const berths = await listBerths(supabase, context.marinaId);
  const statusCounts = {
    available: berths.filter((berth) => berth.status === "available").length,
    blocked: berths.filter((berth) => berth.status === "blocked").length,
    outOfService: berths.filter((berth) => berth.status === "out_of_service").length,
  };

  return (
    <AppShell
      context={context}
      description="Physical capacity, operating state, and assignment priority for every berth in this marina."
      title="Berth inventory"
      wide
    >
      <div className="inventory-toolbar">
        <p>
          <Rows3 size={17} aria-hidden="true" />
          {berths.length} physical berths
        </p>
        {context.role === "marina_admin" ? (
          <div className="inventory-actions">
            <Link className="button button-secondary" href="/dashboard/berths/import">
              <Upload size={17} aria-hidden="true" />
              Import CSV
            </Link>
            <Link className="button button-primary" href="/dashboard/berths/new">
              <Plus size={17} aria-hidden="true" />
              Add berth
            </Link>
          </div>
        ) : null}
      </div>

      <div className="inventory-stats" aria-label="Berth status summary">
        <article><span>Total</span><strong>{berths.length}</strong></article>
        <article><span>Available</span><strong>{statusCounts.available}</strong></article>
        <article><span>Blocked</span><strong>{statusCounts.blocked}</strong></article>
        <article><span>Out of service</span><strong>{statusCounts.outOfService}</strong></article>
      </div>

      {berths.length === 0 ? (
        <div className="inventory-empty">
          <Ruler size={28} aria-hidden="true" />
          <h2>No physical berths recorded</h2>
          <p>Add the first berth to establish marina capacity.</p>
        </div>
      ) : (
        <div className="berth-table-wrap">
          <table className="berth-table">
            <thead>
              <tr>
                <th>Priority</th>
                <th>Code / Zone</th>
                <th>Maximum dimensions</th>
                <th>Status</th>
                <th>Smaller vessels</th>
                <th><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {berths.map((berth) => (
                <tr key={berth.id}>
                  <td className="mono-cell">{String(berth.priority).padStart(3, "0")}</td>
                  <td><strong>{berth.code}</strong><span>{berth.zone}</span></td>
                  <td className="dimension-cell">
                    <span>L {formatMetres(berth.max_length_m)}</span>
                    <span>B {formatMetres(berth.max_beam_m)}</span>
                    <span>D {formatMetres(berth.max_draft_m)}</span>
                  </td>
                  <td><BerthStatusBadge status={berth.status} /></td>
                  <td>{berth.allow_smaller_vessels ? "Allowed" : "Exact class"}</td>
                  <td><Link className="table-link" href={`/dashboard/berths/${berth.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
