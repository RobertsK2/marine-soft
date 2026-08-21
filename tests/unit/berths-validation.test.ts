import { describe, expect, it } from "vitest";
import { validateBerthInput } from "@/domain/berths/validation";

const validInput = {
  code: " a-17 ",
  zone: "North Pier",
  maxLengthM: "14.5",
  maxBeamM: "4.2",
  maxDraftM: "2.4",
  priority: "20",
  status: "available",
  allowSmallerVessels: "on",
};

describe("berth validation", () => {
  it("normalizes and accepts a valid physical berth", () => {
    const result = validateBerthInput(validInput);
    expect(result).toEqual({
      success: true,
      data: {
        code: "A-17",
        zone: "North Pier",
        maxLengthM: 14.5,
        maxBeamM: 4.2,
        maxDraftM: 2.4,
        priority: 20,
        status: "available",
        allowSmallerVessels: true,
      },
    });
  });

  it.each([
    ["maxLengthM", "-1"],
    ["maxBeamM", "0"],
    ["maxDraftM", "not-a-number"],
  ])("rejects invalid %s dimensions", (field, value) => {
    const result = validateBerthInput({ ...validInput, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[field as keyof typeof result.errors]).toBeTruthy();
  });

  it.each(["available", "blocked", "out_of_service"])(
    "accepts the Phase 3 status %s",
    (status) => {
      expect(validateBerthInput({ ...validInput, status }).success).toBe(true);
    },
  );

  it("rejects future or unknown statuses", () => {
    const result = validateBerthInput({ ...validInput, status: "reserved" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.status).toBeTruthy();
  });

  it.each(["0", "1.5", "32768"])("rejects invalid priority %s", (priority) => {
    const result = validateBerthInput({ ...validInput, priority });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.priority).toBeTruthy();
  });

  it("requires a code and zone", () => {
    const result = validateBerthInput({ ...validInput, code: "", zone: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.code).toBeTruthy();
      expect(result.errors.zone).toBeTruthy();
    }
  });
});
