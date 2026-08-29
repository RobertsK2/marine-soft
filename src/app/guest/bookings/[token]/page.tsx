import type { Metadata } from "next";
import { Anchor, Clock3, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateGuestBookingTimesAction } from "@/app/guest/bookings/[token]/actions";
import { GuestTimesForm } from "@/components/guest-booking/guest-times-form";
import { formatBookingDate, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { loadGuestBooking } from "@/domain/guest-access/service";

export const metadata: Metadata = {
  title: "Manage booking",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function GuestBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await loadGuestBooking(token);
  if (!booking) notFound();

  const paidTotal = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: booking.priceCurrency,
  }).format(booking.priceTotalMinor / 100);
  const editable = booking.status === "confirmed";
  const updateAction = updateGuestBookingTimesAction.bind(null, token);

  return (
    <main className="guest-booking-page">
      <header className="guest-booking-header">
        <Link className="brand guest-booking-brand" href="/"><span className="brand-mark" aria-hidden="true"><Anchor size={18} /></span><span>Berthio</span></Link>
        <span><ShieldCheck size={16} aria-hidden="true" /> Secure guest access</span>
      </header>
      <div className="guest-booking-shell">
        <p className="public-marina-section-code">Booking management / {booking.reference}</p>
        <h1>{booking.marinaName}</h1>
        <p className="guest-booking-intro">View the confirmed booking record and update arrival or departure time. Cancellation, refunds, vessel changes, and customer details require marina assistance.</p>

        <dl className="guest-booking-grid">
          <div><dt>Booking reference</dt><dd>{booking.reference}</dd></div>
          <div><dt>Status</dt><dd>{booking.status.replaceAll("_", " ")}</dd></div>
          <div><dt>Stay</dt><dd>{formatBookingDate(booking.arrivalDate)} to {formatBookingDate(booking.departureDate)}</dd></div>
          <div><dt>ETA / ETD</dt><dd>{formatBookingTime(booking.eta)} / {formatBookingTime(booking.etd)}</dd></div>
          <div><dt>Vessel</dt><dd>{formatVesselName(booking.vesselName)} · {booking.vesselLengthM} × {booking.vesselBeamM} × {booking.vesselDraftM} m</dd></div>
          <div><dt>Payment summary</dt><dd>Paid · {paidTotal}</dd></div>
        </dl>

        <section className="guest-booking-editor" aria-labelledby="arrival-times-heading">
          <div>
            <p className="public-marina-section-code"><Clock3 size={14} aria-hidden="true" /> Arrival plan</p>
            <h2 id="arrival-times-heading">ETA / ETD</h2>
            <p>Times use the marina&apos;s local clock. The booked dates and vessel stay unchanged.</p>
          </div>
          {editable ? (
            <GuestTimesForm action={updateAction} eta={booking.eta} etd={booking.etd} />
          ) : (
            <p className="guest-booking-readonly">This booking is {booking.status.replaceAll("_", " ")} and is now read-only.</p>
          )}
        </section>

        <footer className="guest-booking-footer">
          <span>Link expires {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(booking.accessExpiresAt))}</span>
          <span>Do not forward this management link.</span>
        </footer>
      </div>
    </main>
  );
}
