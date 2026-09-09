import { Anchor, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignBookingBerthAction, confirmBookingExtensionAction, previewBookingExtensionAction, transitionBookingStayAction, updateBookingDetailsAction, updateBookingPaymentStateAction, updateBookingStatusAction } from "@/app/dashboard/bookings/actions";
import { AppShell } from "@/components/app-shell";
import { AuditHistory } from "@/components/audit-log/audit-history";
import { BookingStatusBadge } from "@/components/bookings/booking-status";
import { BookingStatusForm } from "@/components/bookings/booking-status-form";
import { BookingOperationalTransition } from "@/components/bookings/booking-operational-transition";
import { BerthAssignmentForm } from "@/components/bookings/berth-assignment-form";
import { BookingChangeForm } from "@/components/bookings/booking-change-form";
import { BookingExtensionForm } from "@/components/bookings/booking-extension-form";
import { BookingPaymentBalanceForm } from "@/components/bookings/booking-payment-balance-form";
import { getBookingBerthAssignmentState } from "@/domain/berth-assignments/repository";
import { listBookingAuditEvents } from "@/domain/audit-log/repository";
import { bookingNights, formatBookingDate, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { getBooking, getBookingPaymentBalance, listBookingPriceAdjustments } from "@/domain/bookings/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import shellStyles from "../../overview.module.css";
import styles from "./booking-detail.module.css";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const context = await requireMarinaMembership(`/dashboard/bookings/${bookingId}`);
  const supabase = await createClient();
  const booking = await getBooking(supabase, context.marinaId, bookingId);
  if (!booking) notFound();
  const [assignment, priceAdjustments, paymentBalance, auditEvents] = await Promise.all([
    getBookingBerthAssignmentState(supabase, context.marinaId, booking),
    listBookingPriceAdjustments(supabase, context.marinaId, booking.id),
    getBookingPaymentBalance(supabase, context.marinaId, booking),
    listBookingAuditEvents(supabase, context.marinaId, booking.id),
  ]);
  const statusAction = updateBookingStatusAction.bind(null, booking.id, booking.updated_at);
  const paymentAction = updateBookingPaymentStateAction.bind(null, booking.id);
  const changeAction = updateBookingDetailsAction.bind(null, booking.id, booking.updated_at);
  const assignmentAction = assignBookingBerthAction.bind(null, booking.id);
  const operationalAction = transitionBookingStayAction.bind(null, booking.id);
  const extensionPreviewAction = previewBookingExtensionAction.bind(null, booking.id, booking.updated_at);
  const extensionConfirmAction = confirmBookingExtensionAction.bind(null, booking.id, booking.updated_at);
  const hasPlannedMove = assignment.plannedMoves.length > 0;
  const paidTotal = booking.price_currency && booking.price_total_minor !== null
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: booking.price_currency }).format(booking.price_total_minor / 100)
    : null;
  const latestAdjustment = priceAdjustments[0] ?? null;
  const revisedTotal = booking.price_currency && latestAdjustment
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: booking.price_currency }).format(latestAdjustment.revised_price_total_minor / 100)
    : paidTotal;

  const currentBerth = assignment.options.find((option) => option.berthId === assignment.current?.berthId);
  const money = (amount: number | null) => amount === null ? "Not recorded" : paymentBalance.currency
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: paymentBalance.currency }).format(amount / 100)
    : `${(amount / 100).toFixed(2)} (currency not recorded)`;
  const actualTime = (value: string | null) => value ? new Date(value).toLocaleString("en-GB", { timeZone: context.timezone }) : null;

  return <AppShell context={context} title={booking.reference} description="Booking details" wide
    className={shellStyles.overview} activePage="bookings"
    overviewHeader={<header className={styles.breadcrumb}><Link href="/dashboard/bookings">Bookings</Link><span>/</span><strong>{booking.reference}</strong><span>{booking.customer_name}</span><small>{context.marinaName}</small></header>}>
    <div className={styles.detail}>
      <Link className={styles.back} href="/dashboard/bookings"><ArrowLeft size={16} aria-hidden="true" />Back to bookings</Link>
      <header className={styles.heading}><h1>{booking.reference}</h1><span>{booking.customer_name}</span><small>{formatVesselName(booking.vessel_name)}</small><BookingStatusBadge status={booking.status} /></header>
      <div className={styles.primaryAction}><BookingOperationalTransition action={operationalAction} hasAssignment={Boolean(assignment.current)} status={booking.status} /></div>
      <div className={styles.workspace}>
        <div className={styles.mainCard}>
          <section className={styles.berthSummary} aria-label="Berth summary"><span className={styles.berthCode}>{assignment.current?.berthCode ?? <Anchor size={26} aria-hidden="true" />}</span><div><h2>{assignment.current ? `Berth ${assignment.current.berthCode}` : "No berth assigned"}</h2><p>{currentBerth ? `${currentBerth.zone} / ${currentBerth.maxLengthM} m max length / ${currentBerth.maxDraftM} m max draft` : assignment.current ? "Current physical berth assignment" : "Capacity booking / physical assignment pending"}</p>{hasPlannedMove ? <p>{assignment.plannedMoves.length} planned berth move(s) - see assignment schedule</p> : null}</div></section>
          <section className={styles.stay} aria-label="Stay window">
            <div><span>Stay duration</span><strong>{bookingNights(booking.arrival_date, booking.departure_date)} nights</strong><p>{formatBookingDate(booking.arrival_date)} to {formatBookingDate(booking.departure_date)}</p></div>
            <div><span>Arrival / ETA</span><strong>{formatBookingDate(booking.arrival_date)}</strong><p>{formatBookingTime(booking.eta)} / {context.timezone}</p></div>
            <div><span>Departure / ETD</span><strong>{formatBookingDate(booking.departure_date)}</strong><p>{formatBookingTime(booking.etd)} / {context.timezone}</p></div>
          </section>
          <section className={styles.progression}><h2>Arrival & departure progression</h2><div>
            <article><small>01 / Booking</small><strong>{booking.status === "cancelled" ? "Cancelled" : "Confirmed stay"}</strong><p>{booking.source === "online" ? "Online" : "Manual"}</p></article>
            <article data-complete={Boolean(booking.actual_check_in_at)}><small>02 / Arrival</small><strong>{booking.actual_check_in_at ? "Checked in" : "Not checked in"}</strong><p>{actualTime(booking.actual_check_in_at) ?? `Scheduled ${formatBookingTime(booking.eta)}`}</p></article>
            <article data-complete={Boolean(booking.actual_check_out_at)}><small>03 / Departure</small><strong>{booking.actual_check_out_at ? "Checked out" : "Not checked out"}</strong><p>{actualTime(booking.actual_check_out_at) ?? `Scheduled ${formatBookingTime(booking.etd)}`}</p></article>
          </div></section>
          <section className={styles.guest}><h2>Guest & vessel specifications</h2><div>
            <div><strong>{booking.customer_name}</strong><p>{booking.customer_email}</p><p>{booking.customer_phone}</p></div>
            <dl><div><dt>Vessel</dt><dd>{formatVesselName(booking.vessel_name)}</dd></div><div><dt>Length</dt><dd>{booking.vessel_length_m} m</dd></div><div><dt>Beam / draft</dt><dd>{booking.vessel_beam_m} m / {booking.vessel_draft_m} m</dd></div></dl>
          </div></section>
        </div>
        <aside className={styles.side} aria-label="Booking actions and financial summary">
          <section className={styles.card}><h2>Operational actions</h2>
