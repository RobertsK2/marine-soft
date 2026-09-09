import type { Booking } from "@/domain/bookings/types";
import type { BookingPaymentBalance } from "@/domain/booking-payments/types";

export type BookingListRow = Pick<Booking, "id" | "reference" | "customer_name" | "customer_email" | "vessel_name" | "arrival_date" | "departure_date" | "eta" | "etd" | "status" | "source"> & {
  berthCodes: string[];
  payment: string;
  stayLabel: string;
};
export type BookingListFilters = { query: string; status: string; from: string; to: string; source: string; payment: string };

export function bookingPaymentLabel(balance: Pick<BookingPaymentBalance, "state" | "balance_due_minor" | "currency"> & Partial<Pick<BookingPaymentBalance, "collection_method">>) {
  if (balance.balance_due_minor > 0) {
    const amount = balance.currency
      ? new Intl.NumberFormat("en-GB", { style: "currency", currency: balance.currency, minimumFractionDigits: balance.balance_due_minor % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(balance.balance_due_minor / 100)
      : `${(balance.balance_due_minor / 100).toFixed(2)} (currency unknown)`;
    return balance.collection_method === "on_site" ? `Due at marina · ${amount}` : `${amount} due`;
  }
  return balance.state === "paid_in_full" || balance.state === "paid_outside_berthio" ? "Paid" : "Unpaid";
}

export function bookingStayLabel(arrival: string, departure: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .formatRange(new Date(`${arrival}T00:00:00Z`), new Date(`${departure}T00:00:00Z`));
}

export function filterBookingRows(rows: BookingListRow[], filters: BookingListFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  return rows.filter((row) =>
    (!query || [row.customer_name, row.customer_email, row.vessel_name, row.reference, ...row.berthCodes].some((value) => value?.toLocaleLowerCase().includes(query)))
    && (!filters.status || row.status === filters.status)
    && (!filters.from || row.departure_date > filters.from)
    && (!filters.to || row.arrival_date <= filters.to)
    && (!filters.source || row.source === filters.source)
    && (!filters.payment || (filters.payment === "paid" ? row.payment === "Paid" : row.payment !== "Paid")),
  );
}
