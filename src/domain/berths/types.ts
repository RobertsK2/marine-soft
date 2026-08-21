import type { Database } from "@/types/database";

export const BERTH_STATUSES = [
  "available",
  "blocked",
  "out_of_service",
] as const;

export type BerthStatus = (typeof BERTH_STATUSES)[number];
export type Berth = Database["public"]["Tables"]["berths"]["Row"];

export type BerthInput = {
  code: string;
  zone: string;
  maxLengthM: number;
  maxBeamM: number;
  maxDraftM: number;
  priority: number;
  status: BerthStatus;
  allowSmallerVessels: boolean;
};

export type BerthField =
  | "code"
  | "zone"
  | "maxLengthM"
  | "maxBeamM"
  | "maxDraftM"
  | "priority"
  | "status";

export type BerthFieldErrors = Partial<Record<BerthField, string>>;
