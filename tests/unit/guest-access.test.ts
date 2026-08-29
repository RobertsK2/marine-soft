import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({
  getGuestAccessSigningSecret: () => "unit-test-signing-secret-with-more-than-32-bytes",
  getSiteUrl: () => "https://berthio.test",
}));
vi.mock("@/lib/supabase/privileged", () => ({ createPrivilegedClient: () => ({ rpc: mocks.rpc }) }));

import {
  createGuestAccessToken,
  issueGuestManagementUrl,
  loadGuestBooking,
  updateGuestBookingTimes,
  verifyGuestAccessToken,
} from "@/domain/guest-access/service";
import { validateGuestTimes } from "@/domain/guest-access/validation";

const grantId = "74000000-0000-4000-8000-000000000001";
const expiresAt = "2099-03-01T12:00:00.000Z";

describe("guest booking access", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("creates a signed token and rejects tampering or expiry", () => {
    const token = createGuestAccessToken(grantId, expiresAt);
    expect(verifyGuestAccessToken(token)?.g).toBe(grantId);
    expect(verifyGuestAccessToken(`${token.slice(0, -1)}x`)).toBeNull();
    expect(verifyGuestAccessToken(token, Date.parse("2100-01-01"))).toBeNull();
  });

  it("issues the stable database grant as a dedicated management URL", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ grant_id: grantId, expires_at: expiresAt }], error: null });
    const url = await issueGuestManagementUrl("75000000-0000-4000-8000-000000000001");
    expect(url).toMatch(/^https:\/\/berthio\.test\/guest\/bookings\/v1\./);
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_guest_booking_access", {
      target_booking_id: "75000000-0000-4000-8000-000000000001",
    });
  });

  it("does not query the database for a forged token", async () => {
    expect(await loadGuestBooking("v1.forged.signature")).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("maps only the safe booking projection", async () => {
    const token = createGuestAccessToken(grantId, expiresAt);
    mocks.rpc.mockResolvedValue({ data: [{
      booking_reference: "BK-ABCDEFGHIJ", marina_name: "Marina A",
      arrival_date: "2027-03-01", departure_date: "2027-03-04", eta: "14:00:00", etd: "10:00:00",
      vessel_name: "Guest One", vessel_length_m: 12, vessel_beam_m: 3.7, vessel_draft_m: 2.1,
      price_total_minor: 12000, price_currency: "EUR", booking_status: "confirmed", access_expires_at: expiresAt,
    }], error: null });
    const booking = await loadGuestBooking(token);
    expect(booking).toMatchObject({ reference: "BK-ABCDEFGHIJ", marinaName: "Marina A", priceTotalMinor: 12000 });
    expect(booking).not.toHaveProperty("customerEmail");
    expect(mocks.rpc).toHaveBeenCalledWith("get_guest_booking", { target_grant_id: grantId });
  });

  it("allows only validated ETA and ETD values", async () => {
    expect(validateGuestTimes({ eta: "24:00", etd: "09:00" })).toMatchObject({ success: false });
    expect(validateGuestTimes({ eta: "16:15", etd: "08:45" })).toEqual({ success: true, data: { eta: "16:15", etd: "08:45" } });
    const token = createGuestAccessToken(grantId, expiresAt);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await updateGuestBookingTimes(token, "16:15", "08:45")).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("update_guest_booking_times", {
      target_grant_id: grantId, requested_eta: "16:15", requested_etd: "08:45",
    });
  });
});
