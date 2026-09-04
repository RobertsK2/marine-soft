import { describe, expect, it } from "vitest";
import {
  AllocationWorkBudgetExceededError,
  checkAvailability,
  intervalsOverlap,
  REQUESTED_BOOKING_ID,
} from "@/domain/availability/matching";
import type {
  AvailabilityBerth,
  AvailabilityBooking,
  AvailabilityRequest,
} from "@/domain/availability/types";

const MARINA_A = "marina-a";
const MARINA_B = "marina-b";

function berth(
  id: string,
  maxLengthM: number,
  overrides: Partial<AvailabilityBerth> = {},
): AvailabilityBerth {
  return {
    id,
    marinaId: MARINA_A,
    code: id.toUpperCase(),
    priority: 100,
    status: "available",
    allowSmallerVessels: true,
    maxLengthM,
    maxBeamM: maxLengthM / 3,
    maxDraftM: maxLengthM / 6,
    ...overrides,
  };
}

function booking(
  id: string,
  vesselLengthM: number,
  overrides: Partial<AvailabilityBooking> = {},
): AvailabilityBooking {
  return {
    id,
    marinaId: MARINA_A,
    arrivalDate: "2026-09-10",
    departureDate: "2026-09-13",
    status: "confirmed",
    vesselLengthM,
    vesselBeamM: vesselLengthM / 3.2,
    vesselDraftM: vesselLengthM / 6.2,
    ...overrides,
  };
}

function request(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
  return {
    marinaId: MARINA_A,
    arrivalDate: "2026-09-11",
    departureDate: "2026-09-14",
    vesselLengthM: 9,
    vesselBeamM: 2.8,
    vesselDraftM: 1.4,
    ...overrides,
  };
}

function assignedBerth(result: ReturnType<typeof checkAvailability>, bookingId: string) {
  return result.assignments.find((assignment) => assignment.bookingId === bookingId)?.berthId;
}

