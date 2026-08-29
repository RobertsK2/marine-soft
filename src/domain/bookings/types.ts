import type { Database } from "@/types/database";

export const BOOKING_STATUSES = [
  "confirmed",
  "cancelled",
  "checked_in",
  "checked_out",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type Booking = Database["public"]["Tables"]["bookings"]["Row"];
export type BookingPriceAdjustment = Database["public"]["Tables"]["booking_price_adjustments"]["Row"];

export type BookingInput = {
  arrivalDate: string;
  departureDate: string;
  eta: string;
  etd: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  vesselName: string | null;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
};

export type BookingField =
  | "arrivalDate"
  | "departureDate"
  | "eta"
  | "etd"
  | "customerName"
  | "customerEmail"
  | "customerPhone"
  | "vesselName"
  | "vesselLengthM"
  | "vesselBeamM"
  | "vesselDraftM";

export type BookingFieldErrors = Partial<Record<BookingField, string>>;
