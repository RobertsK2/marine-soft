export type ExtensionBerthOption = {
  berthId: string;
  code: string;
  zone: string;
  maxLengthM: number;
  maxBeamM: number;
  maxDraftM: number;
};

export type BookingExtensionPreview = {
  expectedUpdatedAt: string;
  originalDeparture: string;
  requestedDeparture: string;
  addedNights: number;
  currentBerthCode: string | null;
  moveRequired: boolean;
  berthOptions: ExtensionBerthOption[];
  currency: string | null;
  previousTotalMinor: number | null;
  revisedTotalMinor: number | null;
  differenceFromPaidMinor: number | null;
};

