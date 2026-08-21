import { describe, expect, it } from "vitest";
import { mapBerthsToLayout, deriveMapDisplayStatus } from "@/domain/marina-map/model";
import { PILOT_BERTH_LAYOUT } from "@/domain/marina-map/pilot-layout";
import type { Berth } from "@/domain/berths/types";

function berth(overrides: Partial<Berth> = {}): Berth {
  return {
    allow_smaller_vessels: true,
    code: "A-01",
    created_at: "2026-08-21T00:00:00Z",
    id: "d5000000-0000-4000-8000-000000000001",
    marina_id: "d1000000-0000-4000-8000-000000000001",
    max_beam_m: 3,
    max_draft_m: 2,
    max_length_m: 10,
    priority: 10,
    status: "available",
    updated_at: "2026-08-21T00:00:00Z",
    zone: "North Pier",
    ...overrides,
  };
}

describe("Phase 6 marina map model", () => {
  it("configures at least 10 unique pilot berths by stable UUID", () => {
    expect(PILOT_BERTH_LAYOUT.length).toBeGreaterThanOrEqual(10);
    expect(new Set(PILOT_BERTH_LAYOUT.map(({ berthId }) => berthId)).size).toBe(
      PILOT_BERTH_LAYOUT.length,
    );
    for (const placement of PILOT_BERTH_LAYOUT) {
      expect(placement.berthId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it.each([
    ["available", "available"],
    ["blocked", "unavailable"],
    ["out_of_service", "unavailable"],
  ] as const)("derives %s as %s without inventing booking state", (status, expected) => {
    expect(deriveMapDisplayStatus(berth({ status }))).toBe(expected);
  });

  it("joins geometry to real rows by berth id and reports unmapped inventory", () => {
    const mapped = berth();
    const unmapped = berth({ id: "aaaaaaaa-0000-4000-8000-000000000001", code: "NEW-01" });
    const result = mapBerthsToLayout([unmapped, mapped], PILOT_BERTH_LAYOUT);

    expect(result.mappedBerths).toHaveLength(1);
    expect(result.mappedBerths[0]?.berth).toBe(mapped);
    expect(result.mappedBerths[0]?.placement.berthId).toBe(mapped.id);
    expect(result.unmappedBerths).toEqual([unmapped]);
  });
});
