import { describe, expect, it } from "vitest";
import { bookingPaymentLabel, filterBookingRows, type BookingListFilters, type BookingListRow } from "@/components/bookings/bookings-list-model";

const filters: BookingListFilters = { query: "", status: "", from: "", to: "", source: "", payment: "" };
const row: BookingListRow = { id: "one", reference: "BK-ONE", customer_name: "Anna", customer_email: "anna@example.test", vessel_name: "Aurora", arrival_date: "2026-09-05", departure_date: "2026-09-08", eta: "14:30:00", etd: "10:00:00", status: "confirmed", source: "manual", berthCodes: ["A-01"], payment: "€1,200 due", stayLabel: "5–8 Sept 2026" };

describe("booking list presentation", () => {
  it("keeps amounts due distinct from fully settled and unknown totals", () => {
    expect(bookingPaymentLabel({ state: "deposit_paid", balance_due_minor: 120000, currency: "EUR" })).toBe("€1,200 due");
    expect(bookingPaymentLabel({ state: "balance_due", balance_due_minor: 125050, currency: "EUR" })).toBe("€1,250.50 due");
    expect(bookingPaymentLabel({ state: "paid_outside_berthio", balance_due_minor: 0, currency: "EUR" })).toBe("Paid");
    expect(bookingPaymentLabel({ state: "payment_link_required", balance_due_minor: 0, currency: null })).toBe("Unpaid");
    expect(bookingPaymentLabel({ state: "balance_due", balance_due_minor: 1000, currency: null })).toContain("currency unknown");
  });
  it("searches guest, vessel, reference and berth without changing source rows", () => {
    for (const query of [" ANNA ", "aurora", "bk-one", "a-01"]) expect(filterBookingRows([row], { ...filters, query })).toEqual([row]);
    expect(filterBookingRows([row], { ...filters, query: "missing" })).toEqual([]);
  });
  it("combines filters and respects the exclusive departure boundary", () => {
    expect(filterBookingRows([row], { ...filters, from: "2026-09-07", to: "2026-09-07", status: "confirmed", source: "manual", payment: "unpaid" })).toEqual([row]);
    expect(filterBookingRows([row], { ...filters, from: "2026-09-08" })).toEqual([]);
    expect(filterBookingRows([row], { ...filters, to: "2026-09-04" })).toEqual([]);
    expect(filterBookingRows([row], { ...filters, payment: "paid" })).toEqual([]);
    expect(filterBookingRows([row], { ...filters, status: "cancelled" })).toEqual([]);
  });
});
