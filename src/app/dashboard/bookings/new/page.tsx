import { createBookingAction } from "@/app/dashboard/bookings/actions";
import { AppShell } from "@/components/app-shell";
import { BookingForm } from "@/components/bookings/booking-form";
import { requireMarinaMembership } from "@/lib/auth/session";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import shellStyles from "../../overview.module.css";
import styles from "@/components/bookings/create-booking.module.css";

export const metadata = { title: "Create booking" };

export default async function NewBookingPage() {
  const context = await requireMarinaMembership("/dashboard/bookings/new");
  return (
    <AppShell
      className={shellStyles.overview}
      activePage="bookings"
      overviewHeader={<div className={styles.breadcrumb}><Link href="/dashboard/bookings">Bookings</Link><span>/</span><strong>New booking</strong><small>{context.marinaName}</small></div>}
      context={context}
      description="Record a capacity booking without assigning a permanent physical berth."
      title="Create manual booking"
      wide
    >
      <Link className={styles.back} href="/dashboard/bookings"><ArrowLeft size={16} aria-hidden="true" />Back to bookings</Link>
      <header className={styles.pageHeading}><h1>Create manual booking</h1><span>Manual entry</span></header>
      <BookingForm action={createBookingAction} timezone={context.timezone} />
    </AppShell>
  );
}
