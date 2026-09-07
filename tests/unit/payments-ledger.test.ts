import { describe, expect, it } from "vitest";
import { buildLedgerRows, filterLedgerRows, ledgerMoney, ledgerTotals, type LedgerPayment } from "@/components/payments/payments-ledger-model";
import type { Booking } from "@/domain/bookings/types";
import type { Database } from "@/types/database";

const booking = (overrides: Partial<Booking> = {}) => ({
  id: "booking-1", marina_id: "marina-1", reference: "BK-001", customer_name: "Jane Doe", vessel_name: "Sea Bird",
  source: "online", booking_payment_id: "payment-1", price_total_minor: 10000, price_currency: "EUR", updated_at: "2030-01-01T23:30:00Z",
  ...overrides,
} as Booking);
const balance = (overrides = {}) => ({
  booking_id: "booking-1", state: "deposit_paid", collection_method: "on_site", currency: "EUR",
  total_due_minor: 15000, paid_minor: 10000, balance_due_minor: 5000, updated_at: "2030-01-02T12:00:00Z", ...overrides,
} as Database["public"]["Tables"]["booking_payment_balances"]["Row"]);
const payment = (overrides: Partial<LedgerPayment> = {}): LedgerPayment => ({
  id: "payment-1", status: "paid", amount_total_minor: 10000, currency: "EUR", updated_at: "2030-01-01T23:30:00Z", ...overrides,
});

describe("payments ledger", () => {
  it("uses the recorded balance after repricing and does not count the linked payment twice", () => {
    const rows = buildLedgerRows([booking()], [balance()], [payment()], "Europe/Riga");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ amount: 15000, due: 5000, paid: 10000, method: "Pay on site", status: "deposit_paid" });
    expect(ledgerTotals(rows, "paid")).toBe("€100.00");
    expect(ledgerTotals(rows, "due")).toBe("€50.00");
  });
  it("reuses the fallback balance without claiming a recorded payment method", () => {
    const [row] = buildLedgerRows([booking()], [], [], "Europe/Riga");
    expect(row).toMatchObject({ paid: 10000, status: "paid_in_full", method: null, dateKey: "2030-01-02" });
  });
  it("keeps unpriced bookings unknown and excludes them from monetary totals", () => {
    const rows = buildLedgerRows([booking({ source: "manual", booking_payment_id: null, price_total_minor: null })], [], [], "UTC");
    expect(rows[0]).toMatchObject({ amount: null, status: "payment_link_required", due: 0 });
    expect(ledgerMoney(rows[0].amount, rows[0].currency)).toBe("Not recorded");
    expect(ledgerTotals(rows, "paid")).toBe("0");
  });
  it("includes unlinked pending and failed attempts without inventing a guest, booking or method", () => {
    const rows = buildLedgerRows([], [], [payment({ status: "pending" }), payment({ id: "failed", status: "failed" }), payment({ id: "expired", status: "expired" })], "UTC");
    expect(rows[0]).toMatchObject({ bookingId: null, guest: "Not recorded", method: null, due: 0 });
    expect(ledgerTotals(rows, "pending")).toBe("€200.00");
    expect(ledgerTotals(rows, "paid")).toBe("0");
    expect(ledgerTotals(rows, "due")).toBe("0");
  });
  it("includes a paid checkout awaiting booking confirmation once", () => {
    expect(ledgerTotals(buildLedgerRows([], [], [payment()], "UTC"), "paid")).toBe("€100.00");
  });
  it("never adds different currencies together or assumes a missing currency", () => {
    const rows = buildLedgerRows([], [], [payment(), payment({ id: "usd", currency: "USD" })], "UTC");
    const total = ledgerTotals(rows, "paid");
    expect(total).toContain("€100.00");
    expect(total).toContain("US$100.00");
    expect(ledgerMoney(10000, null)).toBe("100.00 (currency unknown)");
  });
  it("filters inclusively by marina-local date, status, guest and vessel", () => {
    const rows = buildLedgerRows([booking()], [], [], "Europe/Riga");
    expect(filterLedgerRows(rows, " sea BIRD ", "paid", "2030-01-02", "2030-01-02")).toHaveLength(1);
    expect(filterLedgerRows(rows, "jane", "", "", "2030-01-01")).toHaveLength(0);
    expect(filterLedgerRows(rows, "BK-001", "failed", "", "")).toHaveLength(0);
    expect(filterLedgerRows(rows, "not a guest", "", "", "")).toHaveLength(0);
  });
});
