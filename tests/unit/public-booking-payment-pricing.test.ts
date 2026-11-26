import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PricingCatalog } from "@/domain/pricing/types";
import type { PublicBookingSearch } from "@/domain/public-booking/types";

const mocks = vi.hoisted(() => ({ marina: vi.fn(), rpc: vi.fn(), catalog: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/domain/pricing/repository", () => ({ loadPricingCatalog: mocks.catalog }));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => {
  const query = { select: () => query, eq: () => query, maybeSingle: mocks.marina };
  return { from: () => query, rpc: mocks.rpc };
} }));
import { createPublicBookingHold, confirmPublicPayAtMarinaBooking } from "@/domain/booking-holds/service";

const request: PublicBookingSearch = { arrivalDate: "2027-05-10", departureDate: "2027-05-12", marinaTimezone: "Europe/Riga", stayNights: 2, eta: null, etd: null, etaWindow: "morning", vesselName: null, vesselLengthM: 10, vesselBeamM: 3, vesselDraftM: 1.5 };
const catalog: PricingCatalog = { currency: "EUR", model: "per_meter", taxBehavior: "exclusive", taxRateBps: 2100, seasons: [{ id: "season", name: "Base", startsOn: "2027-01-01", endsOn: "2028-01-01", meterRateMinor: 300, lengthRates: [] }], fees: [{ name: "Harbour fee", type: "per_booking", amountMinor: 500, percentageBps: null }] };
const requester = { sessionHash: "a".repeat(64), networkHash: "b".repeat(64) };

describe("public payment methods share server pricing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.marina.mockResolvedValue({ data: { id: "marina-a" }, error: null });
    mocks.catalog.mockResolvedValue(catalog);
    mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: [name === "create_booking_hold" ? { outcome: "created", hold_token: "hold" } : { outcome: "confirmed", booking_id: "booking" }] }));
  });
  it("recalculates fees and VAT equally, preserving unknown times for both methods", async () => {
    await createPublicBookingHold("marina-a", "attempt", request, requester);
    await confirmPublicPayAtMarinaBooking("marina-a", "attempt", request, requester, { customerName: "Guest", customerEmail: "guest@example.test", customerPhone: "+37120000000" });
    const online = mocks.rpc.mock.calls[0][1];
    const atMarina = mocks.rpc.mock.calls[1][1];
    expect(atMarina.calculated_price_snapshot).toEqual(online.calculated_price_snapshot);
    expect(atMarina).toMatchObject({ requested_eta: null, requested_etd: null, requested_eta_window: "morning", calculated_price_total_minor: 7865 });
    expect(atMarina.calculated_price_snapshot).toMatchObject({ accommodationMinor: 6000, mandatoryFeesMinor: 500, taxMinor: 1365, totalMinor: 7865 });
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["create_booking_hold", "confirm_pay_at_marina_booking"]);
  });
});
