import { ArrowRight, Radio } from "lucide-react";
import Link from "next/link";
import { ActivityItem } from "@/components/admin/overview/activity-item";
import type { OverviewActivity } from "@/domain/overview/types";

export function TodaysActivity({ activity }: { activity: OverviewActivity[] }) {
  return (
    <aside className="overview-activity-panel" aria-labelledby="todays-activity-heading">
      <header>
        <div>
          <p><Radio size={13} aria-hidden="true" />Marina-local time</p>
          <h2 id="todays-activity-heading">Today&apos;s activity</h2>
        </div>
        <span>{activity.length} items</span>
      </header>
      {activity.length ? (
        <ol className="overview-activity-list">
          {activity.map((item) => <ActivityItem activity={item} key={item.id} />)}
        </ol>
      ) : (
        <div className="overview-activity-empty">
          <Radio size={24} aria-hidden="true" />
          <strong>No activity yet today</strong>
          <p>Scheduled movements and newly created bookings will appear here.</p>
        </div>
      )}
      <Link className="overview-activity-link" href="/dashboard/bookings">
        View all bookings <ArrowRight size={15} aria-hidden="true" />
      </Link>
    </aside>
  );
}
