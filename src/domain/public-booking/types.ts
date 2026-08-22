export const BOOKING_SEARCH_FIELDS = [
  "arrivalDate",
  "departureDate",
  "eta",
  "etd",
  "vesselLengthM",
  "vesselBeamM",
  "vesselDraftM",
  "vesselName",
] as const;

export type BookingSearchField = (typeof BOOKING_SEARCH_FIELDS)[number];

export type BookingSearchFieldErrors = Partial<Record<BookingSearchField, string>>;

export type PublicBookingSearch = {
  arrivalDate: string;
  departureDate: string;
  eta: string;
  etd: string;
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
