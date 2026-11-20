import { beforeEach, describe, expect, it, vi } from "vitest";
import { parsePaymentAmount, paymentStatusLabel } from "@/domain/booking-payments/offline";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), capture: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthorizationContext: mocks.auth }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: mocks.capture }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { recordOfflinePayment } from "@/domain/booking-payments/actions";

const booking = "a1000000-0000-4000-8000-000000000001";
const request = "b1000000-0000-4000-8000-000000000001";
function form() {
  const value = new FormData();
  Object.entries({ amount: "19.76", method: "cash", note: "Office payment", requestId: request, expectedPaidMinor: "0", marinaId: "forged", actorId: "forged", actorLabel: "forged", currency: "USD" }).forEach(([key, entry]) => value.set(key, entry));
  return value;
}
const run = (value = form()) => recordOfflinePayment(booking, { status: "idle" }, value);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ userId: "staff", marinaId: "marina-a", role: "marina_staff", email: "staff@example.test" });
  mocks.rpc.mockResolvedValue({ data: [{ outcome: "recorded", receipt_id: "receipt" }], error: null });
});

describe("offline amounts and status", () => {
  it.each([["19.76", 1976], ["0.01", 1], ["19,76", 1976], ["45.7", 4570], [" 25 ", 2500]])("parses %s without cent rounding", (value, expected) => expect(parsePaymentAmount(value)).toBe(expected));
  it.each(["", "0", "-1", "1.001", "1e2", "NaN", "Infinity", "1,000.00", "90071992547409.92"])("rejects %s", (value) => expect(parsePaymentAmount(value)).toBeNull());
  it.each([[0, 10000, "Unpaid"], [1976, 8024, "Partially paid"], [10000, 0, "Paid"]])("derives status from balances", (paid, due, expected) => {
    expect(paymentStatusLabel({ total_due_minor: 10000, paid_minor: paid, balance_due_minor: due })).toBe(expected);
  });
  it("does not label an unpriced booking paid", () => expect(paymentStatusLabel({ total_due_minor: null, paid_minor: 0, balance_due_minor: 0 })).toBe("Amount not set"));
});

describe("offline recording server action", () => {
  it("uses session identity and euros, converts amount, refreshes summary and payments", async () => {
    expect(await run()).toEqual({ status: "success", message: "Payment recorded." });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_booking_offline_payment", {
      target_marina_id: "marina-a", target_actor_id: "staff", target_actor_label: "staff@example.test", target_booking_id: booking,
      requested_request_id: request, requested_currency: "EUR", requested_amount_minor: 1976,
      requested_method: "cash", requested_note: "Office payment", expected_paid_minor: 0,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(`/dashboard/bookings/${booking}`);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/payments");
  });
  it("requires authorization before database access", async () => {
    mocks.auth.mockResolvedValue(null);
    expect(await run()).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each([["amount", "0"], ["amount", "3.333"], ["method", "stripe"], ["method", "toString"], ["note", "a".repeat(501)], ["requestId", "bad"], ["expectedPaidMinor", "-1"]])("rejects invalid %s", async (field, value) => {
    const input = form(); input.set(field, value);
    expect(await run(input)).toMatchObject({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("treats an identical retry as success without another collection operation", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome: "already_recorded" }], error: null });
    expect(await run()).toMatchObject({ status: "success", message: expect.stringContaining("No duplicate") });
  });
  it.each(["unauthorized", "not_found", "stale", "excessive_amount", "idempotency_conflict", "cancelled", "not_offline", "balance_required", "invalid_payment"])("presents %s safely", async outcome => {
    mocks.rpc.mockResolvedValue({ data: [{ outcome }], error: null });
    expect(await run()).toMatchObject({ status: "error", message: expect.any(String) });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("keeps ambiguous failures retryable without exposing database errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("private database detail") });
    const result = await run();
    expect(result.message).toContain("Retry this form");
    expect(JSON.stringify(result)).not.toContain("private database detail");
  });
});
