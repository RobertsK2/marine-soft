import { describe, expect, it } from "vitest";
import { calendarDays, calendarMonth, isCalendarDate, shiftCalendarDay, shiftCalendarMonth } from "@/components/public-booking/calendar-model";

describe("booking calendar presentation dates", () => {
  it("recognizes valid calendar dates without trusting invalid query parameters", () => {
    expect(isCalendarDate("2028-02-29")).toBe(true);
    for (const key of ["", "bad", "2027-99-99", "2027-02-30", "2027-02-29"]) expect(isCalendarDate(key)).toBe(false);
  });
  it("renders a Monday-first six-week grid across month boundaries", () => {
    const days = calendarDays("2027-01-15");
    expect(days).toHaveLength(42);
    expect(days[0]).toBe("2026-12-28");
    expect(days[41]).toBe("2027-02-07");
    expect(calendarMonth("2027-01-15")).toBe("2027-01-01");
  });
  it("handles leap years, end-of-month navigation, and daylight-saving boundaries", () => {
    expect(shiftCalendarMonth("2028-01-31", 1)).toBe("2028-02-29");
    expect(shiftCalendarMonth("2027-01-31", 1)).toBe("2027-02-28");
    expect(shiftCalendarMonth("2028-02-29", 12)).toBe("2029-02-28");
    expect(shiftCalendarDay("2027-03-28", 1)).toBe("2027-03-29");
    expect(shiftCalendarDay("2027-01-01", -1)).toBe("2026-12-31");
    expect(calendarDays("9999-12-01")).toHaveLength(42);
    expect(shiftCalendarDay("9999-12-31", 1)).toBe("+010000-01-01");
  });
});
