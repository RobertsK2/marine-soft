import type { Booking } from "@/domain/bookings/types";
import type { BookingPaymentBalance } from "./types";

export function bookingCollectionMethodLabel(method: BookingPaymentBalance["collection_method"]) {
  return {
    berthio: "Pay Online",
    on_site: "Pay at Marina",
    outside_berthio: "Paid directly to marina",
    payment_link: "Payment link",
  }[method];
}

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
    collection_method: state === "payment_link_required" ? "payment_link" : booking.booking_payment_id ? "berthio" : "on_site",
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

export function formatPaymentDueAtInput(dueAt: string | null, timezone: string) {
  if (dueAt === null) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(dueAt));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}
