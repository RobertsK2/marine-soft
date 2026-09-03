import type {
  MarinaProfileFieldErrors,
  MarinaProfileInput,
} from "@/domain/marina-profile/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+0-9 ()-]+$/;

export const SUPPORTED_IANA_TIMEZONES = Object.freeze(
  Array.from(new Set(["UTC", ...Intl.supportedValuesOf("timeZone")])).sort(),
);

const TIMEZONE_SET = new Set(SUPPORTED_IANA_TIMEZONES);

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalValue(value: unknown) {
  const normalized = stringValue(value);
  return normalized === "" ? null : normalized;
}

function optionalText(
  value: unknown,
  maxLength: number,
  message: string,
  field: keyof MarinaProfileInput,
  errors: MarinaProfileFieldErrors,
) {
  const normalized = optionalValue(value);
  if (normalized && normalized.length > maxLength) errors[field] = message;
  return normalized;
}

export function isSupportedIanaTimezone(value: string) {
  return TIMEZONE_SET.has(value);
}

export function validateMarinaProfileInput(values: Record<string, unknown>):
  | { success: true; data: MarinaProfileInput }
  | { success: false; errors: MarinaProfileFieldErrors } {
  const errors: MarinaProfileFieldErrors = {};
  const name = stringValue(values.name);
  const timezone = stringValue(values.timezone);
  const publicDescription = optionalText(
    values.publicDescription,
    600,
    "Public description must be 600 characters or fewer.",
    "publicDescription",
    errors,
  );
  const publicDescriptionLocal = optionalText(
    values.publicDescriptionLocal,
    600,
    "Local description must be 600 characters or fewer.",
    "publicDescriptionLocal",
    errors,
  );
  const localLanguage = optionalText(
    values.localLanguage,
    64,
    "Language tag must be 64 characters or fewer.",
    "localLanguage",
    errors,
  );
  const contactEmail = optionalValue(values.contactEmail);
  const contactPhone = optionalValue(values.contactPhone);
  let websiteUrl = optionalValue(values.websiteUrl);

  if (name.length < 1 || name.length > 160) {
    errors.name = "Marina name is required and must be 160 characters or fewer.";
  }

  if (!isSupportedIanaTimezone(timezone)) {
    errors.timezone = "Choose a supported IANA timezone.";
  }

  if (
    contactEmail &&
    (contactEmail.length > 254 || !EMAIL_PATTERN.test(contactEmail))
  ) {
    errors.contactEmail = "Enter a valid contact email address.";
  }

  if (
    contactPhone &&
    (contactPhone.length < 3 ||
      contactPhone.length > 32 ||
      !PHONE_PATTERN.test(contactPhone))
  ) {
    errors.contactPhone = "Use 3–32 digits and standard phone separators only.";
  }

  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (
        parsed.protocol !== "https:" ||
        parsed.username !== "" ||
        parsed.password !== "" ||
        !parsed.hostname ||
        websiteUrl.length > 2048
      ) {
        throw new Error("Unsupported website URL.");
      }
      websiteUrl = parsed.toString();
    } catch {
      errors.websiteUrl = "Enter a valid HTTPS website URL without credentials.";
    }
  }

  if (Object.keys(errors).length > 0) return { success: false, errors };

  return {
    success: true,
    data: {
      contactEmail,
      contactPhone,
      localLanguage,
      name,
      publicDescription,
      publicDescriptionLocal,
      timezone,
      websiteUrl,
    },
  };
}