<details className={styles.disclosure} ><summary>Edit booking details</summary><div className={styles.formBody}>
          {booking.status === "confirmed" && !hasPlannedMove ? (
            <BookingChangeForm action={changeAction} booking={booking} />
          ) : (
            <p className="assignment-intro">{hasPlannedMove
              ? "General date and vessel editing is locked while a confirmed move schedule exists. Use the extension control for further added nights."
              : "Only confirmed bookings can be edited in this phase. Operational and closed stays remain unchanged."}</p>
          )}
        </div></details><details className={styles.disclosure} ><summary>Assign / reassign berth</summary><div className={styles.formBody}>
          <p className="assignment-intro">Manual confirmation only. Berthio checks operational state, vessel fit, tenant ownership, and overlapping assignments before saving.</p>
          <BerthAssignmentForm
            action={assignmentAction}
            assignable={booking.status === "confirmed" && !hasPlannedMove}
            assignment={assignment}
            lockReason={hasPlannedMove ? "Direct reassignment is locked while a planned extension move exists." : undefined}
          />
        </div></details><details className={styles.disclosure} ><summary>Extend stay / berth moves</summary><div className={styles.formBody}>
          <p className="assignment-intro">Preview first. Berthio reruns capacity, current-berth fit, assignment conflicts, and server pricing before confirmation.</p>
          {["confirmed", "checked_in"].includes(booking.status) ? (
            <BookingExtensionForm
              confirmAction={extensionConfirmAction}
              currentDeparture={booking.departure_date}
              previewAction={extensionPreviewAction}
            />
          ) : <p className="assignment-warning">Cancelled and checked-out bookings cannot be extended.</p>}
        </div></details>
          </section>
          <section className={styles.card}><h2>Financial & billing</h2><p className={styles.paymentState}>{paymentBalance.collection_method === "on_site" && paymentBalance.balance_due_minor > 0 ? "Due at marina" : paymentBalance.state.replaceAll("_", " ")}</p><dl className={styles.money}>
            <div><dt>Total amount</dt><dd>{money(paymentBalance.total_due_minor)}</dd></div><div><dt>Recorded paid</dt><dd>{money(paymentBalance.paid_minor)}</dd></div><div><dt>Balance due</dt><dd>{money(paymentBalance.balance_due_minor)}</dd></div>
          </dl>{paymentBalance.overdue ? <p className={styles.warning}>Overdue - booking remains active</p> : null}
