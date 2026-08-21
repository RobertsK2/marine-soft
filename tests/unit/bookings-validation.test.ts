import { describe, expect, it } from "vitest";
import { validateBookingInput } from "@/domain/bookings/validation";

const validInput = {
  arrivalDate: "2026-09-10",
  departureDate: "2026-09-12",
  eta: "14:30",
  etd: "10:00",
  customerName: " Marina Guest ",
  customerEmail: " GUEST@EXAMPLE.COM ",
  customerPhone: " +371 20000000 ",
  vesselName: " Aurora ",
  vesselLengthM: "12.5",
  vesselBeamM: "3.8",
  vesselDraftM: "2.1",
};

describe("booking validation", () => {
  it("normalizes a valid manual booking snapshot", () => {
    expect(validateBookingInput(validInput)).toEqual({
      success: true,
      data: {
        arrivalDate: "2026-09-10",
        departureDate: "2026-09-12",
        eta: "14:30",
        etd: "10:00",
        customerName: "Marina Guest",
        customerEmail: "guest@example.com",
        customerPhone: "+371 20000000",
        vesselName: "Aurora",
        vesselLengthM: 12.5,
        vesselBeamM: 3.8,
        vesselDraftM: 2.1,
      },
    });
  });

  it.each([
    ["departureDate", "2026-09-10"],
    ["departureDate", "2026-09-09"],
    ["arrivalDate", "2026-02-30"],
  ])("rejects an invalid stay field %s=%s", (field, value) => {
    const result = validateBookingInput({ ...validInput, [field]: value });
    expect(result.success).toBe(false);
  });

  it.each([
    ["vesselLengthM", "-1"],
    ["vesselBeamM", "0"],
    ["vesselDraftM", "not-a-number"],
  ])("rejects invalid %s", (field, value) => {
    const result = validateBookingInput({ ...validInput, [field]: value });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[field as keyof typeof result.errors]).toBeTruthy();
    }
  });

  it("requires usable customer contacts", () => {
    const result = validateBookingInput({
      ...validInput,
      customerName: "",
      customerEmail: "invalid",
      customerPhone: "1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.customerName).toBeTruthy();
      expect(result.errors.customerEmail).toBeTruthy();
      expect(result.errors.customerPhone).toBeTruthy();
    }
  });

  it("accepts an omitted vessel name without losing the dimension snapshot", () => {
    const result = validateBookingInput({ ...validInput, vesselName: "" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.vesselName).toBeNull();
  });

});
