import { CalendarDays, Plus } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { BookingStatusBadge } from "@/components/bookings/booking-status";
import {
  formatBookingDate,
  formatBookingTime,
  formatVesselName,
} from "@/domain/bookings/formatting";
import { listBookings } from "@/domain/bookings/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Bookings" };

export default async function BookingsPage() {
  const context = await requireMarinaMembership("/dashboard/bookings");
  const supabase = await createClient();
  const bookings = await listBookings(supabase, context.marinaId);
  const counts = {
    confirmed: bookings.filter((booking) => booking.status === "confirmed").length,
    checkedIn: bookings.filter((booking) => booking.status === "checked_in").length,
    completed: bookings.filter((booking) => booking.status === "checked_out").length,
  };

  return (
    <AppShell
      context={context}
      description="Manual transit bookings from phone, email, walk-in, or an existing marina system."
      title="Bookings"
      wide
    >
      <div className="inventory-toolbar">
        <p><CalendarDays size={17} aria-hidden="true" />{bookings.length} booking records</p>
        <Link className="button button-primary" href="/dashboard/bookings/new">
          <Plus size={17} aria-hidden="true" />Create booking
        </Link>
      </div>
      <div className="inventory-stats" aria-label="Booking status summary">
        <article><span>Total</span><strong>{bookings.length}</strong></article>
        <article><span>Confirmed</span><strong>{counts.confirmed}</strong></article>
        <article><span>Checked in</span><strong>{counts.checkedIn}</strong></article>
        <article><span>Checked out</span><strong>{counts.completed}</strong></article>
      </div>

      {bookings.length === 0 ? (
        <div className="inventory-empty">
          <CalendarDays size={28} aria-hidden="true" />
          <h2>No manual bookings recorded</h2>
          <p>Create the first capacity booking for this marina.</p>
        </div>
      ) : (
        <div className="berth-table-wrap">
          <table className="berth-table booking-table">
            <thead><tr><th>Reference</th><th>Stay</th><th>Customer</th><th>Vessel</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="mono-cell"><strong>{booking.reference}</strong><span>Manual</span></td>
                  <td><strong>{formatBookingDate(booking.arrival_date)}</strong><span>to {formatBookingDate(booking.departure_date)} / ETA {formatBookingTime(booking.eta)}</span></td>
                  <td><strong>{booking.customer_name}</strong><span>{booking.customer_email}</span></td>
                  <td><strong>{formatVesselName(booking.vessel_name)}</strong><span>{booking.vessel_length_m} × {booking.vessel_beam_m} × {booking.vessel_draft_m} m</span></td>
                  <td><BookingStatusBadge status={booking.status} /></td>
                  <td><Link className="table-link" href={`/dashboard/bookings/${booking.id}`}>View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
