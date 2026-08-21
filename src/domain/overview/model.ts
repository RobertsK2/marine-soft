import type { Berth } from "@/domain/berths/types";
import type {
  OverviewActivity,
  OverviewBooking,
  OverviewMetrics,
} from "@/domain/overview/types";

const ACTIVE_STAY_STATUSES = new Set(["confirmed", "checked_in"]);

function dateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

export function marinaDateKey(date: Date, timeZone: string) {
  const parts = dateTimeParts(date, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function marinaTimeLabel(isoTimestamp: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone,
  }).format(new Date(isoTimestamp));
}

export function deriveOverviewMetrics(
  bookings: OverviewBooking[],
  berths: Berth[],
  today: string,
): OverviewMetrics {
  const relevantBookings = bookings.filter(({ status }) => status !== "cancelled");
  const activeStays = relevantBookings.filter(
    ({ arrival_date, departure_date, status }) =>
      ACTIVE_STAY_STATUSES.has(status) &&
      arrival_date <= today &&
      departure_date > today,
  );
  // Phase 7 has no permanent berth assignment. This is deliberately a capacity
  // pressure ratio: active stays / berths currently available for operations.
  const operationalBerthCount = berths.filter(
    ({ status }) => status === "available",
  ).length;

  return {
    activeStayCount: activeStays.length,
    arrivalsToday: relevantBookings.filter(
      ({ arrival_date }) => arrival_date === today,
    ).length,
    departuresToday: relevantBookings.filter(
      ({ departure_date }) => departure_date === today,
    ).length,
    occupancyPercent: operationalBerthCount
      ? Math.round((activeStays.length / operationalBerthCount) * 100)
      : null,
    operationalBerthCount,
  };
}

export function deriveTodaysActivity(
  bookings: OverviewBooking[],
  today: string,
  timeZone: string,
): OverviewActivity[] {
  const activity: OverviewActivity[] = [];

  for (const booking of bookings) {
    const context = `${booking.vessel_name ?? "Unnamed vessel"} — ${booking.customer_name}`;

    if (booking.status !== "cancelled" && booking.arrival_date === today) {
      activity.push({
        bookingId: booking.id,
        context,
        event: "Arrival",
        id: `${booking.id}-arrival`,
        reference: booking.reference,
        sortTime: booking.eta,
        status: booking.status,
        time: booking.eta.slice(0, 5),
      });
    }
    if (booking.status !== "cancelled" && booking.departure_date === today) {
      activity.push({
        bookingId: booking.id,
        context,
        event: "Departure",
        id: `${booking.id}-departure`,
        reference: booking.reference,
        sortTime: booking.etd,
        status: booking.status,
        time: booking.etd.slice(0, 5),
      });
    }
    if (marinaDateKey(new Date(booking.created_at), timeZone) === today) {
      const time = marinaTimeLabel(booking.created_at, timeZone);
      activity.push({
        bookingId: booking.id,
        context,
        event: "Booking created",
        id: `${booking.id}-created`,
        reference: booking.reference,
        sortTime: time,
        status: booking.status,
        time,
      });
    }
  }

  return activity.sort((left, right) =>
    left.sortTime.localeCompare(right.sortTime) || left.reference.localeCompare(right.reference),
  );
}
