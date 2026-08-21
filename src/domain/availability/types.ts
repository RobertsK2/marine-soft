import type { BerthStatus } from "@/domain/berths/types";
import type { BookingStatus } from "@/domain/bookings/types";

export type AvailabilityRequest = {
  marinaId: string;
  arrivalDate: string;
  departureDate: string;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
};

export type AvailabilityBerth = {
  id: string;
  marinaId: string;
  code: string;
  priority: number;
  status: BerthStatus;
  allowSmallerVessels: boolean;
  maxLengthM: number;
  maxBeamM: number;
  maxDraftM: number;
};

export type AvailabilityBooking = {
  id: string;
  marinaId: string;
  arrivalDate: string;
  departureDate: string;
  status: BookingStatus;
  vesselLengthM: number;
  vesselBeamM: number;
  vesselDraftM: number;
};

export type AvailabilityAssignment = {
  bookingId: string;
  berthId: string;
};

export type AvailabilityResult = {
  available: boolean;
  assignments: AvailabilityAssignment[];
  requestedBerthId: string | null;
};
