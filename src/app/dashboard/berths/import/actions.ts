"use server";

import { revalidatePath } from "next/cache";
import {
  BerthImportCsvError,
  buildBerthImportPreview,
  parseBerthImportPayload,
  serializeBerthImport,
} from "@/domain/berth-import/csv";
import {
  MAX_BERTH_IMPORT_BYTES,
  type BerthImportActionState,
} from "@/domain/berth-import/types";
import {
  BerthRepositoryError,
  importBerths,
  listBerthCodes,
} from "@/domain/berths/repository";
import { getAuthorizationContext } from "@/lib/auth/session";
import { captureServerError } from "@/lib/monitoring/server";
import { createClient } from "@/lib/supabase/server";

async function adminContext() {
  const context = await getAuthorizationContext();
  return context?.role === "marina_admin" ? context : null;
}

function safeError(error: unknown, operation: string): BerthImportActionState {
  if (error instanceof BerthImportCsvError) {
    return { status: "error", message: error.message };
  }
  captureServerError(error, { operation });
  return {
    status: "error",
    message: "The berth import could not be completed. No berths were added.",
  };
}

export async function previewBerthImportAction(
  _state: BerthImportActionState,
  formData: FormData,
): Promise<BerthImportActionState> {
  const context = await adminContext();
  if (!context) return { status: "error", message: "Marina admin access is required." };

  const file = formData.get("csvFile");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Choose a non-empty CSV file." };
  }
  if (file.size > MAX_BERTH_IMPORT_BYTES) {
    return { status: "error", message: "The CSV must be 512 KB or smaller." };
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return { status: "error", message: "Choose a file with a .csv extension." };
  }

  try {
    const supabase = await createClient();
    const existingCodes = await listBerthCodes(supabase, context.marinaId);
    const preview = buildBerthImportPreview(await file.text(), existingCodes);
    return {
      status: "preview",
      message: preview.errorCount > 0
        ? `${preview.errorCount} row${preview.errorCount === 1 ? " has" : "s have"} errors. Nothing can be imported until every row is valid.`
        : `${preview.validCount} berth${preview.validCount === 1 ? " is" : "s are"} ready for atomic import.`,
      preview,
      payload: preview.errorCount === 0 ? serializeBerthImport(preview.rows) : undefined,
    };
  } catch (error) {
    return safeError(error, "berth_import_preview");
  }
}

export async function applyBerthImportAction(
  _state: BerthImportActionState,
  formData: FormData,
): Promise<BerthImportActionState> {
  const context = await adminContext();
  if (!context) return { status: "error", message: "Marina admin access is required." };
  const payload = formData.get("payload");
  if (typeof payload !== "string") {
    return { status: "error", message: "The import preview is missing. Upload the CSV again." };
  }

  try {
    const berths = parseBerthImportPayload(payload);
    const supabase = await createClient();
    const existingCodes = await listBerthCodes(supabase, context.marinaId);
    const existing = new Set(existingCodes.map((code) => code.toLocaleUpperCase("en-US")));
    const seen = new Set<string>();
    for (const berth of berths) {
      const code = berth.code.toLocaleUpperCase("en-US");
      if (seen.has(code) || existing.has(code)) {
        throw new BerthImportCsvError(
          `Berth code ${berth.code} now conflicts with this marina's inventory. No berths were added; upload the CSV again.`,
        );
      }
      seen.add(code);
    }

    const importedCount = await importBerths(supabase, context.marinaId, berths);
    revalidatePath("/dashboard/berths");
    revalidatePath("/dashboard/marina-map");
    return {
      status: "success",
      message: `${importedCount} berth${importedCount === 1 ? " was" : "s were"} imported atomically. Existing berths were unchanged.`,
    };
  } catch (error) {
    if (error instanceof BerthRepositoryError && error.code === "23505") {
      return {
        status: "error",
        message: "A berth code changed or was added after preview. No berths were imported; upload the CSV again.",
      };
    }
    return safeError(error, "berth_import_apply");
  }
}
