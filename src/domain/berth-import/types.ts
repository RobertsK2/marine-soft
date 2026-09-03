import type { BerthInput } from "@/domain/berths/types";

export const MAX_BERTH_IMPORT_BYTES = 512 * 1024;
export const MAX_BERTH_IMPORT_ROWS = 500;

export type BerthImportRow = {
  rowNumber: number;
  rawCode: string;
  rawZone: string;
  berth: BerthInput | null;
  errors: string[];
};

export type BerthImportPreview = {
  rows: BerthImportRow[];
  validCount: number;
  errorCount: number;
};

export type BerthImportActionState = {
  status: "idle" | "preview" | "success" | "error";
  message?: string;
  preview?: BerthImportPreview;
  payload?: string;
};
