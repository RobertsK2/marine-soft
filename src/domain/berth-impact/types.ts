export type BerthImpactAlternative = {
  berthId: string;
  code: string;
  zone: string;
  maxLengthM: number;
  maxBeamM: number;
  maxDraftM: number;
};

export type BerthImpactBooking = {
  bookingId: string;
  reference: string;
  status: "confirmed" | "checked_in";
  arrivalDate: string;
  departureDate: string;
  berthOptions: BerthImpactAlternative[];
};

export type BerthImpactPreview = {
  berthCode: string;
  requestedStatus: "available" | "blocked" | "out_of_service";
  affectedCount: number;
  unresolvedCount: number;
  affectedBookings: BerthImpactBooking[];
};
