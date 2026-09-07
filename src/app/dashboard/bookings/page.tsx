import { CalendarDays, Clock3, LogIn, LogOut } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { BookingsList } from "@/components/bookings/bookings-list";
import { bookingPaymentLabel, bookingStayLabel } from "@/components/bookings/bookings-list-model";
import { listBookings } from "@/domain/bookings/repository";
import { listBerths } from "@/domain/berths/repository";
import { listBerthAssignments } from "@/domain/berth-assignments/repository";
import { deriveBookingPaymentBalance } from "@/domain/booking-payments/model";
import { deriveOverviewMetrics, marinaDateKey } from "@/domain/overview/model";
import { requireMarinaMembership } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import shellStyles from "../overview.module.css";
import styles from "@/components/bookings/bookings-list.module.css";

export const metadata = { title: "Bookings" };

export default async function BookingsPage() {
  const context = await requireMarinaMembership("/dashboard/bookings");
  const supabase = await createClient();
  const [bookings, berths, assignments, paymentResult] = await Promise.all([
    listBookings(supabase, context.marinaId),
    listBerths(supabase, context.marinaId),
    listBerthAssignments(supabase, context.marinaId),
    supabase.from("booking_payment_balances").select("booking_id,state,balance_due_minor,currency").eq("marina_id", context.marinaId),
  ]);
  if (paymentResult.error) throw new Error("Unable to load booking payment balances.");
  const paymentByBooking = new Map(paymentResult.data.map((balance) => [balance.booking_id, balance]));
  const berthById = new Map(berths.map((berth) => [berth.id, berth.code]));
  const now = new Date();
  const today = marinaDateKey(now, context.timezone);
  const metrics = deriveOverviewMetrics(bookings, berths, today);
  const rows = bookings.map((booking) => {
    const balance = paymentByBooking.get(booking.id) ?? deriveBookingPaymentBalance(booking);
    const berthCodes = [...new Set(assignments
      .filter((assignment) => assignment.booking_id === booking.id && assignment.ended_at === null)
      .sort((left, right) => left.arrival_date.localeCompare(right.arrival_date))
      .map((assignment) => berthById.get(assignment.berth_id) ?? "Unknown berth"))];
    return {
      id: booking.id, reference: booking.reference, customer_name: booking.customer_name,
      customer_email: booking.customer_email, vessel_name: booking.vessel_name,
      arrival_date: booking.arrival_date, departure_date: booking.departure_date,
      eta: booking.eta, etd: booking.etd, status: booking.status, source: booking.source,
      berthCodes, payment: bookingPaymentLabel(balance), stayLabel: bookingStayLabel(booking.arrival_date, booking.departure_date),
    };
  });

  return <AppShell context={context} title="Bookings" description="Marina bookings" wide
    className={shellStyles.overview} activePage="bookings"
    overviewHeader={<header className={shellStyles.topbar}>
      <div><h1>Bookings</h1><p>{context.marinaName}</p></div>
      <div className={shellStyles.date}><CalendarDays size={18} aria-hidden="true" /><div><time dateTime={today}>Today, {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: context.timezone }).format(now)}</time><small>{context.timezone}</small></div></div>
    </header>}>
    <section className={styles.kpis} aria-label="Booking status summary">
      <article><span className={styles.icon}><LogIn size={22} aria-hidden="true" /></span><div><h2>Arrivals today</h2><strong>{metrics.arrivalsToday}</strong><p>Scheduled for today</p></div></article>
      <article><span className={styles.icon}><LogOut size={22} aria-hidden="true" /></span><div><h2>Departures today</h2><strong>{metrics.departuresToday}</strong><p>Scheduled for today</p></div></article>
      <article><span className={styles.icon}><Clock3 size={22} aria-hidden="true" /></span><div><h2>Confirmed bookings</h2><strong>{bookings.filter(({ status }) => status === "confirmed").length}</strong><p>Total confirmed</p></div></article>
    </section>
    <BookingsList rows={rows} />
  </AppShell>;
}
