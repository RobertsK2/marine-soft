import type { Json } from "@/types/database";
import type { ExtensionBerthOption } from "@/domain/booking-extensions/types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function extensionNights(currentDeparture: string, requestedDeparture: string) {
  if (!ISO_DATE.test(currentDeparture) || !ISO_DATE.test(requestedDeparture)) return null;
  const current = Date.parse(`${currentDeparture}T00:00:00Z`);
  const requested = Date.parse(`${requestedDeparture}T00:00:00Z`);
  const nights = (requested - current) / 86_400_000;
  return Number.isInteger(nights) && nights > 0 ? nights : null;
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseExtensionBerthOptions(value: Json): ExtensionBerthOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const berthId = item.berthId;
    const code = item.code;
    const zone = item.zone;
    const maxLengthM = item.maxLengthM;
    const maxBeamM = item.maxBeamM;
    const maxDraftM = item.maxDraftM;
    if (
      typeof berthId !== "string"
      || typeof code !== "string"
      || typeof zone !== "string"
      || typeof maxLengthM !== "number"
      || typeof maxBeamM !== "number"
      || typeof maxDraftM !== "number"
    ) return [];
    return [{ berthId, code, zone, maxLengthM, maxBeamM, maxDraftM }];
  });
}

