/* eslint-disable @next/next/no-img-element -- Uses the configured public marina cover. */
import { Anchor, ArrowLeft, Check, Clock3, Compass, Download, Info, LockKeyhole, Mail, Phone, ReceiptText, Ship, XCircle } from "lucide-react";
import type { getCheckoutReturnStatus } from "@/domain/checkout/service";
import type { PublicMarina } from "@/domain/public-marinas/types";
import { berthAssignmentLabel, confirmationDateRange, confirmationMoney, confirmationPriceLines } from "@/domain/checkout/confirmation";
import { bookingNights, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { arrivalWindowLabel } from "@/domain/public-booking/types";
import { GuestFooter, GuestHeader } from "./guest-chrome";
import { CopyReference } from "./copy-reference";
import styles from "./booking-confirmation.module.css";

export type ConfirmationPayment = NonNullable<Awaited<ReturnType<typeof getCheckoutReturnStatus>>>;

export function BookingConfirmation({ payment, marina, sessionId }: { payment: ConfirmationPayment; marina: PublicMarina; sessionId: string }) {
  const paid = payment.status === "paid";
  const processing = payment.status === "processing";
  const booking = paid ? payment.confirmation : null;
  const nights = booking ? bookingNights(booking.arrivalDate, booking.departureDate) : 0;
  const lines = confirmationPriceLines(payment.priceSnapshot, payment.amountTotalMinor, payment.currency);
  const compactLines = lines.length === 3 && !lines[2].label.includes("included")
    ? [lines[0], { label: `Fees & ${lines[2].label}`, amount: lines[1].amount + lines[2].amount }]
    : lines;
  const money = (amount: number) => confirmationMoney(amount, payment.currency);
  const marinaUrl = `/marina/${encodeURIComponent(marina.slug)}`;
  return <main className={styles.page}>
    {processing ? <meta httpEquiv="refresh" content="3" /> : null}
    <GuestHeader marina={marina} />
    <div className={styles.content}>
      <section className={styles.hero} aria-labelledby="confirmation-heading">
        <div className={styles.cover}>
          {marina.coverImageUrl ? <img src={marina.coverImageUrl} alt={`${marina.name} harbour`} referrerPolicy="no-referrer" /> : <Anchor size={40} aria-hidden="true" />}
          <strong><Anchor size={18} aria-hidden="true" /> {marina.name}</strong>
        </div>
        <div className={styles.success}>
          <div className={styles.checkmark} data-state={payment.status}>{paid ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : processing ? <Clock3 size={32} aria-hidden="true" /> : <XCircle size={32} aria-hidden="true" />}</div>
          <span className={styles.badge}>{paid ? <><span className={styles.desktopText}>Berth reservation confirmed</span><span className={styles.mobileText}>Confirmed</span></> : processing ? "Confirmation in progress" : "Booking not confirmed"}</span>
          <h1 id="confirmation-heading">{paid ? "Your berth is booked!" : processing ? "Confirming your booking..." : payment.status === "unavailable" ? "This booking is cancelled" : "Payment was not completed"}</h1>
          <p>{paid ? <><span className={styles.desktopText}>{`Your payment was successful and your reservation is confirmed for ${marina.name}.`}</span><span className={styles.mobileText}>Your payment was successful and your reservation is secured.</span></> : processing ? "We’re waiting for payment confirmation. This page will update automatically." : "Contact the marina for assistance or return to the marina to check availability."}</p>
          {booking ? <div className={styles.reference}><span>Booking reference:</span> <strong>{booking.reference}</strong><CopyReference reference={booking.reference} /></div> : null}
        </div>
      </section>
      {booking ? <>
        <section className={styles.dossier} aria-label="Booking details">
          <header className={styles.dossierHeading}><Ship size={24} aria-hidden="true" /><div><h2>Vessel &amp; Stay Dossier</h2><p>{marina.name}</p></div><span>{nights} {nights === 1 ? "Night" : "Nights"}</span></header>
          <div className={styles.stay}>
            <div className={styles.dates}><span className={styles.label}>Stay dates</span><strong>{confirmationDateRange(booking.arrivalDate, booking.departureDate)}</strong><small className={styles.mobileNights}>{nights} {nights === 1 ? "night" : "nights"} total</small></div>
            <div className={styles.times}><div><span className={styles.label}>Estimated arrival</span><strong>{booking.eta ? formatBookingTime(booking.eta) : arrivalWindowLabel(booking.etaWindow)}</strong></div><div><span className={styles.label}>Departure time</span><strong>{booking.etd ? formatBookingTime(booking.etd) : "Not specified"}</strong></div></div>
            <div className={styles.vessel}><span className={styles.label}>Registered vessel</span><div><Ship size={21} aria-hidden="true" /><strong>{formatVesselName(booking.vesselName)}</strong><small>{booking.vesselLengthM}m × {booking.vesselBeamM}m × {booking.vesselDraftM}m</small></div></div>
            <div className={styles.assignment}><span className={styles.label}>Berth assignment</span><div><Info size={17} aria-hidden="true" /><span>{berthAssignmentLabel(payment.berthAssignment)}</span></div></div>
          </div>
          <section className={styles.payment} aria-labelledby="payment-heading"><header><h2 id="payment-heading"><ReceiptText size={22} aria-hidden="true" /><span className={styles.desktopText}>Payment Summary</span><span className={styles.mobileText}>Payment breakdown</span></h2><span className={styles.stripe}><LockKeyhole size={14} aria-hidden="true" />Paid via Stripe</span></header>
            <dl>{lines.length ? <>
              {lines.map((line) => <div className={styles.fullPriceLine} key={line.label}><dt>{line.label === "Berth stay" ? `Stay (${nights} ${nights === 1 ? "night" : "nights"})` : line.label}</dt><dd>{money(line.amount)}</dd></div>)}
              {compactLines.map((line) => <div className={styles.compactPriceLine} key={line.label}><dt>{line.label === "Berth stay" ? `Stay (${nights} ${nights === 1 ? "night" : "nights"})` : line.label}</dt><dd>{money(line.amount)}</dd></div>)}
            </> : <div><dt>Berth reservation</dt><dd>{money(payment.amountTotalMinor)}</dd></div>}<div className={styles.total}><dt>Total Paid <span className={styles.badge}>Paid</span></dt><dd>{money(payment.amountTotalMinor)}</dd></div></dl>
          </section>
        </section>
        <section className={styles.information} aria-label="Arrival information">
          <div><Mail size={19} aria-hidden="true" /><div><strong>{payment.emailSent ? "Confirmation sent" : "Keep your confirmation"}</strong><p>{payment.emailSent ? "Your booking confirmation has been emailed." : "Download your booking details and keep your reference for arrival."}</p></div></div>
          <div><Compass size={19} aria-hidden="true" /><div><strong>Before you arrive</strong><p>Contact the marina for arrival instructions and berth guidance.</p></div></div>
        </section>
      </> : null}
      <nav className={styles.actions} aria-label="Confirmation actions">
        {booking ? <a className={styles.download} href={`${marinaUrl}/checkout/return/confirmation?${new URLSearchParams({ session_id: sessionId })}`} download><Download size={20} aria-hidden="true" /><span className={styles.desktopText}>Download PDF Confirmation</span><span className={styles.mobileText}>Download confirmation (PDF)</span></a> : null}
        <a className={styles.back} href={marinaUrl}><ArrowLeft size={19} aria-hidden="true" />Back to marina</a>
      </nav>
      {marina.contactPhone || marina.contactEmail ? <aside className={styles.contact}><Phone size={22} aria-hidden="true" /><div><span>Marina assistance</span>{marina.contactPhone ? <a href={`tel:${marina.contactPhone}`}>{marina.contactPhone}</a> : <a href={`mailto:${marina.contactEmail}`}>{marina.contactEmail}</a>}</div>{marina.contactPhone ? <a className={styles.call} href={`tel:${marina.contactPhone}`}>Call</a> : null}</aside> : null}
    </div>
    <GuestFooter marina={marina} />
  </main>;
}
