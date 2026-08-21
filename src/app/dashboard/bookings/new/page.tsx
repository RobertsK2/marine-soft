import { createBookingAction } from "@/app/dashboard/bookings/actions";
import { AppShell } from "@/components/app-shell";
import { BookingForm } from "@/components/bookings/booking-form";
import { requireMarinaMembership } from "@/lib/auth/session";

export const metadata = { title: "Create booking" };

export default async function NewBookingPage() {
  const context = await requireMarinaMembership("/dashboard/bookings/new");
  return (
    <AppShell
      context={context}
      description="Record a capacity booking without assigning a permanent physical berth."
      title="Create manual booking"
      wide
    >
      <BookingForm action={createBookingAction} />
    </AppShell>
  );
}
