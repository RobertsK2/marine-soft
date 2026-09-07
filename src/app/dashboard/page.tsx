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
import { CalendarDays, CalendarPlus, ListChecks, Map, Rows3 } from "lucide-react";
import Link from "next/link";
import styles from "./overview.module.css";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const context = await requireMarinaMembership("/dashboard");
  const supabase = await createClient();
  const now = new Date();
  const today = marinaDateKey(now, context.timezone);
  const overviewHeader = <header className={styles.topbar}>
    <div><h1>Overview</h1><p>{context.marinaName}</p></div>
    <div className={styles.date}><CalendarDays size={18} aria-hidden="true" /><div><time dateTime={today}>Today, {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: context.timezone }).format(now)}</time><small>{context.timezone}</small></div></div>
  </header>;
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
        className={styles.overview}
        overviewHeader={overviewHeader}
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
        className={styles.overview}
        overviewHeader={overviewHeader}
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
          <nav className={styles.actions} aria-label="Quick actions">
            <Link href="/dashboard/bookings/new"><CalendarPlus aria-hidden="true" /><span>Add booking<small>Create a new booking</small></span></Link>
            <Link href="/dashboard/bookings"><ListChecks aria-hidden="true" /><span>Bookings<small>Review marina bookings</small></span></Link>
            <Link href="/dashboard/berths"><Rows3 aria-hidden="true" /><span>Berth inventory<small>View berth records</small></span></Link>
            <Link href="/dashboard/marina-map"><Map aria-hidden="true" /><span>Marina map<small>Open the full map</small></span></Link>
          </nav>
        </div>
      </AppShell>
  );
}
