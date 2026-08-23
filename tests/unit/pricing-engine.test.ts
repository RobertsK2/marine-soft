import { describe, expect, it } from "vitest";
import type { PublicBookingSearch } from "@/domain/public-booking/types";
import {
  calculatePriceSnapshot,
  PricingCalculationError,
} from "@/domain/pricing/model";
import type { PricingCatalog } from "@/domain/pricing/types";

const search: PublicBookingSearch = {
  arrivalDate: "2026-09-30",
  departureDate: "2026-10-02",
  eta: "14:30",
  etd: "10:00",
  marinaTimezone: "Europe/Riga",
  stayNights: 2,
  vesselBeamM: 3.8,
  vesselDraftM: 2.1,
  vesselLengthM: 12.5,
  vesselName: "Aurora",
};

const perMeterCatalog: PricingCatalog = {
  currency: "EUR",
  model: "per_meter",
  taxBehavior: "exclusive",
  taxRateBps: 2100,
  seasons: [
    {
      id: "internal-high-season-id",
      name: "High season",
      startsOn: "2026-06-01",
      endsOn: "2026-10-01",
      lengthRates: [],
      meterRateMinor: 300,
    },
    {
      id: "internal-autumn-season-id",
      name: "Autumn season",
      startsOn: "2026-10-01",
      endsOn: "2027-01-01",
      lengthRates: [],
      meterRateMinor: 220,
    },
  ],
  fees: [
    { name: "Administration", type: "per_booking", amountMinor: 500, percentageBps: null },
    { name: "Environment", type: "per_night", amountMinor: 150, percentageBps: null },
    { name: "Registration", type: "per_vessel", amountMinor: 200, percentageBps: null },
    { name: "Levy", type: "percentage", amountMinor: null, percentageBps: 250 },
  ],
};

describe("Milestone 2 Phase 4 pricing engine", () => {
  it("prices each occupied night using its active per-meter season", () => {
    const quote = calculatePriceSnapshot(search, perMeterCatalog);

    expect(quote.nights).toEqual([
      {
        date: "2026-09-30",
        season: "High season",
        rateMinor: 300,
        rateUnit: "meter_night",
        amountMinor: 3750,
      },
      {
        date: "2026-10-01",
        season: "Autumn season",
        rateMinor: 220,
        rateUnit: "meter_night",
        amountMinor: 2750,
      },
    ]);
    expect(quote.accommodationMinor).toBe(6500);
  });

  it("calculates all mandatory fee types and exclusive VAT in minor units", () => {
    const quote = calculatePriceSnapshot(search, perMeterCatalog);

    expect(quote.mandatoryFees.map(({ type, amountMinor }) => ({ type, amountMinor })))
      .toEqual([
        { type: "per_booking", amountMinor: 500 },
        { type: "per_night", amountMinor: 300 },
        { type: "per_vessel", amountMinor: 200 },
        { type: "percentage", amountMinor: 163 },
      ]);
    expect(quote.mandatoryFeesMinor).toBe(1163);
    expect(quote.subtotalMinor).toBe(7663);
    expect(quote.taxMinor).toBe(1609);
    expect(quote.totalMinor).toBe(9272);
  });

  it("uses fixed [min, max) length bands and extracts inclusive VAT", () => {
    const catalog: PricingCatalog = {
      currency: "EUR",
      model: "length_interval",
      taxBehavior: "inclusive",
      taxRateBps: 2100,
      seasons: [
        {
          id: "internal-season-id",
          name: "Standard",
          startsOn: "2026-01-01",
          endsOn: "2027-01-01",
          meterRateMinor: null,
          lengthRates: [
            { minLengthM: 0, maxLengthM: 10, nightlyRateMinor: 2500 },
            { minLengthM: 10, maxLengthM: 20, nightlyRateMinor: 4000 },
          ],
        },
      ],
      fees: [],
    };
    const quote = calculatePriceSnapshot(
      { ...search, vesselLengthM: 10 },
      catalog,
    );

    expect(quote.nights.every((night) => night.amountMinor === 4000)).toBe(true);
    expect(quote.subtotalMinor).toBe(8000);
    expect(quote.taxMinor).toBe(1388);
    expect(quote.totalMinor).toBe(8000);
  });

  it("rejects uncovered seasonal nights instead of guessing a price", () => {
    expect(() =>
      calculatePriceSnapshot(
        { ...search, arrivalDate: "2027-01-01", departureDate: "2027-01-02", stayNights: 1 },
        perMeterCatalog,
      ),
    ).toThrowError(new PricingCalculationError("No pricing season covers 2027-01-01."));
  });

  it("rejects missing vessel-length bands instead of selecting a nearby price", () => {
    expect(() =>
      calculatePriceSnapshot(
        search,
        {
          ...perMeterCatalog,
          model: "length_interval",
          fees: [],
          seasons: perMeterCatalog.seasons.map((season) => ({
            ...season,
            meterRateMinor: null,
            lengthRates: [{ minLengthM: 0, maxLengthM: 10, nightlyRateMinor: 2000 }],
          })),
        },
      ),
    ).toThrow(/No vessel-length rate covers 12\.50 m/);
  });

  it("produces a self-contained snapshot unaffected by later catalog changes", () => {
    const mutableCatalog = structuredClone(perMeterCatalog);
    const quote = calculatePriceSnapshot(search, mutableCatalog);
    mutableCatalog.seasons[0].meterRateMinor = 9999;
    mutableCatalog.fees[0].amountMinor = 9999;

    expect(quote.nights[0].rateMinor).toBe(300);
    expect(quote.mandatoryFees[0].unitAmountMinor).toBe(500);
    expect(quote.totalMinor).toBe(9272);
  });

  it("returns a public snapshot without internal configuration ids", () => {
    const serialized = JSON.stringify(calculatePriceSnapshot(search, perMeterCatalog));
    expect(serialized).not.toMatch(/internal-.*-id|marinaId|seasonId|feeId/i);
  });

  it("rejects a client-supplied stay count that disagrees with the dates", () => {
    expect(() =>
      calculatePriceSnapshot({ ...search, stayNights: 99 }, perMeterCatalog),
    ).toThrow("The validated stay length does not match its dates.");
  });
});
