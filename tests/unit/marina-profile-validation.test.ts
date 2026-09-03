import { describe, expect, it } from "vitest";
import {
  isSupportedIanaTimezone,
  validateMarinaProfileInput,
} from "@/domain/marina-profile/validation";

const validInput = {
  contactEmail: " harbour@example.test ",
  contactPhone: " +371 20 000 000 ",
  localLanguage: " Latviešu ",
  name: " Marina A ",
  publicDescription: " Sheltered visitor berths. ",
  publicDescriptionLocal: " Drošas viesu piestātnes. ",
  timezone: "Europe/Riga",
  websiteUrl: "https://marina.example/visitor",
};

describe("marina profile validation", () => {
  it("normalizes a valid profile and preserves the existing language-name model", () => {
    expect(validateMarinaProfileInput(validInput)).toEqual({
      success: true,
      data: {
        contactEmail: "harbour@example.test",
        contactPhone: "+371 20 000 000",
        localLanguage: "Latviešu",
        name: "Marina A",
        publicDescription: "Sheltered visitor berths.",
        publicDescriptionLocal: "Drošas viesu piestātnes.",
        timezone: "Europe/Riga",
        websiteUrl: "https://marina.example/visitor",
      },
    });
  });

  it("normalizes empty optional fields to null", () => {
    const result = validateMarinaProfileInput({
      ...validInput,
      contactEmail: " ",
      contactPhone: "",
      localLanguage: "",
      publicDescription: "",
      publicDescriptionLocal: "",
      websiteUrl: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        contactEmail: null,
        contactPhone: null,
        localLanguage: null,
        publicDescription: null,
        publicDescriptionLocal: null,
        websiteUrl: null,
      });
    }
  });

  it.each(["UTC", "Europe/Riga", "America/New_York"])(
    "accepts supported IANA timezone %s",
    (timezone) => expect(isSupportedIanaTimezone(timezone)).toBe(true),
  );

  it.each(["CET", "GMT+2", "Not/A_Zone", "US/Eastern", ""])(
    "rejects unsupported or non-canonical timezone %s",
    (timezone) => {
      const result = validateMarinaProfileInput({ ...validInput, timezone });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.errors.timezone).toBeTruthy();
    },
  );

  it("rejects unsafe or malformed public contact values", () => {
    const result = validateMarinaProfileInput({
      ...validInput,
      contactEmail: "not-an-email",
      contactPhone: "call-me-now",
      websiteUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.contactEmail).toBeTruthy();
      expect(result.errors.contactPhone).toBeTruthy();
      expect(result.errors.websiteUrl).toBeTruthy();
    }
  });

  it("rejects overlong names and descriptions", () => {
    const result = validateMarinaProfileInput({
      ...validInput,
      name: "M".repeat(161),
      publicDescription: "D".repeat(601),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.name).toBeTruthy();
      expect(result.errors.publicDescription).toBeTruthy();
    }
  });
});
