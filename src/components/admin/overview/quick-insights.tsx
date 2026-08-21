import { Anchor, LogIn, LogOut } from "lucide-react";
import { InsightCard } from "@/components/admin/overview/insight-card";
import type { OverviewMetrics } from "@/domain/overview/types";

export function QuickInsights({ metrics }: { metrics: OverviewMetrics }) {
  const occupancyValue = metrics.occupancyPercent === null
    ? "—"
    : `${metrics.occupancyPercent}%`;
  const occupancyDetail = metrics.operationalBerthCount
    ? `${metrics.activeStayCount} active / ${metrics.operationalBerthCount} available berths`
    : "No berths currently available";

  return (
    <section aria-labelledby="quick-insights-heading" className="overview-section">
      <div className="overview-section-heading">
        <div>
          <p>Live operational records</p>
          <h2 id="quick-insights-heading">Quick insights</h2>
        </div>
      </div>
      <div className="overview-insights-grid">
        <InsightCard
          detail={metrics.arrivalsToday ? "Active bookings scheduled today" : "No arrivals today"}
          icon={LogIn}
          label="Arrivals today"
          value={String(metrics.arrivalsToday)}
        />
        <InsightCard
          detail={metrics.departuresToday ? "Active bookings scheduled today" : "No departures today"}
          icon={LogOut}
          label="Departures today"
          value={String(metrics.departuresToday)}
        />
        <InsightCard
          detail={occupancyDetail}
          icon={Anchor}
          label="Capacity pressure"
          value={occupancyValue}
        />
      </div>
    </section>
  );
}
