export type PricingModel = "length_interval" | "per_meter";
export type TaxBehavior = "exclusive" | "inclusive";
export type MandatoryFeeType =
  | "per_booking"
  | "per_night"
  | "per_vessel"
  | "percentage";

export type LengthRate = {
  minLengthM: number;
  maxLengthM: number;
  nightlyRateMinor: number;
};

export type PricingSeason = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  lengthRates: LengthRate[];
  meterRateMinor: number | null;
};

export type MandatoryFee = {
  name: string;
  type: MandatoryFeeType;
  amountMinor: number | null;
  percentageBps: number | null;
};

export type PricingCatalog = {
  currency: string;
  model: PricingModel;
  taxBehavior: TaxBehavior;
  taxRateBps: number;
  seasons: PricingSeason[];
  fees: MandatoryFee[];
};

export type PriceNightSnapshot = {
  date: string;
  season: string;
  rateMinor: number;
  rateUnit: "night" | "meter_night";
  amountMinor: number;
};

export type PriceFeeSnapshot = {
  name: string;
  type: MandatoryFeeType;
  quantity: number;
  unitAmountMinor: number | null;
  percentageBps: number | null;
  amountMinor: number;
};

export type PriceSnapshot = {
  version: 1;
  currency: string;
  pricingModel: PricingModel;
  taxBehavior: TaxBehavior;
  taxRateBps: number;
  arrivalDate: string;
  departureDate: string;
  vesselLengthM: number;
  nights: PriceNightSnapshot[];
  mandatoryFees: PriceFeeSnapshot[];
  accommodationMinor: number;
  mandatoryFeesMinor: number;
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
};

export type PublicPriceQuote = PriceSnapshot;