<details className={styles.disclosure} ><summary>Manage payment / staff note</summary><div className={styles.formBody}>
          <p className="assignment-intro">Track the next collection action. Overdue balances are warnings only and never cancel a booking automatically.</p>
          <BookingPaymentBalanceForm action={paymentAction} balance={paymentBalance} />
        </div></details></section>
          <section className={styles.card}><h2>Payment staff note</h2><p className={styles.note}>{paymentBalance.note || "No staff note recorded."}</p><small>Edit using Manage payment / staff note above.</small></section>
          {booking.status === "confirmed" ? <section className={`${styles.card} ${styles.cancellation}`}><h2>Cancellation</h2><details className={styles.disclosure}><summary>Review cancellation</summary><div className={styles.formBody}><BookingStatusForm action={statusAction} status={booking.status} /></div></details></section> : null}
        </aside>
      </div>
      <section className={styles.records} aria-label="Booking records"><details className={styles.disclosure} ><summary>Booking record</summary><div className={styles.formBody}>
          <dl>
            <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Source</dt><dd>{booking.source === "online" ? "Online · Stripe paid" : "Manual"}</dd></div>
            {paidTotal ? <div><dt>Original price snapshot</dt><dd>{paidTotal}</dd></div> : null}
            {revisedTotal && revisedTotal !== paidTotal ? <div><dt>Current revised total</dt><dd>{revisedTotal}</dd></div> : null}
            <div><dt>Booking ID</dt><dd className="mono-cell">{booking.id}</dd></div>
            <div><dt>Actual check-in</dt><dd>{booking.actual_check_in_at ? `${new Date(booking.actual_check_in_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked in"}</dd></div>
            <div><dt>Actual check-out</dt><dd>{booking.actual_check_out_at ? `${new Date(booking.actual_check_out_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked out"}</dd></div>
            {booking.check_in_without_assignment ? <div><dt>Berth exception</dt><dd>Checked in without assignment — explicitly confirmed</dd></div> : null}
          </dl>
        </div></details>{paidTotal ? <details className={styles.disclosure} ><summary>Financial history</summary><div className={styles.formBody}>
            <dl>
              <div><dt>Original price snapshot</dt><dd>{paidTotal}</dd></div>
              <div><dt>Revised total</dt><dd>{revisedTotal}</dd></div>
              <div><dt>Position</dt><dd>{latestAdjustment
                ? latestAdjustment.difference_from_paid_minor > 0
                  ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: latestAdjustment.currency }).format(latestAdjustment.difference_from_paid_minor / 100)} due`
                  : latestAdjustment.difference_from_paid_minor < 0
                    ? `${new Intl.NumberFormat("en-GB", { style: "currency", currency: latestAdjustment.currency }).format(Math.abs(latestAdjustment.difference_from_paid_minor) / 100)} refundable — not refunded`
                    : "Settled against original payment"
                : "No price adjustments"}</dd></div>
            </dl>
            {priceAdjustments.length > 0 ? (
              <ol className="booking-price-history">
                {priceAdjustments.map((adjustment) => (
                  <li key={adjustment.id}>
                    <time dateTime={adjustment.changed_at}>{new Date(adjustment.changed_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time>
                    <span>{new Intl.NumberFormat("en-GB", { style: "currency", currency: adjustment.currency }).format(adjustment.previous_price_total_minor / 100)} → {new Intl.NumberFormat("en-GB", { style: "currency", currency: adjustment.currency }).format(adjustment.revised_price_total_minor / 100)}</span>
                    <small>{adjustment.difference_from_paid_minor > 0 ? "Amount due" : adjustment.difference_from_paid_minor < 0 ? "Refundable · not issued" : "Settled"}</small>
                  </li>
                ))}
              </ol>
            ) : <p className="map-readonly-note">No repricing history. The original payment snapshot is unchanged.</p>}
          </div></details> : null}</section>
      <AuditHistory events={auditEvents} timezone={context.timezone} title="History / Activity" />
    </div>
  </AppShell>;
}
