import type { Booking } from "@/domain/bookings/types";
import { deriveBookingPaymentBalance } from "@/domain/booking-payments/model";
import { marinaDateKey } from "@/domain/overview/model";
import type { Database } from "@/types/database";

type Balance = Database["public"]["Tables"]["booking_payment_balances"]["Row"];
export type LedgerPayment = Pick<Database["public"]["Tables"]["booking_payments"]["Row"], "id" | "status" | "amount_total_minor" | "currency" | "updated_at">;
export const PAYMENT_LABELS = {
  paid_in_full: "Paid", deposit_paid: "Partial", balance_due: "Unpaid",
  paid_outside_berthio: "Paid outside Berthio", payment_link_required: "Link required",
  pending: "Pending", failed: "Failed", expired: "Expired", paid: "Paid",
};
const METHODS = { berthio: "Berthio", outside_berthio: "Outside Berthio", payment_link: "Payment link", on_site: "Pay on site" };
export type LedgerRow = {
  id: string; bookingId: string | null; reference: string; guest: string; vessel: string | null;
  amount: number | null; paid: number; due: number; currency: string | null;
  status: keyof typeof PAYMENT_LABELS; method: string | null; updatedAt: string; dateKey: string;
};

export function buildLedgerRows(bookings: Booking[], balances: Balance[], payments: LedgerPayment[], timeZone: string): LedgerRow[] {
  const byBooking = new Map(balances.map((balance) => [balance.booking_id, balance]));
  const linkedPayments = new Set(bookings.map((booking) => booking.booking_payment_id).filter(Boolean));
  const rows: LedgerRow[] = bookings.map((booking) => {
    const recorded = byBooking.get(booking.id);
    const balance = recorded ?? deriveBookingPaymentBalance(booking);
    return {
      id: booking.id, bookingId: booking.id, reference: booking.reference, guest: booking.customer_name,
      vessel: booking.vessel_name, amount: balance.total_due_minor, paid: balance.paid_minor,
      due: balance.balance_due_minor, currency: balance.currency, status: balance.state,
      // A derived collection preference is not evidence of a recorded method.
      method: recorded ? METHODS[recorded.collection_method] : null,
      updatedAt: balance.updated_at, dateKey: marinaDateKey(new Date(balance.updated_at), timeZone),
    };
  });
  for (const payment of payments) {
    if (linkedPayments.has(payment.id)) continue;
    rows.push({
      id: payment.id, bookingId: null, reference: "Not booked", guest: "Not recorded", vessel: null,
      amount: payment.amount_total_minor, paid: payment.status === "paid" ? payment.amount_total_minor : 0,
      due: 0, currency: payment.currency, status: payment.status, method: null,
      updatedAt: payment.updated_at, dateKey: marinaDateKey(new Date(payment.updated_at), timeZone),
    });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
}

export function filterLedgerRows(rows: LedgerRow[], query: string, status: string, from: string, to: string) {
  const search = query.trim().toLocaleLowerCase();
  return rows.filter((row) => (!search || [row.reference, row.guest, row.vessel].some((value) => value?.toLocaleLowerCase().includes(search)))
    && (!status || row.status === status || (status === "paid" && row.status === "paid_in_full"))
    && (!from || row.dateKey >= from) && (!to || row.dateKey <= to));
}

export function ledgerMoney(amount: number | null, currency: string | null): string {
  if (amount === null) return "Not recorded";
  if (!currency) return `${(amount / 100).toFixed(2)} (currency unknown)`;
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amount / 100);
}

export function ledgerTotals(rows: LedgerRow[], kind: "paid" | "due" | "pending") {
  const totals = new Map<string | null, number>();
  for (const row of rows) {
    const amount = kind === "pending" ? (["pending", "failed"].includes(row.status) ? row.amount ?? 0 : 0) : row[kind];
    if (amount === 0) continue;
    const currency = row.currency?.toUpperCase() ?? null;
    totals.set(currency, (totals.get(currency) ?? 0) + amount);
  }
  return totals.size ? [...totals].map(([currency, amount]) => ledgerMoney(amount, currency)).join(" · ") : "0";
}
