import { CalendarPlus, LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { BookingStatusBadge } from "@/components/bookings/booking-status";
import type { OverviewActivity } from "@/domain/overview/types";

const EVENT_ICONS = {
  Arrival: LogIn,
  "Booking created": CalendarPlus,
  Departure: LogOut,
} as const;

export function ActivityItem({ activity }: { activity: OverviewActivity }) {
  const Icon = EVENT_ICONS[activity.event];

  return (
    <li className="overview-activity-item">
      <span className="overview-activity-icon"><Icon size={16} aria-hidden="true" /></span>
      <div>
        <div className="overview-activity-title">
          <strong>{activity.event}</strong>
          <time>{activity.time}</time>
        </div>
        <Link href={`/dashboard/bookings/${activity.bookingId}`}>{activity.reference}</Link>
        <p>{activity.context}</p>
        <BookingStatusBadge status={activity.status} />
      </div>
    </li>
  );
}
