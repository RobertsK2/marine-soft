import {
  BOOKING_SEARCH_FIELDS,
  type BookingSearchFieldErrors,
  type BookingSearchValidation,
} from "@/domain/public-booking/types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const MAX_DIMENSION_M = 9999.99;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function marinaDateKey(date: Date, timezone: string) {
  if (!validTimezone(timezone)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function stayNights(arrivalDate: string, departureDate: string) {
  const arrival = Date.parse(`${arrivalDate}T00:00:00Z`);
  const departure = Date.parse(`${departureDate}T00:00:00Z`);
  return Math.round((departure - arrival) / 86_400_000);
}

function positiveDimension(
  value: unknown,
  label: string,
  field: "vesselLengthM" | "vesselBeamM" | "vesselDraftM",
  errors: BookingSearchFieldErrors,
) {
  const raw = stringValue(value);
  const parsed = raw === "" ? Number.NaN : Number(raw);
  const normalized = Math.round(parsed * 100) / 100;
  if (!Number.isFinite(parsed) || normalized < 0.01 || normalized > MAX_DIMENSION_M) {
    errors[field] = `${label} must be between 0.01 and ${MAX_DIMENSION_M} m.`;
    return 0;
  }
  return normalized;
}

export function hasBookingSearchParams(values: Record<string, unknown>) {
  return BOOKING_SEARCH_FIELDS.some((field) => Object.hasOwn(values, field));
}

export function bookingSearchFormValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    BOOKING_SEARCH_FIELDS.map((field) => [field, stringValue(values[field])]),
  ) as Record<(typeof BOOKING_SEARCH_FIELDS)[number], string>;
}

export function validatePublicBookingSearch(
  values: Record<string, unknown>,
  marinaTimezone: string,
  now = new Date(),
): BookingSearchValidation {
  const errors: BookingSearchFieldErrors = {};
  const formValues = bookingSearchFormValues(values);
  const { arrivalDate, departureDate, eta, etd, vesselName } = formValues;
  const today = marinaDateKey(now, marinaTimezone);

  if (!today) {
    return {
      success: false,
      errors,
      formError: "This marina's local timezone is unavailable. Please contact the marina.",
    };
  }

  if (!validDate(arrivalDate)) {
    errors.arrivalDate = "Enter a valid arrival date.";
  } else if (arrivalDate < today) {
    errors.arrivalDate = `Arrival cannot be before today in ${marinaTimezone}.`;
  }
  if (!validDate(departureDate)) {
    errors.departureDate = "Enter a valid departure date.";
  }
  if (validDate(arrivalDate) && validDate(departureDate) && departureDate <= arrivalDate) {
    errors.departureDate = "Departure must be after arrival.";
  }
  if (!LOCAL_TIME.test(eta)) errors.eta = "Enter a valid ETA in marina local time.";
  if (!LOCAL_TIME.test(etd)) errors.etd = "Enter a valid ETD in marina local time.";
  if (vesselName.length > 120) {
    errors.vesselName = "Vessel name must be 120 characters or fewer.";
  }

  const vesselLengthM = positiveDimension(
    formValues.vesselLengthM,
    "Vessel length",
    "vesselLengthM",
    errors,
  );
  const vesselBeamM = positiveDimension(
    formValues.vesselBeamM,
    "Vessel beam",
    "vesselBeamM",
    errors,
  );
  const vesselDraftM = positiveDimension(
    formValues.vesselDraftM,
    "Vessel draft",
    "vesselDraftM",
    errors,
  );

  if (Object.keys(errors).length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      arrivalDate,
      departureDate,
      eta,
      etd,
      marinaTimezone,
      stayNights: stayNights(arrivalDate, departureDate),
      vesselBeamM,
      vesselDraftM,
      vesselLengthM,
      vesselName: vesselName || null,
    },
  };
}
