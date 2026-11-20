import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn(), verify: vi.fn(), from: vi.fn(), marina: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/domain/guest-access/service", () => ({ loadGuestBooking: mocks.load, verifyGuestAccessToken: mocks.verify }));
vi.mock("@/domain/public-marinas/repository", () => ({ getPublicMarinaBySlug: mocks.marina }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ from: mocks.from }) }));
import { loadGuestBookingConfirmation } from "@/domain/guest-access/confirmation";
import { confirmationPaymentLabel } from "@/domain/checkout/confirmation";

const filters: Array<[string, string, unknown]> = [];
let rows: Record<string, unknown>;
let failedTable: string | undefined;
beforeEach(() => {
  vi.resetAllMocks();
  filters.length = 0;
  failedTable = undefined;
  mocks.load.mockResolvedValue({ reference: "BK-SAFE", marinaName: "Marina", status: "confirmed", priceTotalMinor: 10000, priceCurrency: "EUR", balanceDueMinor: 10000, eta: null, etd: null, etaWindow: "morning" });
  mocks.verify.mockReturnValue({ g: "signed-grant" });
  mocks.marina.mockResolvedValue({ name: "Marina", slug: "server-marina" });
  rows = {
    guest_booking_access_grants: { booking_id: "private-booking" },
    bookings: { marina_id: "private-marina", booking_payment_id: null, price_snapshot: {} },
    marinas: { slug: "server-marina" },
    booking_payment_balances: { total_due_minor: 10000, paid_minor: 0, balance_due_minor: 10000, currency: "EUR" },
  };
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.push([table, column, value]); return query; },
      is: (column: string, value: unknown) => { filters.push([table, column, value]); return query; },
      gt: (column: string, value: unknown) => { filters.push([table, column, value]); return query; },
      maybeSingle: async () => ({ data: rows[table], error: table === failedTable ? new Error("unavailable") : null }),
    };
    return query;
  });
});

describe("shared guest confirmation", () => {
  it.each([[0, 10000, "Due at Marina"], [2500, 7500, "Due at Marina"], [10000, 0, "Paid"]])("uses ledger paid=%s and due=%s", async (paid, due, label) => {
    rows.booking_payment_balances = { total_due_minor: 10000, paid_minor: paid, balance_due_minor: due, currency: "EUR" };
    const result = await loadGuestBookingConfirmation("signed-token");
    expect(result?.payment).toMatchObject({ status: "confirmed", paymentMethod: "marina", amountTotalMinor: 10000, paidMinor: paid, balanceDueMinor: due, confirmation: { eta: null, etd: null, etaWindow: "morning" } });
    expect(confirmationPaymentLabel(result!.payment)).toBe(label);
    expect(JSON.stringify(result)).not.toMatch(/private-(booking|marina)|signed-grant/);
  });

  it("follows the signed grant and marina, never client booking or payment flags", async () => {
    await loadGuestBookingConfirmation("signed-token");
    expect(filters).toEqual(expect.arrayContaining([
      ["guest_booking_access_grants", "id", "signed-grant"],
      ["guest_booking_access_grants", "revoked_at", null],
      ["guest_booking_access_grants", "expires_at", expect.any(String)],
      ["bookings", "id", "private-booking"],
      ["marinas", "id", "private-marina"],
      ["booking_payment_balances", "marina_id", "private-marina"],
      ["booking_payment_balances", "booking_id", "private-booking"],
    ]));
  });

  it("rejects invalid, expired, or RPC-revoked access before additional reads", async () => {
    mocks.load.mockResolvedValue(null);
    expect(await loadGuestBookingConfirmation("unavailable-token")).toBeNull();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(["guest_booking_access_grants", "bookings", "marinas", "booking_payment_balances"])("fails closed when %s cannot be read", async table => {
    failedTable = table;
    expect(await loadGuestBookingConfirmation("signed-token")).toBeNull();
  });

  it("rejects a grant revoked between the RPC and additional reads", async () => {
    rows.guest_booking_access_grants = null;
    expect(await loadGuestBookingConfirmation("signed-token")).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("retains cancelled status and uses the authoritative original online method", async () => {
    mocks.load.mockResolvedValue({ status: "cancelled", priceTotalMinor: 10000, priceCurrency: "EUR", balanceDueMinor: 0 });
    rows.bookings = { marina_id: "private-marina", booking_payment_id: "private-payment", price_snapshot: {} };
    const result = await loadGuestBookingConfirmation("signed-token");
    expect(result?.payment).toMatchObject({ status: "unavailable", paymentMethod: "online" });
  });
});
