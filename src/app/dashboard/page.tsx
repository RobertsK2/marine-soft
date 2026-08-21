import { AppShell } from "@/components/app-shell";
import { ArrowRight, CalendarDays, Rows3 } from "lucide-react";
import Link from "next/link";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const context = await requireMarinaMembership("/dashboard");

  return (
    <AppShell
      context={context}
      title="Marina dashboard"
      description="Tenant-isolated physical inventory and manual booking operations are active."
    >
      <div className="dashboard-modules">
        <div className="dashboard-module">
          <span><Rows3 size={15} aria-hidden="true" />Phase 3 / Physical inventory</span>
          <h2>Berths remain the physical source of truth.</h2>
          <p>Review dimensions, zones, priority, and operational status for this marina.</p>
          <Link className="button button-secondary" href="/dashboard/berths">
            Manage berths <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="dashboard-module dashboard-module-active">
          <span><CalendarDays size={15} aria-hidden="true" />Phase 4 / Manual bookings</span>
          <h2>Record guaranteed marina capacity.</h2>
          <p>Create customer and vessel snapshots without assigning a permanent berth.</p>
          <Link className="button button-primary" href="/dashboard/bookings">
            Manage bookings <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
