import type { Database, Json } from "@/types/database";

export function checkoutPaymentState(
  payment: Database["public"]["Enums"]["booking_payment_status"],
  booking?: Database["public"]["Enums"]["booking_status"],
) {
  if (booking === "cancelled") return "unavailable" as const;
  if (payment === "paid" && booking) return "paid" as const;
  if (payment === "paid" || payment === "pending") return "processing" as const;
  return "failed" as const;
}

export function validCheckoutSession(value: unknown): value is string {
  return typeof value === "string" && /^cs_(?:test_|live_)?[A-Za-z0-9_]{1,200}$/.test(value);
}

export function confirmationMoney(amount: number, currency: string) {
  const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency });
  return formatter.format(amount / 10 ** (formatter.resolvedOptions().maximumFractionDigits ?? 2));
}

export function confirmationDateRange(arrival: string, departure: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .formatRange(new Date(`${arrival}T00:00:00Z`), new Date(`${departure}T00:00:00Z`));
}

// Only display a breakdown when the immutable checkout snapshot reconciles with
// the actual payment. Old or incomplete snapshots still have an accurate total.
export function confirmationPriceLines(snapshot: Json, total: number, currency: string) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const { accommodationMinor, mandatoryFeesMinor, taxMinor, taxBehavior, taxRateBps } = snapshot;
  if (snapshot.version !== 1 || snapshot.currency !== currency || snapshot.totalMinor !== total ||
      ![accommodationMinor, mandatoryFeesMinor, taxMinor, taxRateBps].every((v) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0) ||
      (taxBehavior !== "inclusive" && taxBehavior !== "exclusive")) return [];
  const stay = accommodationMinor as number;
  const fees = mandatoryFeesMinor as number;
  const tax = taxMinor as number;
  if (stay + fees + (taxBehavior === "exclusive" ? tax : 0) !== total) return [];
  return [
    { label: "Berth stay", amount: stay },
    { label: "Mandatory fees", amount: fees },
    { label: `VAT (${(taxRateBps as number) / 100}%)${taxBehavior === "inclusive" ? " · included" : ""}`, amount: tax },
  ];
}

export function berthAssignmentLabel(status: "assigned" | "on_arrival" | "unknown") {
  return status === "assigned" ? "Assigned by marina" : status === "unknown" ? "Contact marina for assignment" : "Assigned on arrival";
}
