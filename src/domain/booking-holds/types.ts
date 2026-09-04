export type BookingHoldActionState = {
  status: "idle" | "held" | "unavailable" | "error";
  message?: string;
  expiresAt?: string;
  holdToken?: string;
  totalMinor?: number;
  currency?: string;
};

export type BookingHoldResult = {
  outcome: "created" | "existing" | "unavailable" | "rate_limited" | "idempotency_conflict" | "closed" | "not_found";
  holdToken: string | null;
  expiresAt: string | null;
  totalMinor: number | null;
  currency: string | null;
};
