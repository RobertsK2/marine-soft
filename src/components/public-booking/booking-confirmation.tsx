/* eslint-disable @next/next/no-img-element -- Uses the configured public marina cover. */
import { Anchor, ArrowLeft, Check, Clock3, Compass, Download, Info, LockKeyhole, Mail, Phone, ReceiptText, Ship, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { BookingConfirmationData } from "@/domain/checkout/confirmation";
import type { PublicMarina } from "@/domain/public-marinas/types";
import { berthAssignmentLabel, confirmationDateRange, confirmationMoney, confirmationPriceLines, confirmationPaymentLabel } from "@/domain/checkout/confirmation";
import { bookingNights, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { arrivalWindowLabel } from "@/domain/public-booking/types";
import { GuestFooter, GuestHeader } from "./guest-chrome";
import { CopyReference } from "./copy-reference";
import styles from "./booking-confirmation.module.css";

export type ConfirmationPayment = BookingConfirmationData;

export function BookingConfirmation({ payment, marina, sessionId, children }: { payment: ConfirmationPayment; marina: PublicMarina; sessionId?: string; children?: ReactNode }) {
  const confirmed = payment.status === "paid" || payment.status === "confirmed";
  const online = payment.paymentMethod === "online";
  const paymentLabel = confirmationPaymentLabel(payment);
  const processing = payment.status === "processing";
  const booking = confirmed || children ? payment.confirmation : null;
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
          <div className={styles.checkmark} data-state={payment.status}>{confirmed ? <Check size={34} strokeWidth={3} aria-hidden="true" /> : processing ? <Clock3 size={32} aria-hidden="true" /> : <XCircle size={32} aria-hidden="true" />}</div>
          <span className={styles.badge}>{confirmed ? <><span className={styles.desktopText}>Berth reservation confirmed</span><span className={styles.mobileText}>Confirmed</span></> : processing ? "Confirmation in progress" : "Booking not confirmed"}</span>
          <h1 id="confirmation-heading">{confirmed ? "Booking confirmed" : processing ? "Confirming your booking..." : payment.status === "unavailable" ? "This booking is cancelled" : "Payment was not completed"}</h1>
          <p>{confirmed ? online ? <><span className={styles.desktopText}>{`Your payment was successful and your reservation is confirmed for ${marina.name}.`}</span><span className={styles.mobileText}>Your payment was successful and your reservation is secured.</span></> : payment.balanceDueMinor > 0 ? "Your reservation is confirmed. Payment will be collected directly by the marina." : "Your reservation is confirmed. Payment has been recorded by the marina." : processing ? "We’re waiting for payment confirmation. This page will update automatically." : "Contact the marina for assistance or return to the marina to check availability."}</p>
          {booking ? <div className={styles.reference}><span>Booking reference:</span> <strong>{booking.reference}</strong><CopyReference reference={booking.reference} /></div> : null}
        </div>
      </section>
      {booking ? <>
        <section className={styles.dossier} aria-label="Booking details">
          <header className={styles.dossierHeading}><Ship size={24} aria-hidden="true" /><div><h2>Vessel &amp; Stay Dossier</h2><p>{marina.name}</p></div><span>{nights} {nights === 1 ? "Night" : "Nights"}</span></header>
          <p className={styles.bookingStatus}>Booking status: {booking.status.replaceAll("_", " ")}</p>
          <div className={styles.stay}>
            <div className={styles.dates}><span className={styles.label}>Stay dates</span><strong>{confirmationDateRange(booking.arrivalDate, booking.departureDate)}</strong><small className={styles.mobileNights}>{nights} {nights === 1 ? "night" : "nights"} total</small></div>
            <div className={styles.times}><div><span className={styles.label}>Estimated arrival</span><strong>{booking.eta ? formatBookingTime(booking.eta) : arrivalWindowLabel(booking.etaWindow)}</strong></div><div><span className={styles.label}>Departure time</span><strong>{booking.etd ? formatBookingTime(booking.etd) : "Not specified"}</strong></div></div>
            <div className={styles.vessel}><span className={styles.label}>Registered vessel</span><div><Ship size={21} aria-hidden="true" /><strong>{formatVesselName(booking.vesselName)}</strong><small>{booking.vesselLengthM}m × {booking.vesselBeamM}m × {booking.vesselDraftM}m</small></div></div>
            <div className={styles.assignment}><span className={styles.label}>Berth assignment</span><div><Info size={17} aria-hidden="true" /><span>{berthAssignmentLabel(payment.berthAssignment)}</span></div></div>
          </div>
          <section className={styles.payment} aria-labelledby="payment-heading"><header><h2 id="payment-heading"><ReceiptText size={22} aria-hidden="true" /><span className={styles.desktopText}>Payment Summary</span><span className={styles.mobileText}>Payment breakdown</span></h2><span className={styles.stripe}>{online ? <LockKeyhole size={14} aria-hidden="true" /> : <ReceiptText size={14} aria-hidden="true" />}{online ? "Pay Online" : "Pay at Marina"}</span></header>
            <dl><div><dt>Payment method</dt><dd>{online ? "Pay Online" : "Pay at Marina"}</dd></div>{lines.length ? <>
              {lines.map((line) => <div className={styles.fullPriceLine} key={line.label}><dt>{line.label === "Berth stay" ? `Stay (${nights} ${nights === 1 ? "night" : "nights"})` : line.label}</dt><dd>{money(line.amount)}</dd></div>)}
              {compactLines.map((line) => <div className={styles.compactPriceLine} key={line.label}><dt>{line.label === "Berth stay" ? `Stay (${nights} ${nights === 1 ? "night" : "nights"})` : line.label}</dt><dd>{money(line.amount)}</dd></div>)}
            </> : <div><dt>Berth reservation</dt><dd>{money(payment.amountTotalMinor)}</dd></div>}<div className={styles.total}><dt>Booking total <span className={styles.badge}>{paymentLabel}</span></dt><dd>{money(payment.amountTotalMinor)}</dd></div><div><dt>Amount paid</dt><dd>{money(payment.paidMinor)}</dd></div><div><dt>Outstanding balance</dt><dd>{money(payment.balanceDueMinor)}</dd></div></dl>
          </section>
        </section>
        <section className={styles.information} aria-label="Arrival information">
          <div><Mail size={19} aria-hidden="true" /><div><strong>{payment.emailSent ? "Confirmation sent" : "Keep your confirmation"}</strong><p>{payment.emailSent ? "Your booking confirmation has been emailed." : "Keep your booking reference and details for arrival."}</p></div></div>
          <div><Compass size={19} aria-hidden="true" /><div><strong>Before you arrive</strong><p>Contact the marina for arrival instructions and berth guidance.</p></div></div>
        </section>
      </> : null}
      {children}
      <nav className={styles.actions} aria-label="Confirmation actions">
        {booking && sessionId ? <a className={styles.download} href={`${marinaUrl}/checkout/return/confirmation?${new URLSearchParams({ session_id: sessionId })}`} download><Download size={20} aria-hidden="true" /><span className={styles.desktopText}>Download PDF Confirmation</span><span className={styles.mobileText}>Download confirmation (PDF)</span></a> : null}
        {confirmed && payment.guestManagementUrl ? <a className={styles.back} href={payment.guestManagementUrl}>Manage booking</a> : null}
        <a className={styles.back} href={marinaUrl}><ArrowLeft size={19} aria-hidden="true" />Back to marina</a>
      </nav>
      {marina.contactPhone || marina.contactEmail ? <aside className={styles.contact}><Phone size={22} aria-hidden="true" /><div><span>Marina assistance</span>{marina.contactPhone ? <a href={`tel:${marina.contactPhone}`}>{marina.contactPhone}</a> : <a href={`mailto:${marina.contactEmail}`}>{marina.contactEmail}</a>}</div>{marina.contactPhone ? <a className={styles.call} href={`tel:${marina.contactPhone}`}>Call</a> : null}</aside> : null}
    </div>
    <GuestFooter marina={marina} />
  </main>;
}
