import type { PublicBookingSearch } from "@/domain/public-booking/types";
import type {
  MandatoryFee,
  PriceFeeSnapshot,
  PriceNightSnapshot,
  PriceSnapshot,
  PricingCatalog,
  PricingSeason,
} from "@/domain/pricing/types";

const DAY_MS = 86_400_000;
const MAX_QUOTE_NIGHTS = 3_660;

export class PricingCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PricingCalculationError";
  }
}

function checkedMinor(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingCalculationError(`${label} is outside the supported money range.`);
  }
  return value;
}

function roundedRatio(amountMinor: number, numerator: number, denominator: number) {
  return checkedMinor(
    Math.round((amountMinor * numerator) / denominator),
    "Calculated amount",
  );
}

function stayDates(arrivalDate: string, departureDate: string) {
  const start = Date.parse(`${arrivalDate}T00:00:00Z`);
  const end = Date.parse(`${departureDate}T00:00:00Z`);
  const nights = Math.round((end - start) / DAY_MS);

  if (!Number.isInteger(nights) || nights < 1 || nights > MAX_QUOTE_NIGHTS) {
    throw new PricingCalculationError("The stay interval cannot be priced.");
  }

  return Array.from({ length: nights }, (_, index) =>
    new Date(start + index * DAY_MS).toISOString().slice(0, 10),
  );
}

function seasonForDate(seasons: PricingSeason[], date: string) {
  const matches = seasons.filter(
    (season) => season.startsOn <= date && date < season.endsOn,
  );
  if (matches.length !== 1) {
    throw new PricingCalculationError(
      matches.length === 0
        ? `No pricing season covers ${date}.`
        : `Multiple pricing seasons cover ${date}.`,
    );
  }
  return matches[0];
}

function calculateNight(
  date: string,
  vesselLengthM: number,
  catalog: PricingCatalog,
): PriceNightSnapshot {
  const season = seasonForDate(catalog.seasons, date);

  if (catalog.model === "per_meter") {
    if (season.meterRateMinor === null) {
      throw new PricingCalculationError(`No per-meter rate is configured for ${date}.`);
    }
    const lengthHundredths = Math.round(vesselLengthM * 100);
    const amountMinor = roundedRatio(
      season.meterRateMinor,
      lengthHundredths,
      100,
    );
    return {
      date,
      season: season.name,
      rateMinor: season.meterRateMinor,
      rateUnit: "meter_night",
      amountMinor,
    };
  }

  const matches = season.lengthRates.filter(
    (rate) =>
      rate.minLengthM <= vesselLengthM && vesselLengthM < rate.maxLengthM,
  );
  if (matches.length !== 1) {
    throw new PricingCalculationError(
      matches.length === 0
        ? `No vessel-length rate covers ${vesselLengthM.toFixed(2)} m on ${date}.`
        : `Multiple vessel-length rates cover ${vesselLengthM.toFixed(2)} m on ${date}.`,
    );
  }

  return {
    date,
    season: season.name,
    rateMinor: matches[0].nightlyRateMinor,
    rateUnit: "night",
    amountMinor: matches[0].nightlyRateMinor,
  };
}

function calculateFee(
  fee: MandatoryFee,
  nightCount: number,
  accommodationMinor: number,
): PriceFeeSnapshot {
  if (fee.type === "percentage") {
    if (fee.percentageBps === null) {
      throw new PricingCalculationError(`${fee.name} has no percentage rate.`);
    }
    return {
      name: fee.name,
      type: fee.type,
      quantity: 1,
      unitAmountMinor: null,
      percentageBps: fee.percentageBps,
      amountMinor: roundedRatio(accommodationMinor, fee.percentageBps, 10_000),
    };
  }

  if (fee.amountMinor === null) {
    throw new PricingCalculationError(`${fee.name} has no fixed amount.`);
  }
  const quantity = fee.type === "per_night" ? nightCount : 1;
  return {
    name: fee.name,
    type: fee.type,
    quantity,
    unitAmountMinor: fee.amountMinor,
    percentageBps: null,
    amountMinor: checkedMinor(fee.amountMinor * quantity, fee.name),
  };
}

export function calculatePriceSnapshot(
  search: PublicBookingSearch,
  catalog: PricingCatalog,
): PriceSnapshot {
  if (!/^[A-Z]{3}$/.test(catalog.currency)) {
    throw new PricingCalculationError("The pricing currency is invalid.");
  }
  if (!Number.isInteger(catalog.taxRateBps) || catalog.taxRateBps < 0) {
    throw new PricingCalculationError("The tax rate is invalid.");
  }

  const dates = stayDates(search.arrivalDate, search.departureDate);
  if (dates.length !== search.stayNights) {
    throw new PricingCalculationError("The validated stay length does not match its dates.");
  }

  const nights = dates.map((date) =>
    calculateNight(date, search.vesselLengthM, catalog),
  );
  const accommodationMinor = checkedMinor(
    nights.reduce((total, night) => total + night.amountMinor, 0),
    "Accommodation subtotal",
  );
  const mandatoryFees = catalog.fees.map((fee) =>
    calculateFee(fee, nights.length, accommodationMinor),
  );
  const mandatoryFeesMinor = checkedMinor(
    mandatoryFees.reduce((total, fee) => total + fee.amountMinor, 0),
    "Mandatory fees subtotal",
  );
  const subtotalMinor = checkedMinor(
    accommodationMinor + mandatoryFeesMinor,
    "Price subtotal",
  );
  const taxMinor =
    catalog.taxBehavior === "inclusive"
      ? roundedRatio(subtotalMinor, catalog.taxRateBps, 10_000 + catalog.taxRateBps)
      : roundedRatio(subtotalMinor, catalog.taxRateBps, 10_000);
  const totalMinor =
    catalog.taxBehavior === "inclusive"
      ? subtotalMinor
      : checkedMinor(subtotalMinor + taxMinor, "Final total");

  return {
    version: 1,
    currency: catalog.currency,
    pricingModel: catalog.model,
    taxBehavior: catalog.taxBehavior,
    taxRateBps: catalog.taxRateBps,
    arrivalDate: search.arrivalDate,
    departureDate: search.departureDate,
    vesselLengthM: search.vesselLengthM,
    nights,
    mandatoryFees,
    accommodationMinor,
    mandatoryFeesMinor,
    subtotalMinor,
    taxMinor,
    totalMinor,
  };
}
