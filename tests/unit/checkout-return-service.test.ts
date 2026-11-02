import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), issueGuestManagementUrl: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ from: mocks.from }) }));
vi.mock("@/domain/guest-access/service", () => ({ issueGuestManagementUrl: mocks.issueGuestManagementUrl }));
import { getCheckoutReturnStatus } from "@/domain/checkout/service";

type FixtureRow = Record<string, unknown>;
const filters: Array<{ table: string; column: string; value: unknown }> = [];
let rows: Record<string, FixtureRow | FixtureRow[] | null>;
let errorTable: string | undefined;

beforeEach(() => {
  filters.length = 0;
  errorTable = undefined;
  rows = {
    marinas: { id: "private-marina-id", name: "Private test marina" },
    booking_payments: { id: "private-payment-id", status: "paid", amount_total_minor: 1000, currency: "EUR", price_snapshot: {}, paid_at: "2027-01-01T00:00:00Z" },
    bookings: { id: "private-booking-id", reference: "BK-SAFE", status: "confirmed", vessel_name: "My vessel" },
    booking_berth_assignments: [],
    notification_outbox: [],
  };
  mocks.issueGuestManagementUrl.mockReset().mockResolvedValue("https://berthio.test/guest/bookings/signed-token");
  mocks.from.mockReset().mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn((column: string, value: unknown) => { filters.push({ table, column, value }); return query; }),
      is: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockReturnThis(),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows[table], error: errorTable === table ? new Error("unavailable") : null }).then(resolve),
    };
    return query;
  });
});

describe("checkout return server authorization and state", () => {
  it("scopes every private read to the public marina and session/payment/booking", async () => {
    const payment = await getCheckoutReturnStatus("test-marina", "cs_test_secret");
    expect(payment?.status).toBe("paid");
    expect(filters).toEqual(expect.arrayContaining([
      { table: "marinas", column: "slug", value: "test-marina" },
      { table: "marinas", column: "is_public", value: true },
      { table: "booking_payments", column: "marina_id", value: "private-marina-id" },
      { table: "booking_payments", column: "stripe_checkout_session_id", value: "cs_test_secret" },
      { table: "bookings", column: "marina_id", value: "private-marina-id" },
      { table: "bookings", column: "booking_payment_id", value: "private-payment-id" },
      { table: "booking_berth_assignments", column: "marina_id", value: "private-marina-id" },
      { table: "booking_berth_assignments", column: "booking_id", value: "private-booking-id" },
      { table: "notification_outbox", column: "marina_id", value: "private-marina-id" },
      { table: "notification_outbox", column: "booking_id", value: "private-booking-id" },
    ]));
    expect(JSON.stringify(payment)).not.toMatch(/private-(?:marina|payment|booking)-id/);
    expect(payment?.emailSent).toBe(false);
  });

  it("rejects a missing marina or a session inaccessible in that marina", async () => {
    rows.marinas = null;
    expect(await getCheckoutReturnStatus("other-marina", "cs_test_secret")).toBeNull();
    expect(mocks.from).toHaveBeenCalledTimes(1);
    rows.marinas = { id: "other-id", name: "Other" };
    rows.booking_payments = null;
    expect(await getCheckoutReturnStatus("other-marina", "cs_test_secret")).toBeNull();
    expect(mocks.issueGuestManagementUrl).not.toHaveBeenCalled();
  });

  it("does not issue guest access for pending or cancelled bookings", async () => {
    rows.bookings = null;
    expect((await getCheckoutReturnStatus("test-marina", "cs_test_secret"))?.status).toBe("processing");
    rows.bookings = { id: "private-booking-id", status: "cancelled" };
    expect((await getCheckoutReturnStatus("test-marina", "cs_test_secret"))?.status).toBe("unavailable");
    expect(mocks.issueGuestManagementUrl).not.toHaveBeenCalled();
  });

  it("requires recorded email success and safely handles assignment lookup failure", async () => {
    rows.notification_outbox = [{ sent_at: "2027-01-01T00:00:00Z" }];
    errorTable = "booking_berth_assignments";
    const payment = await getCheckoutReturnStatus("test-marina", "cs_test_secret");
    expect(payment?.emailSent).toBe(true);
    expect(payment?.berthAssignment).toBe("unknown");
    errorTable = "notification_outbox";
    expect((await getCheckoutReturnStatus("test-marina", "cs_test_secret"))?.emailSent).toBe(false);
  });
});
