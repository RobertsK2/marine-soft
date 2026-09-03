import { validateBerthInput } from "@/domain/berths/validation";
import {
  MAX_BERTH_IMPORT_ROWS,
  type BerthImportPreview,
  type BerthImportRow,
} from "@/domain/berth-import/types";
import type { BerthInput } from "@/domain/berths/types";

const REQUIRED_HEADERS = [
  "zone",
  "max_length_m",
  "max_beam_m",
  "max_draft_m",
  "status",
] as const;
const OPTIONAL_HEADERS = ["priority", "allow_smaller_vessels"] as const;
const IDENTITY_HEADERS = ["berth_code", "berth_name"] as const;

type ParsedCsv = { rows: string[][]; rowNumbers: number[] };

export class BerthImportCsvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BerthImportCsvError";
  }
}

function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  const rowNumbers: number[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let justClosedQuote = false;
  let physicalRow = 1;
  let recordStart = 1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        justClosedQuote = true;
      } else {
        field += character;
        if (character === "\n") physicalRow += 1;
      }
      continue;
    }

    if (justClosedQuote && character !== "," && character !== "\r" && character !== "\n") {
      throw new BerthImportCsvError(`CSV row ${recordStart} has characters after a closing quote.`);
    }
    if (character === '"') {
      if (field.length > 0) {
        throw new BerthImportCsvError(`CSV row ${recordStart} has an unexpected quote.`);
      }
      quoted = true;
      justClosedQuote = false;
    } else if (character === ",") {
      row.push(field);
      field = "";
      justClosedQuote = false;
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
        rowNumbers.push(recordStart);
      }
      row = [];
      field = "";
      justClosedQuote = false;
      physicalRow += 1;
      recordStart = physicalRow;
    } else {
      field += character;
    }
  }

  if (quoted) throw new BerthImportCsvError(`CSV row ${recordStart} has an unclosed quote.`);
  row.push(field);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
    rowNumbers.push(recordStart);
  }
  return { rows, rowNumbers };
}

function normalizedHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase();
}

function booleanValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "" || ["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return null;
}

function errorMessages(errors: Record<string, string | undefined>) {
  return Object.values(errors).filter((message): message is string => Boolean(message));
}

function duplicateErrors(rows: BerthImportRow[], existingCodes: ReadonlySet<string>) {
  const occurrences = new Map<string, number[]>();
  for (const row of rows) {
    const code = row.rawCode.trim().toLocaleUpperCase("en-US");
    if (!code) continue;
    occurrences.set(code, [...(occurrences.get(code) ?? []), row.rowNumber]);
  }

  for (const row of rows) {
    const code = row.rawCode.trim().toLocaleUpperCase("en-US");
    if (!code) continue;
    const duplicates = occurrences.get(code) ?? [];
    if (duplicates.length > 1) {
      row.errors.push(`Berth code ${code} is duplicated in CSV rows ${duplicates.join(", ")}.`);
    }
    if (existingCodes.has(code)) {
      row.errors.push(`Berth code ${code} already exists in this marina.`);
    }
  }
}

export function buildBerthImportPreview(
  csvText: string,
  existingBerthCodes: readonly string[],
): BerthImportPreview {
  if (csvText.includes("\0")) throw new BerthImportCsvError("The CSV contains unsupported binary data.");
  const parsed = parseCsv(csvText);
  if (parsed.rows.length < 2) {
    throw new BerthImportCsvError("The CSV must contain a header and at least one berth row.");
  }

  const headers = parsed.rows[0].map(normalizedHeader);
  if (new Set(headers).size !== headers.length) {
    throw new BerthImportCsvError("CSV header names must not be repeated.");
  }
  const identityHeaders = IDENTITY_HEADERS.filter((header) => headers.includes(header));
  if (identityHeaders.length !== 1) {
    throw new BerthImportCsvError("Use exactly one berth identity header: berth_code or berth_name.");
  }
  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new BerthImportCsvError(`Missing required CSV header${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`);
  }
  const allowed = new Set<string>([...IDENTITY_HEADERS, ...REQUIRED_HEADERS, ...OPTIONAL_HEADERS]);
  const unknown = headers.filter((header) => !allowed.has(header));
  if (unknown.length > 0) {
    throw new BerthImportCsvError(`Unsupported CSV header${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
  }

  const dataRows = parsed.rows.slice(1);
  if (dataRows.length > MAX_BERTH_IMPORT_ROWS) {
    throw new BerthImportCsvError(`A single import can contain at most ${MAX_BERTH_IMPORT_ROWS} berths.`);
  }
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const value = (cells: string[], header: string) => cells[headerIndex.get(header) ?? -1] ?? "";
  const identityHeader = identityHeaders[0];

  const rows: BerthImportRow[] = dataRows.map((cells, index) => {
    const rowNumber = parsed.rowNumbers[index + 1];
    const rawCode = value(cells, identityHeader);
    const rawZone = value(cells, "zone");
    const errors: string[] = [];
    if (cells.length !== headers.length) {
      errors.push(`Expected ${headers.length} columns but found ${cells.length}.`);
    }
    const allowSmaller = booleanValue(value(cells, "allow_smaller_vessels"));
    if (allowSmaller === null) {
      errors.push("Allow smaller vessels must be true/false, yes/no, or 1/0.");
    }
    const validation = validateBerthInput({
      code: rawCode,
      zone: rawZone,
      maxLengthM: value(cells, "max_length_m"),
      maxBeamM: value(cells, "max_beam_m"),
      maxDraftM: value(cells, "max_draft_m"),
      priority: value(cells, "priority") || "100",
      status: value(cells, "status").trim().toLowerCase(),
      allowSmallerVessels: allowSmaller ?? false,
    });
    if (!validation.success) errors.push(...errorMessages(validation.errors));
    return { rowNumber, rawCode, rawZone, berth: validation.success ? validation.data : null, errors };
  });

  duplicateErrors(
    rows,
    new Set(existingBerthCodes.map((code) => code.toLocaleUpperCase("en-US"))),
  );
  const errorCount = rows.filter((row) => row.errors.length > 0).length;
  return { rows, validCount: rows.length - errorCount, errorCount };
}

export function parseBerthImportPayload(payload: string): BerthInput[] {
  let values: unknown;
  try {
    values = JSON.parse(payload);
  } catch {
    throw new BerthImportCsvError("The import preview is invalid. Upload the CSV again.");
  }
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_BERTH_IMPORT_ROWS) {
    throw new BerthImportCsvError("The import preview is invalid. Upload the CSV again.");
  }
  return values.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BerthImportCsvError("The import preview is invalid. Upload the CSV again.");
    }
    const record = value as Record<string, unknown>;
    const allowedKeys = new Set([
      "code", "zone", "maxLengthM", "maxBeamM", "maxDraftM",
      "priority", "status", "allowSmallerVessels",
    ]);
    if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
      throw new BerthImportCsvError("The import preview is invalid. Upload the CSV again.");
    }
    const validation = validateBerthInput({
      code: record.code,
      zone: record.zone,
      maxLengthM: String(record.maxLengthM ?? ""),
      maxBeamM: String(record.maxBeamM ?? ""),
      maxDraftM: String(record.maxDraftM ?? ""),
      priority: String(record.priority ?? ""),
      status: record.status,
      allowSmallerVessels: record.allowSmallerVessels,
    });
    if (!validation.success) {
      throw new BerthImportCsvError("The import preview is invalid. Upload the CSV again.");
    }
    return validation.data;
  });
}

export function serializeBerthImport(rows: BerthImportRow[]) {
  return JSON.stringify(rows.map((row) => row.berth as BerthInput));
}
