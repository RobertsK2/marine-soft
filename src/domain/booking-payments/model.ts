import type { Booking } from "@/domain/bookings/types";
import type { BookingPaymentBalance } from "./types";

export function deriveBookingPaymentBalance(booking: Booking): BookingPaymentBalance {
  const paid = booking.source === "online" && booking.booking_payment_id ? booking.price_total_minor ?? 0 : 0;
  const total = booking.price_total_minor;
  const balance = total === null ? 0 : Math.max(total - paid, 0);
  const state = total === null || (total === 0 && booking.source !== "online")
    ? "payment_link_required"
    : balance === 0
      ? "paid_in_full"
      : "balance_due";
  return {
    id: `derived-${booking.id}`,
    marina_id: booking.marina_id,
    booking_id: booking.id,
    state,
    collection_method: state === "payment_link_required" ? "payment_link" : booking.source === "online" ? "berthio" : "on_site",
    currency: booking.price_currency,
    total_due_minor: total,
    paid_minor: paid,
    balance_due_minor: balance,
    due_at: null,
    payment_link_url: null,
    note: null,
    updated_at: booking.updated_at,
    updated_by: null,
    overdue: false,
  };
}

export function isPaymentOverdue(balance: number, dueAt: string | null, now = new Date()) {
  return balance > 0 && dueAt !== null && new Date(dueAt).getTime() < now.getTime();
}
