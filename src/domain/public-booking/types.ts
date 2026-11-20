export const BOOKING_SEARCH_FIELDS = [
  "arrivalDate",
  "departureDate",
  "etaWindow",
  "vesselLengthM",
  "vesselBeamM",
  "vesselDraftM",
  "vesselName",
] as const;

export type BookingSearchField = (typeof BOOKING_SEARCH_FIELDS)[number];

export type BookingSearchFieldErrors = Partial<Record<BookingSearchField, string>>;

export const ETA_WINDOWS = ["unsure", "morning", "afternoon", "evening"] as const;
export type EtaWindow = Exclude<(typeof ETA_WINDOWS)[number], "unsure">;

export function arrivalWindowLabel(window: EtaWindow | null) {
  if (!window) return "Not specified";
  return {
    morning: "Morning (06:00–12:00)",
    afternoon: "Afternoon (12:00–18:00)",
    evening: "Evening (18:00–24:00)",
  }[window];
}

export type PublicBookingSearch = {
  arrivalDate: string;
  departureDate: string;
  eta: string | null;
  etd: string | null;
  etaWindow?: EtaWindow | null;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
  vesselName: string | null;
  marinaTimezone: string;
  stayNights: number;
};

export type BookingSearchValidation =
  | { success: true; data: PublicBookingSearch }
  | {
      success: false;
      errors: BookingSearchFieldErrors;
      formError?: string;
    };
