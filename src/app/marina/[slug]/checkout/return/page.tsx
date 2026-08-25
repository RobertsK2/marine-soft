import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { getCheckoutReturnStatus } from "@/domain/checkout/service";
import { formatBookingDate, formatBookingTime, formatVesselName } from "@/domain/bookings/formatting";

export default async function CheckoutReturnPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { slug } = await params;
  const sessionId = (await searchParams).session_id;
  if (!sessionId || !/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId)) notFound();
  const payment = await getCheckoutReturnStatus(slug, sessionId);
  if (!payment) notFound();
  const paid = payment.status === "paid";
  const failed = payment.status === "failed";
  const confirmation = payment.confirmation;
  const paidTotal = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: payment.currency,
  }).format(payment.amountTotalMinor / 100);
  return (
    <main className="checkout-return">
      {!paid && !failed ? <meta httpEquiv="refresh" content="3" /> : null}
      {paid ? <CheckCircle2 size={30} /> : failed ? <XCircle size={30} /> : <Clock3 size={30} />}
      <p className="public-marina-section-code">Booking confirmation</p>
      <h1>{paid ? "Booking confirmed" : failed ? "Payment was not completed" : "Confirmation in progress"}</h1>
      {confirmation ? (
        <>
          <p>Stripe confirmed payment and marina capacity is reserved for this stay.</p>
          <dl className="checkout-confirmation-grid">
            <div><dt>Booking reference</dt><dd>{confirmation.reference}</dd></div>
            <div><dt>Marina</dt><dd>{confirmation.marinaName}</dd></div>
            <div><dt>Stay</dt><dd>{formatBookingDate(confirmation.arrivalDate)} to {formatBookingDate(confirmation.departureDate)}</dd></div>
            <div><dt>Arrival / departure</dt><dd>{formatBookingTime(confirmation.eta)} / {formatBookingTime(confirmation.etd)}</dd></div>
            <div><dt>Vessel</dt><dd>{formatVesselName(confirmation.vesselName)} · {confirmation.vesselLengthM} × {confirmation.vesselBeamM} × {confirmation.vesselDraftM} m</dd></div>
            <div><dt>Paid total</dt><dd>{paidTotal}</dd></div>
            <div><dt>Status</dt><dd>{confirmation.status.replaceAll("_", " ")}</dd></div>
          </dl>
          <section className="checkout-next-steps">
            <h2>Next steps</h2>
            <p>Keep the booking reference for marina check-in. The marina will provide arrival instructions and berth assignment separately. No specific berth has been assigned by this confirmation.</p>
          </section>
        </>
      ) : (
        <p>{failed ? "No confirmed payment or booking was recorded." : "The browser return does not confirm payment. This page refreshes until Stripe's signed webhook creates the booking."}</p>
      )}
      <a className="button button-secondary" href={`/marina/${encodeURIComponent(slug)}`}>Return to marina</a>
    </main>
  );
}
