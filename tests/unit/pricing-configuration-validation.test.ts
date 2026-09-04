import { describe, expect, it } from "vitest";
import { calculatePriceSnapshot } from "@/domain/pricing/model";
import { validatePricingConfigurationInput } from "@/domain/pricing/validation";

const validConfiguration = {
  currency: "eur",
  model: "per_meter",
  taxBehavior: "exclusive",
  taxRateBps: 2100,
  seasons: [
    { name: "High", startsOn: "2027-06-01", endsOn: "2027-10-01", meterRateMinor: 300, lengthRates: [] },
    { name: "Low", startsOn: "2027-01-01", endsOn: "2027-06-01", meterRateMinor: 200, lengthRates: [] },
  ],
  fees: [
    { name: "Administration", type: "per_booking", amountMinor: 500, percentageBps: null },
    { name: "Levy", type: "percentage", amountMinor: null, percentageBps: 250 },
  ],
};

describe("pricing configuration validation", () => {
  it("normalizes a valid configuration in deterministic season order", () => {
    const result = validatePricingConfigurationInput(validConfiguration);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("EUR");
      expect(result.data.seasons.map((season) => season.name)).toEqual(["Low", "High"]);
    }
  });

  it("feeds the existing pricing engine and produces the expected server quote", () => {
    const result = validatePricingConfigurationInput(validConfiguration);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const quote = calculatePriceSnapshot({
      arrivalDate: "2027-05-31",
      departureDate: "2027-06-02",
      eta: "14:00",
      etd: "10:00",
      marinaTimezone: "Europe/Riga",
      stayNights: 2,
      vesselBeamM: 3.5,
      vesselDraftM: 2,
      vesselLengthM: 12.5,
      vesselName: "Configuration Test",
    }, { ...result.data, seasons: result.data.seasons.map((season, index) => ({ ...season, id: `season-${index}` })) });
    expect(quote).toMatchObject({ accommodationMinor: 6250, mandatoryFeesMinor: 656, taxMinor: 1450, totalMinor: 8356 });
  });

  it("rejects overlapping seasons", () => {
    const result = validatePricingConfigurationInput({
      ...validConfiguration,
      seasons: [
        validConfiguration.seasons[0],
        { ...validConfiguration.seasons[1], endsOn: "2027-07-01" },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.seasons).toMatch(/overlap/i);
  });

  it.each([
    ["negative per-meter rate", { ...validConfiguration, seasons: [{ ...validConfiguration.seasons[0], meterRateMinor: -1 }] }],
    ["negative fixed fee", { ...validConfiguration, fees: [{ name: "Bad", type: "per_night", amountMinor: -1 }] }],
    ["fractional minor unit", { ...validConfiguration, fees: [{ name: "Bad", type: "per_vessel", amountMinor: 1.5 }] }],
  ])("rejects %s", (_label, configuration) => {
    expect(validatePricingConfigurationInput(configuration).success).toBe(false);
  });

  it("rejects overlapping length intervals for the fixed model", () => {
    const result = validatePricingConfigurationInput({
      ...validConfiguration,
      model: "length_interval",
      seasons: [{
        name: "Standard", startsOn: "2027-01-01", endsOn: "2028-01-01", meterRateMinor: null,
        lengthRates: [
          { minLengthM: 0, maxLengthM: 12, nightlyRateMinor: 2500 },
          { minLengthM: 10, maxLengthM: 20, nightlyRateMinor: 4000 },
        ],
      }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors.seasons).toMatch(/overlapping vessel-length/i);
  });

  it("rejects malformed currency and VAT/tax values", () => {
    const result = validatePricingConfigurationInput({ ...validConfiguration, currency: "EURO", taxRateBps: 10001 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.currency).toBeTruthy();
      expect(result.errors.taxRateBps).toBeTruthy();
    }
  });
});
