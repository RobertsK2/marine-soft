import { describe, expect, it } from "vitest";
import type {
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
} from "@/domain/availability/types";
import { evaluatePublicAvailability } from "@/domain/public-availability/model";

const MARINA_A = "marina-a";

const request: AvailabilityRequest = {
  marinaId: MARINA_A,
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-13",
  vesselLengthM: 12,
  vesselBeamM: 3.5,
  vesselDraftM: 2,
};

function berth(overrides: Partial<AvailabilityBerth> = {}): AvailabilityBerth {
  return {
    id: "internal-berth-id",
    marinaId: MARINA_A,
    code: "INTERNAL-CODE",
    priority: 10,
    status: "available",
    allowSmallerVessels: true,
    maxLengthM: 14,
    maxBeamM: 4,
    maxDraftM: 2.5,
    ...overrides,
  };
}

function booking(overrides: Partial<AvailabilityBooking> = {}): AvailabilityBooking {
  return {
    id: "internal-booking-id",
    marinaId: MARINA_A,
    arrivalDate: "2026-09-10",
    departureDate: "2026-09-13",
    status: "confirmed",
    vesselLengthM: 12,
    vesselBeamM: 3.5,
    vesselDraftM: 2,
    ...overrides,
  };
}

describe("Phase 3 public availability", () => {
  it("returns only a safe available result from the Milestone 1 matcher", () => {
    expect(evaluatePublicAvailability(request, [berth()], [])).toEqual({ available: true });
  });

  it("distinguishes a vessel that fits no operational berth", () => {
    expect(evaluatePublicAvailability(
      { ...request, vesselLengthM: 30, vesselBeamM: 8, vesselDraftM: 5 },
      [berth()],
      [],
    )).toEqual({ available: false, reason: "no_suitable_berth" });
  });

  it("distinguishes suitable capacity that is full", () => {
    expect(evaluatePublicAvailability(request, [berth()], [booking()])).toEqual({
      available: false,
      reason: "capacity_full",
    });
  });

  it("keeps other-tenant bookings out of the scoped result", () => {
    expect(evaluatePublicAvailability(
      request,
      [berth()],
      [booking({ marinaId: "marina-b" })],
    )).toEqual({ available: true });
  });

  it("never returns berth, booking, assignment, count, or price details", () => {
    const result = evaluatePublicAvailability(request, [berth()], []);
    expect(Object.keys(result)).toEqual(["available"]);
    expect(JSON.stringify(result)).not.toMatch(/berth|booking|assignment|price|count/i);
  });
});
