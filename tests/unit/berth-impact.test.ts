import { describe, expect, it } from "vitest";
import { parseBerthImpactBookings } from "@/domain/berth-impact/model";

describe("berth impact model", () => {
  it("keeps affected bookings and valid alternatives", () => {
    expect(parseBerthImpactBookings([{
      bookingId: "booking-1",
      reference: "BK-001",
      status: "confirmed",
      arrivalDate: "2033-05-01",
      departureDate: "2033-05-03",
      berthOptions: [{ berthId: "berth-2", code: "A-02", zone: "North", maxLengthM: 10, maxBeamM: 3, maxDraftM: 2 }],
    }])).toHaveLength(1);
  });

  it("drops malformed rows instead of surfacing unsafe options", () => {
    expect(parseBerthImpactBookings([{ bookingId: "booking-1" }, null])).toEqual([]);
  });
});
