import type { BookingStatus } from "@/domain/bookings/types";

const LABELS: Record<BookingStatus, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  checked_in: "Checked in",
  checked_out: "Checked out",
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`booking-status booking-status-${status}`}>{LABELS[status]}</span>;
}
