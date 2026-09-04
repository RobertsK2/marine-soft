import type {
  LengthRate,
  MandatoryFee,
  MandatoryFeeType,
  PricingConfigurationFieldErrors,
  PricingConfigurationInput,
  PricingModel,
  TaxBehavior,
} from "@/domain/pricing/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const MAX_MINOR_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_SEASONS = 52;
const MAX_RATES_PER_SEASON = 100;
const MAX_FEES = 50;
const PRICING_MODELS = new Set<PricingModel>(["length_interval", "per_meter"]);
const TAX_BEHAVIORS = new Set<TaxBehavior>(["exclusive", "inclusive"]);
const FEE_TYPES = new Set<MandatoryFeeType>(["per_booking", "per_night", "per_vessel", "percentage"]);

type Result =
  | { success: true; data: PricingConfigurationInput }
  | { success: false; errors: PricingConfigurationFieldErrors };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integerValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) return Number(value);
  return Number.NaN;
}

function decimalValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d{1,2})?$/.test(value.trim())) return Number(value);
  return Number.NaN;
}

function validDate(value: string) {
  if (!ISO_DATE.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function validMinor(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_MINOR_VALUE;
}

function validateLengthRates(value: unknown, seasonNumber: number) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RATES_PER_SEASON) {
    throw new Error(`Season ${seasonNumber} requires 1–${MAX_RATES_PER_SEASON} vessel-length rates.`);
  }

  const rates: LengthRate[] = value.map((item, index) => {
    const record = objectValue(item);
    const minLengthM = decimalValue(record?.minLengthM);
    const maxLengthM = decimalValue(record?.maxLengthM);
    const nightlyRateMinor = integerValue(record?.nightlyRateMinor);
    if (!Number.isFinite(minLengthM) || minLengthM < 0 || minLengthM > 99_999.99 ||
        !Number.isFinite(maxLengthM) || maxLengthM <= minLengthM || maxLengthM > 99_999.99 ||
        !validMinor(nightlyRateMinor)) {
      throw new Error(`Season ${seasonNumber}, length rate ${index + 1} has an invalid interval or minor-unit price.`);
    }
    return { minLengthM, maxLengthM, nightlyRateMinor };
  }).sort((a, b) => a.minLengthM - b.minLengthM);

  for (let index = 1; index < rates.length; index += 1) {
    if (rates[index].minLengthM < rates[index - 1].maxLengthM) {
      throw new Error(`Season ${seasonNumber} has overlapping vessel-length intervals.`);
    }
  }
  return rates;
}

function validateFees(value: unknown): MandatoryFee[] {
  if (!Array.isArray(value) || value.length > MAX_FEES) {
    throw new Error(`Configure no more than ${MAX_FEES} mandatory fees.`);
  }
  return value.map((item, index) => {
    const record = objectValue(item);
    const name = stringValue(record?.name);
    const type = stringValue(record?.type) as MandatoryFeeType;
    if (name.length < 1 || name.length > 80 || !FEE_TYPES.has(type)) {
      throw new Error(`Mandatory fee ${index + 1} has an invalid name or type.`);
    }
    if (type === "percentage") {
      const percentageBps = integerValue(record?.percentageBps);
      if (!Number.isInteger(percentageBps) || percentageBps < 1 || percentageBps > 10_000) {
        throw new Error(`Mandatory fee ${index + 1} requires 1–10,000 basis points.`);
      }
      return { name, type, amountMinor: null, percentageBps };
    }
    const amountMinor = integerValue(record?.amountMinor);
    if (!validMinor(amountMinor)) {
      throw new Error(`Mandatory fee ${index + 1} requires a non-negative minor-unit amount.`);
    }
    return { name, type, amountMinor, percentageBps: null };
  });
}

export function validatePricingConfigurationInput(value: unknown): Result {
  const errors: PricingConfigurationFieldErrors = {};
  const record = objectValue(value);
  if (!record) return { success: false, errors: { configuration: "Pricing configuration must be an object." } };

  const currency = stringValue(record.currency).toUpperCase();
  const model = stringValue(record.model) as PricingModel;
  const taxBehavior = stringValue(record.taxBehavior) as TaxBehavior;
  const taxRateBps = integerValue(record.taxRateBps);
  if (!CURRENCY.test(currency)) errors.currency = "Use a three-letter ISO currency code.";
  if (!PRICING_MODELS.has(model)) errors.model = "Choose a supported pricing model.";
  if (!TAX_BEHAVIORS.has(taxBehavior)) errors.taxBehavior = "Choose inclusive or exclusive VAT/tax.";
  if (!Number.isInteger(taxRateBps) || taxRateBps < 0 || taxRateBps > 10_000) {
    errors.taxRateBps = "VAT/tax must be 0–10,000 basis points.";
  }

  let seasons: PricingConfigurationInput["seasons"] = [];
  try {
    if (!Array.isArray(record.seasons) || record.seasons.length < 1 || record.seasons.length > MAX_SEASONS) {
      throw new Error(`Configure 1–${MAX_SEASONS} non-overlapping seasons.`);
    }
    seasons = record.seasons.map((item, index) => {
      const season = objectValue(item);
      const name = stringValue(season?.name);
      const startsOn = stringValue(season?.startsOn);
      const endsOn = stringValue(season?.endsOn);
      if (name.length < 1 || name.length > 80 || !validDate(startsOn) || !validDate(endsOn) || endsOn <= startsOn) {
        throw new Error(`Season ${index + 1} has an invalid name or [start, end) date range.`);
      }
      if (model === "per_meter") {
        const meterRateMinor = integerValue(season?.meterRateMinor);
        if (!validMinor(meterRateMinor)) throw new Error(`Season ${index + 1} requires a non-negative per-meter minor-unit rate.`);
        return { name, startsOn, endsOn, meterRateMinor, lengthRates: [] };
      }
      return { name, startsOn, endsOn, meterRateMinor: null, lengthRates: validateLengthRates(season?.lengthRates, index + 1) };
    }).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    for (let index = 1; index < seasons.length; index += 1) {
      if (seasons[index].startsOn < seasons[index - 1].endsOn) {
        throw new Error(`Seasons ${index} and ${index + 1} overlap.`);
      }
    }
  } catch (error) {
    errors.seasons = error instanceof Error ? error.message : "Season configuration is invalid.";
  }

  let fees: MandatoryFee[] = [];
  try {
    fees = validateFees(record.fees);
  } catch (error) {
    errors.fees = error instanceof Error ? error.message : "Mandatory fee configuration is invalid.";
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };
  return { success: true, data: { currency, model, taxBehavior, taxRateBps, seasons, fees } };
}

export function parsePricingConfigurationForm(formData: FormData): Result {
  const serialized = formData.get("configuration");
  if (typeof serialized !== "string" || serialized.length > 250_000) {
    return { success: false, errors: { configuration: "Pricing configuration is missing or too large." } };
  }
  try {
    return validatePricingConfigurationInput(JSON.parse(serialized));
  } catch {
    return { success: false, errors: { configuration: "Pricing configuration is not valid JSON." } };
  }
}
