import { Anchor, ArrowLeft, CalendarRange, Contact, CreditCard, PencilRuler, Ruler } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { assignBookingBerthAction, transitionBookingStayAction, updateBookingDetailsAction, updateBookingStatusAction } from "@/app/dashboard/bookings/actions";
import { AppShell } from "@/components/app-shell";
import { BookingStatusBadge } from "@/components/bookings/booking-status";
import { BookingStatusForm } from "@/components/bookings/booking-status-form";
import { BookingOperationalTransition } from "@/components/bookings/booking-operational-transition";
import { BerthAssignmentForm } from "@/components/bookings/berth-assignment-form";
import { BookingChangeForm } from "@/components/bookings/booking-change-form";
import { getBookingBerthAssignmentState } from "@/domain/berth-assignments/repository";
import { bookingNights, formatBookingDate, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";
import { getBooking, listBookingPriceAdjustments } from "@/domain/bookings/repository";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

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
  const [assignment, priceAdjustments] = await Promise.all([
    getBookingBerthAssignmentState(supabase, context.marinaId, booking),
    listBookingPriceAdjustments(supabase, context.marinaId, booking.id),
  ]);
  const statusAction = updateBookingStatusAction.bind(null, booking.id);
  const changeAction = updateBookingDetailsAction.bind(null, booking.id, booking.updated_at);
  const assignmentAction = assignBookingBerthAction.bind(null, booking.id);
  const operationalAction = transitionBookingStayAction.bind(null, booking.id);
  const paidTotal = booking.price_currency && booking.price_total_minor !== null
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: booking.price_currency }).format(booking.price_total_minor / 100)
    : null;
  const latestAdjustment = priceAdjustments[0] ?? null;
  const revisedTotal = booking.price_currency && latestAdjustment
    ? new Intl.NumberFormat("en-GB", { style: "currency", currency: booking.price_currency }).format(latestAdjustment.revised_price_total_minor / 100)
    : paidTotal;

  return (
    <AppShell
      context={context}
      description="Customer and vessel snapshots for one guaranteed-capacity stay."
      title={booking.reference}
      wide
    >
      <div className="detail-toolbar">
        <Link className="text-link" href="/dashboard/bookings"><ArrowLeft size={16} aria-hidden="true" />Back to bookings</Link>
        <BookingStatusBadge status={booking.status} />
      </div>

      <div className="booking-detail-grid">
        <section className="booking-detail-panel booking-change-panel">
          <div className="panel-heading"><PencilRuler size={18} aria-hidden="true" /><h2>Edit booking details</h2></div>
          {booking.status === "confirmed" ? (
            <BookingChangeForm action={changeAction} booking={booking} />
          ) : (
            <p className="assignment-intro">Only confirmed bookings can be edited in this phase. Operational and closed stays remain unchanged.</p>
          )}
        </section>

        <section className="booking-detail-panel booking-assignment-panel">
          <div className="panel-heading"><Anchor size={18} aria-hidden="true" /><h2>Physical berth assignment</h2></div>
          <p className="assignment-intro">Manual confirmation only. Berthio checks operational state, vessel fit, tenant ownership, and overlapping assignments before saving.</p>
          <BerthAssignmentForm
            action={assignmentAction}
            assignable={booking.status === "confirmed"}
            assignment={assignment}
          />
        </section>

        <section className="booking-detail-panel booking-stay-panel">
          <div className="panel-heading"><CalendarRange size={18} aria-hidden="true" /><h2>Stay window</h2></div>
          <dl>
            <div><dt>Arrival / ETA</dt><dd>{formatBookingDate(booking.arrival_date)} / {formatBookingTime(booking.eta)}</dd></div>
            <div><dt>Departure / ETD</dt><dd>{formatBookingDate(booking.departure_date)} / {formatBookingTime(booking.etd)}</dd></div>
            <div><dt>Occupied nights</dt><dd>{bookingNights(booking.arrival_date, booking.departure_date)}</dd></div>
          </dl>
        </section>

        <section className="booking-detail-panel">
          <div className="panel-heading"><Contact size={18} aria-hidden="true" /><h2>Current customer details</h2></div>
          <dl>
            <div><dt>Name</dt><dd>{booking.customer_name}</dd></div>
            <div><dt>Email</dt><dd>{booking.customer_email}</dd></div>
            <div><dt>Phone</dt><dd>{booking.customer_phone}</dd></div>
          </dl>
        </section>

        <section className="booking-detail-panel">
          <div className="panel-heading"><Ruler size={18} aria-hidden="true" /><h2>Current vessel data</h2></div>
          <dl>
            <div><dt>Vessel</dt><dd>{formatVesselName(booking.vessel_name)}</dd></div>
            <div><dt>Length</dt><dd>{booking.vessel_length_m} m</dd></div>
            <div><dt>Beam / Draft</dt><dd>{booking.vessel_beam_m} m / {booking.vessel_draft_m} m</dd></div>
          </dl>
        </section>

        <section className="booking-detail-panel">
          <div className="panel-heading"><h2>Booking record</h2></div>
          <dl>
            <div><dt>Reference</dt><dd>{booking.reference}</dd></div>
            <div><dt>Source</dt><dd>{booking.source === "online" ? "Online · Stripe paid" : "Manual"}</dd></div>
            {paidTotal ? <div><dt>Original paid total</dt><dd>{paidTotal}</dd></div> : null}
            {revisedTotal && revisedTotal !== paidTotal ? <div><dt>Current revised total</dt><dd>{revisedTotal}</dd></div> : null}
            <div><dt>Booking ID</dt><dd className="mono-cell">{booking.id}</dd></div>
            <div><dt>Actual check-in</dt><dd>{booking.actual_check_in_at ? `${new Date(booking.actual_check_in_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked in"}</dd></div>
            <div><dt>Actual check-out</dt><dd>{booking.actual_check_out_at ? `${new Date(booking.actual_check_out_at).toLocaleString("en-GB", { timeZone: "UTC" })} UTC` : "Not checked out"}</dd></div>
            {booking.check_in_without_assignment ? <div><dt>Berth exception</dt><dd>Checked in without assignment — explicitly confirmed</dd></div> : null}
          </dl>
          <BookingOperationalTransition action={operationalAction} hasAssignment={Boolean(assignment.current)} status={booking.status} />
          <BookingStatusForm action={statusAction} status={booking.status} />
        </section>

        {paidTotal ? (
          <section className="booking-detail-panel booking-financial-panel">
            <div className="panel-heading"><CreditCard size={18} aria-hidden="true" /><h2>Financial history</h2></div>
            <dl>
              <div><dt>Paid snapshot</dt><dd>{paidTotal}</dd></div>
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
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
