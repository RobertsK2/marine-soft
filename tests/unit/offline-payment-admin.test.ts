import { expect, it, vi } from "vitest";
import { initializeBookingTotal, savePaymentSettings } from "@/domain/booking-payments/actions";
import { formatPaymentDueAtInput } from "@/domain/booking-payments/model";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), privileged: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getAuthorizationContext: mocks.auth }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: mocks.privileged }));
vi.mock("@/lib/monitoring/server", () => ({ captureServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const bookingId = "a1000000-0000-4000-8000-000000000001";
const admin = { role: "marina_admin", userId: "admin", marinaId: "marina" };
const idle = { status: "idle" } as const;

it.each([null, { role: "marina_staff", userId: "staff", marinaId: "marina" }])("blocks payment management submissions without admin authorization", async context => {
  mocks.privileged.mockClear();
  mocks.auth.mockResolvedValue(context);
  const denied = { status: "error", message: "Marina administrator access is required." };
  expect(await initializeBookingTotal(bookingId, idle, new FormData())).toEqual(denied);
  expect(await savePaymentSettings(bookingId, null, idle, new FormData())).toEqual(denied);
  expect(mocks.privileged).not.toHaveBeenCalled();
});

it("passes only link and due date to the settings RPC", async () => {
  mocks.auth.mockResolvedValue(admin);
  mocks.privileged.mockReturnValue({ rpc: mocks.rpc });
  mocks.rpc.mockResolvedValue({ data: "updated", error: null });
  const form = new FormData();
  form.set("paymentLink", "https://payments.example.test/pay");
  form.set("paymentDueAt", "2030-06-03T16:00");
  form.set("paidMinor", "10000");
  form.set("paymentState", "paid_in_full");
  expect(await savePaymentSettings(bookingId, null, idle, form)).toMatchObject({ status: "success" });
  expect(mocks.rpc).toHaveBeenLastCalledWith("update_booking_payment_settings", {
    target_marina_id: "marina", target_booking_id: bookingId, target_actor_id: "admin",
    requested_payment_link: "https://payments.example.test/pay", requested_due_at: "2030-06-03T16:00",
  });
});

it.each(["http://payments.example.test", "https://guest:secret@payments.example.test", "https://payments.example.test:99999"])("rejects a new invalid payment link %s", async link => {
  mocks.auth.mockResolvedValue(admin);
  mocks.privileged.mockClear();
  const form = new FormData();
  form.set("paymentLink", link);
  form.set("paymentDueAt", "");
  expect(await savePaymentSettings(bookingId, null, idle, form)).toEqual({ status: "error", message: "Enter a valid HTTPS payment link." });
  expect(mocks.privileged).not.toHaveBeenCalled();
});

it("displays the stored due time in the marina timezone", () => {
  expect(formatPaymentDueAtInput("2030-06-03T21:00:43Z", "Europe/Riga")).toBe("2030-06-04T00:00");
  expect(formatPaymentDueAtInput(null, "Europe/Riga")).toBe("");
});
