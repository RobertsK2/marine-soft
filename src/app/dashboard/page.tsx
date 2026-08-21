import { QuickInsights } from "@/components/admin/overview/quick-insights";
import { TodaysActivity } from "@/components/admin/overview/todays-activity";
import { AppShell } from "@/components/app-shell";
import { MarinaMap } from "@/components/marina-map/marina-map";
import { listBerths } from "@/domain/berths/repository";
import { mapBerthsToLayout } from "@/domain/marina-map/model";
import { PILOT_BERTH_LAYOUT } from "@/domain/marina-map/pilot-layout";
import { deriveOverviewMetrics, deriveTodaysActivity, marinaDateKey } from "@/domain/overview/model";
import { listOverviewBookings } from "@/domain/overview/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateBerthStatusAction } from "@/app/dashboard/berths/actions";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const context = await requireMarinaMembership("/dashboard");
  const supabase = await createClient();
  const now = new Date();
  const today = marinaDateKey(now, context.timezone);
  // Two UTC days safely cover one complete marina-local day across all IANA zones;
  // the model performs the authoritative timezone filter after retrieval.
  const recentCreatedAt = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

  const overviewData = await Promise.all([
      listBerths(supabase, context.marinaId),
      listOverviewBookings(supabase, context.marinaId, today, recentCreatedAt),
    ]).catch(() => null);

  if (!overviewData) {
    return (
      <AppShell
        context={context}
        title="Marina dashboard"
        description={`Operational overview for ${today}, calculated in ${context.timezone}.`}
        wide
      >
        <section className="overview-error" role="alert">
          <strong>Overview data is unavailable</strong>
          <p>Berth and booking records could not be loaded safely. Refresh to try again.</p>
        </section>
      </AppShell>
    );
  }

  const [berths, bookings] = overviewData;
  const { mappedBerths, unmappedBerths } = mapBerthsToLayout(berths, PILOT_BERTH_LAYOUT);
  const metrics = deriveOverviewMetrics(bookings, berths, today);
  const activity = deriveTodaysActivity(bookings, today, context.timezone);

  return (
      <AppShell
        context={context}
        title="Marina dashboard"
        description={`Operational overview for ${today}, calculated in ${context.timezone}.`}
        wide
      >
        <div className="overview-dashboard">
          <QuickInsights metrics={metrics} />
          <div className="overview-operations-grid">
            <div className="overview-map-panel">
              <MarinaMap
                compact
                mappedBerths={mappedBerths}
                marinaName={context.marinaName}
                unmappedCount={unmappedBerths.length}
                updateStatusAction={context.role === "marina_admin" ? updateBerthStatusAction : undefined}
              />
            </div>
            <TodaysActivity activity={activity} />
          </div>
        </div>
      </AppShell>
  );
}
