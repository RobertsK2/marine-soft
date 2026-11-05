export type CheckoutActionState = { status: "idle" | "error"; message?: string; requiresAvailabilityCheck?: boolean; fieldErrors?: Partial<Record<"customerName" | "customerEmail" | "customerPhone", string>> };
export type CheckoutReturnStatus = {
  status: "paid" | "processing" | "failed";
  amountTotalMinor: number;
  currency: string;
  paidAt: string | null;
  confirmation: null | {
    reference: string;
    marinaName: string;
    arrivalDate: string;
    departureDate: string;
    eta: string | null;
    etd: string | null;
    etaWindow: "morning" | "afternoon" | "evening" | null;
    vesselName: string | null;
    vesselLengthM: number;
    vesselBeamM: number;
    vesselDraftM: number;
    status: "confirmed" | "cancelled" | "checked_in" | "checked_out";
  };
};
