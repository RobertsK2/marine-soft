import { describe, expect, it } from "vitest";
import { extensionNights, parseExtensionBerthOptions } from "@/domain/booking-extensions/model";

describe("Milestone 3 Phase 4 booking extension model", () => {
  it("accepts only a strict future departure and counts added nights", () => {
    expect(extensionNights("2028-06-05", "2028-06-08")).toBe(3);
    expect(extensionNights("2028-06-05", "2028-06-05")).toBeNull();
    expect(extensionNights("2028-06-05", "2028-06-04")).toBeNull();
    expect(extensionNights("not-a-date", "2028-06-08")).toBeNull();
  });

  it("keeps only complete authoritative berth options", () => {
    expect(parseExtensionBerthOptions([
      { berthId: "berth-1", code: "A-01", zone: "North", maxLengthM: 10, maxBeamM: 3, maxDraftM: 2 },
      { berthId: "broken", code: "A-02" },
    ])).toEqual([
      { berthId: "berth-1", code: "A-01", zone: "North", maxLengthM: 10, maxBeamM: 3, maxDraftM: 2 },
    ]);
  });
});
