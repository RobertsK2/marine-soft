import { describe, expect, it } from "vitest";
import { buildBookingBerthAssignmentState } from "@/domain/berth-assignments/model";
import type { BerthAssignment } from "@/domain/berth-assignments/types";
import type { Berth } from "@/domain/berths/types";
import type { Booking } from "@/domain/bookings/types";

const booking = {
  id: "booking-1", marina_id: "marina-1", arrival_date: "2028-06-01", departure_date: "2028-06-05",
  vessel_length_m: 9, vessel_beam_m: 3, vessel_draft_m: 1.5,
} as Booking;

function berth(id: string, code: string, overrides: Partial<Berth> = {}): Berth {
  return {
    id, code, marina_id: "marina-1", zone: "North Pier", status: "available",
    allow_smaller_vessels: true, max_length_m: 10, max_beam_m: 3.3, max_draft_m: 1.8,
    priority: 10, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assignment(overrides: Partial<BerthAssignment>): BerthAssignment {
  return {
    id: "assignment-1", marina_id: "marina-1", booking_id: "booking-1", berth_id: "berth-1",
    arrival_date: "2028-06-01", departure_date: "2028-06-05", assigned_at: "2028-05-01T00:00:00Z",
    assigned_by: "user-1", assignment_kind: "stay", ended_at: null, ended_by: null, ended_reason: null,
    ...overrides,
  };
}

describe("Milestone 3 Phase 1 berth assignment model", () => {
  it("lists only operational suitable berths and marks overlapping real conflicts", () => {
    const state = buildBookingBerthAssignmentState(booking, [
      berth("berth-1", "A-01"),
      berth("berth-2", "A-02", { status: "blocked" }),
      berth("berth-3", "A-03", { max_length_m: 8 }),
    ], [assignment({ booking_id: "other-booking" })]);

    expect(state.options).toEqual([expect.objectContaining({ berthId: "berth-1", conflict: true })]);
    expect(state.current).toBeNull();
  });

  it("preserves ended history while identifying exactly one current assignment", () => {
    const state = buildBookingBerthAssignmentState(booking, [
      berth("berth-1", "A-01"), berth("berth-2", "A-02"),
    ], [
      assignment({ id: "old", berth_id: "berth-1", ended_at: "2028-05-02T00:00:00Z", ended_by: "user-1", ended_reason: "reassigned" }),
      assignment({ id: "new", berth_id: "berth-2", assigned_at: "2028-05-02T00:00:00Z" }),
    ]);

    expect(state.current?.berthCode).toBe("A-02");
    expect(state.history.map((item) => item.berthCode)).toEqual(["A-02", "A-01"]);
  });

  it("keeps a confirmed extension move as a separate future segment", () => {
    const state = buildBookingBerthAssignmentState(booking, [
      berth("berth-1", "A-01"), berth("berth-2", "A-02"),
    ], [
      assignment({ departure_date: "2028-06-03" }),
      assignment({
        id: "planned", berth_id: "berth-2", arrival_date: "2028-06-03",
        assignment_kind: "planned_move",
      }),
    ]);

    expect(state.current?.berthCode).toBe("A-01");
    expect(state.activeSegments.map((item) => item.berthCode)).toEqual(["A-01", "A-02"]);
    expect(state.plannedMoves).toEqual([expect.objectContaining({ berthCode: "A-02" })]);
  });
});
