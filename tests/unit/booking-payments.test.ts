import { describe, expect, it } from "vitest";
import { bookingCollectionMethodLabel, deriveBookingPaymentBalance, isPaymentOverdue } from "@/domain/booking-payments/model";
import type { Booking } from "@/domain/bookings/types";

const booking = (overrides: Partial<Booking> = {}) => ({
  id: "booking-1", marina_id: "marina-1", source: "manual", booking_payment_id: null,
  price_total_minor: 10000, price_currency: "EUR", updated_at: "2030-01-01T00:00:00Z",
  ...overrides,
} as Booking);

describe("booking payment balance model", () => {
  it.each([
    ["paid_in_full", { source: "online", booking_payment_id: "pay-1" }],
    ["balance_due", { source: "manual" }],
    ["payment_link_required", { price_total_minor: null }],
  ])("derives %s safely", (state, overrides) => {
    expect(deriveBookingPaymentBalance(booking(overrides as Partial<Booking>)).state).toBe(state);
  });

  it("flags overdue balances without changing booking state", () => {
    expect(isPaymentOverdue(5000, "2020-01-01T00:00:00Z", new Date("2020-01-02T00:00:00Z"))).toBe(true);
    expect(isPaymentOverdue(0, "2020-01-01T00:00:00Z", new Date("2020-01-02T00:00:00Z"))).toBe(false);
  });

  it("keeps public pay-at-marina bookings unpaid and visible before an exact ETA exists", () => {
    expect(deriveBookingPaymentBalance(booking({ source: "online", booking_payment_id: null, eta: null, etd: null }))).toMatchObject({ state: "balance_due", collection_method: "on_site", paid_minor: 0, balance_due_minor: 10000, due_at: null });
    expect(bookingCollectionMethodLabel("on_site")).toBe("Pay at Marina");
    expect(bookingCollectionMethodLabel("berthio")).toBe("Pay Online");
    expect(isPaymentOverdue(10000, null)).toBe(false);
  });
});
