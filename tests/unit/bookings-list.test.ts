import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BookingsList } from "@/components/bookings/bookings-list";
import { bookingPaymentLabel, filterBookingRows, type BookingListFilters, type BookingListRow } from "@/components/bookings/bookings-list-model";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));

const filters: BookingListFilters = { query: "", status: "", from: "", to: "", source: "", payment: "" };
const row: BookingListRow = { id: "one", reference: "BK-ONE", customer_name: "Anna", customer_email: "anna@example.test", vessel_name: "Aurora", arrival_date: "2026-09-05", departure_date: "2026-09-08", eta: "14:30:00", etd: "10:00:00", status: "confirmed", source: "manual", berthCodes: ["A-01"], payment: "€1,200 due", stayLabel: "5–8 Sept 2026" };

describe("booking list presentation", () => {
  it.each(["newest", "arrival"] as const)("shows the selected %s sort and keeps both payment methods in filtered order", sort => {
    const rows: BookingListRow[] = [
      { ...row, id: "online", reference: "BK-ONLINE", source: "online", payment: "Paid" },
      { ...row, id: "marina", reference: "BK-MARINA", source: "online", payment: "Due at marina · €45.76" },
    ];
    const html = renderToStaticMarkup(createElement(BookingsList, { rows, sort }));
    expect(html).toContain(`<option value="${sort}" selected=""`);
    expect(filterBookingRows(rows, { ...filters, status: "confirmed", source: "online", query: "BK-" })).toEqual(rows);
    expect(filterBookingRows(rows, { ...filters, payment: "unpaid" })).toEqual([rows[1]]);
    expect(filterBookingRows(rows, { ...filters, payment: "paid" })).toEqual([rows[0]]);
  });

  it.each([
    ["Pay Online", "BK-ONLINE", "Paid"],
    ["Pay at Marina", "BK-MARINA", "Due at marina · €45.76"],
  ])("renders a visible reference beneath the guest for %s", (_method, reference, payment) => {
    const booking: BookingListRow = { ...row, reference, payment, source: "online", berthCodes: [], eta: null, etd: null };
    const html = renderToStaticMarkup(createElement(BookingsList, { rows: [booking] }));
    const tableBody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)![1];
    // Strip attributes too: a tooltip or accessible action name alone must not
    // satisfy the visible-reference regression check.
    const text = tableBody.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(text).toContain(`Anna ${reference} Aurora`);
    expect(text).toContain(payment);
    expect(tableBody).toContain(`href="/dashboard/bookings/${booking.id}"`);
    expect(filterBookingRows([booking], { ...filters, query: reference })).toEqual([booking]);
  });

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
