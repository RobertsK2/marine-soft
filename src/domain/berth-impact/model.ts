import type { Json } from "@/types/database";
import type { BerthImpactAlternative, BerthImpactBooking } from "./types";

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseBerthImpactBookings(value: Json | null | undefined): BerthImpactBooking[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    const bookingId = text(row.bookingId);
    const reference = text(row.reference);
    const status = row.status === "confirmed" || row.status === "checked_in" ? row.status : null;
    const arrivalDate = text(row.arrivalDate);
    const departureDate = text(row.departureDate);
    if (!bookingId || !reference || !status || !arrivalDate || !departureDate) return [];
    const berthOptions: BerthImpactAlternative[] = Array.isArray(row.berthOptions)
      ? row.berthOptions.flatMap((option) => {
        if (!option || typeof option !== "object" || Array.isArray(option)) return [];
        const candidate = option as Record<string, Json | undefined>;
        const id = text(candidate.berthId);
        const code = text(candidate.code);
        const zone = text(candidate.zone);
        if (!id || !code || !zone || typeof candidate.maxLengthM !== "number"
          || typeof candidate.maxBeamM !== "number" || typeof candidate.maxDraftM !== "number") return [];
        return [{ berthId: id, code, zone, maxLengthM: candidate.maxLengthM, maxBeamM: candidate.maxBeamM, maxDraftM: candidate.maxDraftM }];
      })
      : [];
    return [{ bookingId, reference, status, arrivalDate, departureDate, berthOptions }];
  });
}
