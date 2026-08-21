import { AppShell } from "@/components/app-shell";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const context = await requireMarinaMembership("/dashboard");

  return (
    <AppShell
      context={context}
      title="Marina dashboard"
      description="Authentication, tenant isolation, and physical berth inventory are active. Booking operations remain outside Phase 3."
    >
      <div className="dashboard-module">
        <span>Phase 3 / Physical inventory</span>
        <h2>Berths are the operational source of truth.</h2>
        <p>Review dimensions, zones, priority, and operational status for this marina.</p>
        <Link className="button button-primary" href="/dashboard/berths">
          Manage berths <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </AppShell>
  );
}
