import {
  BERTH_STATUSES,
  type BerthFieldErrors,
  type BerthInput,
  type BerthStatus,
} from "@/domain/berths/types";

const MAX_DIMENSION_M = 9999.99;
const MAX_PRIORITY = 32767;

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(
  value: unknown,
  label: string,
  errors: BerthFieldErrors,
  field: "maxLengthM" | "maxBeamM" | "maxDraftM",
) {
  const raw = stringValue(value);
  const parsed = raw === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > MAX_DIMENSION_M) {
    errors[field] = `${label} must be between 0.01 and ${MAX_DIMENSION_M} m.`;
    return 0;
  }
  return Math.round(parsed * 100) / 100;
}

function isBerthStatus(value: string): value is BerthStatus {
  return BERTH_STATUSES.some((status) => status === value);
}

export function validateBerthInput(values: Record<string, unknown>):
  | { success: true; data: BerthInput }
  | { success: false; errors: BerthFieldErrors } {
  const errors: BerthFieldErrors = {};
  const code = stringValue(values.code).toUpperCase();
  const zone = stringValue(values.zone);

  if (code.length < 1 || code.length > 32) {
    errors.code = "Berth code is required and must be 32 characters or fewer.";
  }
  if (zone.length < 1 || zone.length > 80) {
    errors.zone = "Zone is required and must be 80 characters or fewer.";
  }

  const maxLengthM = positiveNumber(
    values.maxLengthM,
    "Maximum length",
    errors,
    "maxLengthM",
  );
  const maxBeamM = positiveNumber(
    values.maxBeamM,
    "Maximum beam",
    errors,
    "maxBeamM",
  );
  const maxDraftM = positiveNumber(
    values.maxDraftM,
    "Maximum draft",
    errors,
    "maxDraftM",
  );

  const priorityRaw = stringValue(values.priority);
  const priority = priorityRaw === "" ? Number.NaN : Number(priorityRaw);
  if (!Number.isInteger(priority) || priority < 1 || priority > MAX_PRIORITY) {
    errors.priority = `Priority must be a whole number from 1 to ${MAX_PRIORITY}.`;
  }

  const statusValue = stringValue(values.status);
  if (!isBerthStatus(statusValue)) {
    errors.status = "Choose a valid operational status.";
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      code,
      zone,
      maxLengthM,
      maxBeamM,
      maxDraftM,
      priority,
      status: statusValue as BerthStatus,
      allowSmallerVessels:
        values.allowSmallerVessels === true ||
        values.allowSmallerVessels === "true" ||
        values.allowSmallerVessels === "on",
    },
  };
}