describe("deterministic physical berth matching", () => {
  it("accepts a vessel that fits exactly one berth", () => {
    const result = checkAvailability(request(), [berth("only", 10)], []);
    expect(result.available).toBe(true);
    expect(result.requestedBerthId).toBe("only");
  });

  it("rejects a vessel that fits zero berths", () => {
    const result = checkAvailability(
      request({ vesselLengthM: 21, vesselBeamM: 7, vesselDraftM: 4 }),
      [berth("small", 10), berth("medium", 15)],
      [],
    );
    expect(result).toEqual({ available: false, assignments: [], requestedBerthId: null });
  });

  it("rejects a second overlapping booking when two bookings compete for one berth", () => {
    const result = checkAvailability(request(), [berth("only", 10)], [booking("existing", 9)]);
    expect(result.available).toBe(false);
  });

  it("accepts a small vessel that fits several berths and chooses the smallest", () => {
    const result = checkAvailability(
      request({ vesselLengthM: 8, vesselBeamM: 2.4, vesselDraftM: 1.2 }),
      [berth("large", 20), berth("small", 10), berth("medium", 15)],
      [],
    );
    expect(result.available).toBe(true);
    expect(result.requestedBerthId).toBe("small");
  });

  it("uses lower marina priority when suitable berth dimensions are equal", () => {
    const result = checkAvailability(
      request(),
      [
        berth("priority-50", 10, { priority: 50 }),
        berth("priority-10", 10, { priority: 10 }),
      ],
      [],
    );
    expect(result.requestedBerthId).toBe("priority-10");
  });

  it("preserves the scarce large berth when a small vessel fits both", () => {
    const result = checkAvailability(
      request({ vesselLengthM: 18, vesselBeamM: 5.5, vesselDraftM: 2.9 }),
      [berth("large", 20), berth("small", 10)],
      [booking("small-booking", 8)],
    );
    expect(result.available).toBe(true);
    expect(assignedBerth(result, "small-booking")).toBe("small");
    expect(assignedBerth(result, REQUESTED_BOOKING_ID)).toBe("large");
  });

  it("allows back-to-back stays under [arrival, departure) semantics", () => {
    const existing = booking("departing", 9, {
      arrivalDate: "2026-09-08",
      departureDate: "2026-09-11",
    });
    const incoming = request({ arrivalDate: "2026-09-11", departureDate: "2026-09-14" });
    expect(intervalsOverlap(existing, incoming)).toBe(false);
    expect(checkAvailability(incoming, [berth("only", 10)], [existing]).available).toBe(true);
  });

  it("excludes an out-of-service berth", () => {
    const result = checkAvailability(request(), [berth("closed", 20, { status: "out_of_service" })], []);
    expect(result.available).toBe(false);
  });

  it("excludes a blocked berth", () => {
    const result = checkAvailability(request(), [berth("blocked", 20, { status: "blocked" })], []);
    expect(result.available).toBe(false);
  });

  it("does not let Marina B bookings consume Marina A capacity", () => {
    const otherTenantBooking = booking("marina-b-booking", 9, { marinaId: MARINA_B });
    const result = checkAvailability(request(), [berth("marina-a-berth", 10)], [otherTenantBooking]);
    expect(result.available).toBe(true);
  });

  it("assigns mixed vessel sizes to distinct compatible berths", () => {
    const result = checkAvailability(
      request({ vesselLengthM: 8, vesselBeamM: 2.4, vesselDraftM: 1.2 }),
      [berth("large", 20), berth("small", 10), berth("medium", 15)],
      [booking("large-vessel", 18), booking("medium-vessel", 14)],
    );
    expect(result.available).toBe(true);
    expect(assignedBerth(result, "large-vessel")).toBe("large");
    expect(assignedBerth(result, "medium-vessel")).toBe("medium");
    expect(assignedBerth(result, REQUESTED_BOOKING_ID)).toBe("small");
  });

  it("honors allow_smaller_vessels while permitting an exact fit", () => {
    const restricted = berth("restricted", 10, {
      allowSmallerVessels: false,
      maxBeamM: 3,
      maxDraftM: 2,
    });
    expect(checkAvailability(request(), [restricted], []).available).toBe(false);
    expect(checkAvailability(request({
      vesselLengthM: 10,
      vesselBeamM: 3,
      vesselDraftM: 2,
    }), [restricted], []).available).toBe(true);
  });

  it("ignores cancelled and checked-out bookings", () => {
    const inactive = [
      booking("cancelled", 9, { status: "cancelled" }),
      booking("departed", 9, { status: "checked_out" }),
    ];
    expect(checkAvailability(request(), [berth("only", 10)], inactive).available).toBe(true);
  });

  it("returns the same assignments regardless of input ordering", () => {
    const berths = [berth("large", 20), berth("small", 10), berth("medium", 15)];
    const bookings = [booking("large-vessel", 18), booking("medium-vessel", 14)];
    const forward = checkAvailability(request(), berths, bookings);
    const reversed = checkAvailability(request(), [...berths].reverse(), [...bookings].reverse());
    expect(reversed).toEqual(forward);
  });

  it("includes transitively overlapping bookings when validating a full-stay assignment", () => {
    const longNarrow = berth("long-narrow", 15, { maxBeamM: 3, maxDraftM: 3 });
    const shortWide = berth("short-wide", 10, { maxBeamM: 5, maxDraftM: 3 });
    const flexible = booking("flexible", 8, {
      arrivalDate: "2026-09-11",
      departureDate: "2026-09-14",
      vesselBeamM: 2,
      vesselDraftM: 1,
    });
    const indirect = booking("indirect-wide", 9, {
      arrivalDate: "2026-09-13",
      departureDate: "2026-09-15",
      vesselBeamM: 4,
      vesselDraftM: 1,
    });
    const result = checkAvailability(
      request({
        arrivalDate: "2026-09-10",
        departureDate: "2026-09-12",
        vesselLengthM: 12,
        vesselBeamM: 2.5,
        vesselDraftM: 1,
      }),
      [longNarrow, shortWide],
      [flexible, indirect],
    );
    expect(result.available).toBe(false);
  });

  it("fails safely when connected demand exceeds the deterministic budget", () => {
    const bookings = Array.from({ length: 64 }, (_, index) => booking(`budget-${index}`, 8));
    expect(() => checkAvailability(request(), [berth("only", 10)], bookings))
      .toThrow(AllocationWorkBudgetExceededError);
  });

  it("fails safely when the recursive search exhausts its node budget", () => {
    const berths = Array.from({ length: 11 }, (_, index) => berth(`budget-${index}`, 10));
    const bookings = Array.from({ length: 11 }, (_, index) => booking(`budget-${index}`, 8));
    expect(() => checkAvailability(request(), berths, bookings))
      .toThrow(AllocationWorkBudgetExceededError);
  });
});
