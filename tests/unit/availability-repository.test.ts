import { describe, expect, it } from "vitest";
import { AllocationWorkBudgetExceededError } from "@/domain/availability/matching";
import { assertCompleteAvailabilityPage } from "@/domain/availability/repository";

describe("availability snapshot completeness", () => {
  it("accepts a complete exact-count result", () => {
    expect(() => assertCompleteAvailabilityPage(1_000, 1_000)).not.toThrow();
  });

  it("fails safely when the Data API truncates an allocation input", () => {
    expect(() => assertCompleteAvailabilityPage(1_001, 1_000))
      .toThrow(AllocationWorkBudgetExceededError);
  });

  it("fails safely when an exact count is unavailable", () => {
    expect(() => assertCompleteAvailabilityPage(null, 0))
      .toThrow(AllocationWorkBudgetExceededError);
  });
});
