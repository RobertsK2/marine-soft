import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { updateGuestBookingTimesAction } from "@/app/guest/bookings/[token]/actions";
import { GuestTimesForm } from "@/components/guest-booking/guest-times-form";
import { BookingConfirmation } from "@/components/public-booking/booking-confirmation";
import { loadGuestBookingConfirmation } from "@/domain/guest-access/confirmation";
import styles from "@/components/public-booking/booking-confirmation.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Manage booking",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function GuestBookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await loadGuestBookingConfirmation(token);
  if (!result) notFound();
  const { booking, marina, payment } = result;
  const updateAction = updateGuestBookingTimesAction.bind(null, token);
  return <BookingConfirmation payment={payment} marina={marina}>
    <section className={`${styles.dossier} ${styles.management}`} aria-labelledby="arrival-times-heading">
      <h2 id="arrival-times-heading">ETA / ETD</h2>
      <p>Times use the marina&apos;s local clock. Arrival and departure times are optional.</p>
      <p>Cancellation, refunds, vessel changes, and customer details require marina assistance.</p>
      {booking.status === "confirmed" ? <GuestTimesForm action={updateAction} eta={booking.eta} etd={booking.etd} /> : <p>This booking is {booking.status.replaceAll("_", " ")} and is now read-only.</p>}
      <footer>
        <span>Link expires {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: marina.timezone }).format(new Date(booking.accessExpiresAt))}</span>
        <span>Do not forward this management link.</span>
      </footer>
    </section>
  </BookingConfirmation>;
}
