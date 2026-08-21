import type {
  BookingFieldErrors,
  BookingInput,
} from "@/domain/bookings/types";

const MAX_DIMENSION_M = 9999.99;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

function positiveDimension(
  value: unknown,
  label: string,
  field: "vesselLengthM" | "vesselBeamM" | "vesselDraftM",
  errors: BookingFieldErrors,
) {
  const raw = stringValue(value);
  const parsed = raw === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_DIMENSION_M) {
    errors[field] = `${label} must be between 0.01 and ${MAX_DIMENSION_M} m.`;
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

export function validateBookingInput(values: Record<string, unknown>):
  | { success: true; data: BookingInput }
  | { success: false; errors: BookingFieldErrors } {
  const errors: BookingFieldErrors = {};
  const arrivalDate = stringValue(values.arrivalDate);
  const departureDate = stringValue(values.departureDate);
  const eta = stringValue(values.eta);
  const etd = stringValue(values.etd);
  const customerName = stringValue(values.customerName);
  const customerEmail = stringValue(values.customerEmail).toLowerCase();
  const customerPhone = stringValue(values.customerPhone);
  const vesselNameValue = stringValue(values.vesselName);

  if (!validDate(arrivalDate)) errors.arrivalDate = "Enter a valid arrival date.";
  if (!validDate(departureDate)) errors.departureDate = "Enter a valid departure date.";
  if (validDate(arrivalDate) && validDate(departureDate) && departureDate <= arrivalDate) {
    errors.departureDate = "Departure must be after arrival.";
  }
  if (!LOCAL_TIME.test(eta)) errors.eta = "Enter a valid ETA.";
  if (!LOCAL_TIME.test(etd)) errors.etd = "Enter a valid ETD.";
  if (customerName.length < 1 || customerName.length > 160) {
    errors.customerName = "Customer name is required and must be 160 characters or fewer.";
  }
  if (customerEmail.length > 254 || !EMAIL.test(customerEmail)) {
    errors.customerEmail = "Enter a valid customer email address.";
  }
  if (customerPhone.length < 5 || customerPhone.length > 40) {
    errors.customerPhone = "Customer phone is required and must be 5–40 characters.";
  }
  if (vesselNameValue.length > 120) {
    errors.vesselName = "Vessel name must be 120 characters or fewer.";
  }

  const vesselLengthM = positiveDimension(
    values.vesselLengthM,
    "Vessel length",
    "vesselLengthM",
    errors,
  );
  const vesselBeamM = positiveDimension(
    values.vesselBeamM,
    "Vessel beam",
    "vesselBeamM",
    errors,
  );
  const vesselDraftM = positiveDimension(
    values.vesselDraftM,
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
      customerName,
      customerEmail,
      customerPhone,
      vesselName: vesselNameValue || null,
      vesselLengthM,
      vesselBeamM,
      vesselDraftM,
    },
  };
}
