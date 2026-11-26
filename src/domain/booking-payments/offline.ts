import type { BookingPaymentBalance } from "./types";

export const OFFLINE_PAYMENT_METHODS = {
  cash: "Cash",
  card_terminal: "Card terminal",
  bank_transfer: "Bank transfer",
} as const;
export type OfflinePaymentMethod = keyof typeof OFFLINE_PAYMENT_METHODS;

/** Parse decimal euros exactly; never round an imprecise or fractional cent. */
export function parsePaymentAmount(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,14}([.,]\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().replace(",", ".").split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

export function paymentStatusLabel(balance: Pick<BookingPaymentBalance, "total_due_minor" | "paid_minor" | "balance_due_minor">) {
  if (balance.total_due_minor === null) return "Amount not set";
  if (balance.balance_due_minor === 0) return "Paid";
  return balance.paid_minor > 0 ? "Partially paid" : "Unpaid";
}
