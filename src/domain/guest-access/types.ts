import type { Database } from "@/types/database";

export type GuestBooking = {
  reference: string;
  marinaName: string;
  arrivalDate: string;
  departureDate: string;
  eta: string;
  etd: string;
  vesselName: string | null;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
  priceTotalMinor: number;
  priceCurrency: string;
  status: Database["public"]["Enums"]["booking_status"];
  accessExpiresAt: string;
};

export type GuestTimeActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: { eta?: string; etd?: string };
};
