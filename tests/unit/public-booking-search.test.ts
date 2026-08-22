import { describe, expect, it } from "vitest";
import {
  bookingSearchFormValues,
  hasBookingSearchParams,
  marinaDateKey,
  validatePublicBookingSearch,
} from "@/domain/public-booking/validation";

const now = new Date("2026-08-22T21:30:00Z");
const validInput = {
  arrivalDate: "2026-08-24",
  departureDate: "2026-08-27",
  eta: "14:30",
  etd: "10:00",
  vesselLengthM: "12.50",
  vesselBeamM: "3.8",
  vesselDraftM: "2.10",
  vesselName: " Aurora ",
};

describe("Phase 2 public booking search", () => {
  it("normalizes a clean marina-timezone availability request", () => {
    expect(validatePublicBookingSearch(validInput, "Europe/Riga", now)).toEqual({
      success: true,
      data: {
        arrivalDate: "2026-08-24",
        departureDate: "2026-08-27",
        eta: "14:30",
        etd: "10:00",
        marinaTimezone: "Europe/Riga",
        stayNights: 3,
        vesselBeamM: 3.8,
        vesselDraftM: 2.1,
        vesselLengthM: 12.5,
        vesselName: "Aurora",
      },
    });
  });

  it.each(["2026-08-24", "2026-08-23"])(
    "requires departure after arrival when departure=%s",
    (departureDate) => {
      const result = validatePublicBookingSearch(
        { ...validInput, departureDate },
        "Europe/Riga",
        now,
      );
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors.departureDate).toBeTruthy();
    },
  );

  it.each([
    ["arrivalDate", "2026-02-30"],
    ["eta", "24:00"],
    ["etd", "9:30"],
    ["vesselLengthM", "0"],
    ["vesselBeamM", "-2"],
    ["vesselDraftM", "0.001"],
  ])("rejects invalid %s=%s", (field, value) => {
    const result = validatePublicBookingSearch(
      { ...validInput, [field]: value },
      "Europe/Riga",
      now,
    );
    expect(result.success).toBe(false);
  });

  it("uses the marina timezone for the earliest allowed arrival", () => {
    expect(marinaDateKey(now, "Europe/Riga")).toBe("2026-08-23");
    expect(marinaDateKey(now, "America/New_York")).toBe("2026-08-22");

    const rigaResult = validatePublicBookingSearch(
      { ...validInput, arrivalDate: "2026-08-22" },
      "Europe/Riga",
      now,
    );
    expect(rigaResult.success).toBe(false);
    if (!rigaResult.success) expect(rigaResult.errors.arrivalDate).toContain("Europe/Riga");
  });

  it("rejects an invalid marina timezone without trusting a query parameter", () => {
    const result = validatePublicBookingSearch(validInput, "Not/A_Zone", now);
    expect(result).toMatchObject({ success: false, errors: {} });
    if (!result.success) expect(result.formError).toContain("timezone");
  });

  it("accepts an omitted vessel name and preserves invalid entered values", () => {
    const result = validatePublicBookingSearch(
      { ...validInput, vesselName: "" },
      "Europe/Riga",
      now,
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vesselName).toBeNull();

    expect(bookingSearchFormValues({ ...validInput, vesselBeamM: " bad " }).vesselBeamM)
      .toBe("bad");
    expect(hasBookingSearchParams({ utm_source: "marina" })).toBe(false);
    expect(hasBookingSearchParams({ arrivalDate: "" })).toBe(true);
  });
});
