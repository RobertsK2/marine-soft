import { describe, expect, it } from "vitest";
import {
  BerthImportCsvError,
  buildBerthImportPreview,
  parseBerthImportPayload,
  serializeBerthImport,
} from "@/domain/berth-import/csv";

const header = "berth_code,zone,max_length_m,max_beam_m,max_draft_m,status,priority,allow_smaller_vessels";

describe("berth CSV import", () => {
  it("normalizes a quoted valid preview and serializes the exact intended writes", () => {
    const preview = buildBerthImportPreview(
      `\uFEFF${header}\r\n\" a-21 \",\"North, Pier\",12.5,4.2,2.1,AVAILABLE,25,no\r\nB-02,South,9,3,1.5,blocked,,`,
      [],
    );

    expect(preview).toMatchObject({ validCount: 2, errorCount: 0 });
    expect(preview.rows[0]).toMatchObject({
      rowNumber: 2,
      berth: { code: "A-21", zone: "North, Pier", priority: 25, allowSmallerVessels: false },
      errors: [],
    });
    expect(parseBerthImportPayload(serializeBerthImport(preview.rows))).toEqual(
      preview.rows.map((row) => row.berth),
    );
  });

  it("accepts berth_name as the sole identity alias", () => {
    const preview = buildBerthImportPreview(
      "berth_name,zone,max_length_m,max_beam_m,max_draft_m,status\nVisitor 1,East,10,3,2,available",
      [],
    );
    expect(preview.rows[0].berth?.code).toBe("VISITOR 1");
  });

  it("reports dimensions, status, boolean, and column errors on their CSV row", () => {
    const preview = buildBerthImportPreview(
      `${header}\nA-01,North,-1,wide,0,reserved,1,maybe,unexpected`,
      [],
    );
    expect(preview).toMatchObject({ validCount: 0, errorCount: 1 });
    expect(preview.rows[0].rowNumber).toBe(2);
    expect(preview.rows[0].errors.join(" ")).toMatch(/Expected 8 columns/);
    expect(preview.rows[0].errors.join(" ")).toMatch(/Maximum length/);
    expect(preview.rows[0].errors.join(" ")).toMatch(/Maximum beam/);
    expect(preview.rows[0].errors.join(" ")).toMatch(/Maximum draft/);
    expect(preview.rows[0].errors.join(" ")).toMatch(/operational status/);
    expect(preview.rows[0].errors.join(" ")).toMatch(/Allow smaller vessels/);
  });

  it("marks every in-file duplicate and case-insensitive existing-marina conflict", () => {
    const preview = buildBerthImportPreview(
      `${header}\na-01,North,10,3,2,available,1,true\nA-01,South,11,3,2,available,2,true\nB-01,West,12,4,2,available,3,true`,
      ["b-01"],
    );
    expect(preview).toMatchObject({ validCount: 0, errorCount: 3 });
    expect(preview.rows[0].errors[0]).toContain("rows 2, 3");
    expect(preview.rows[1].errors[0]).toContain("rows 2, 3");
    expect(preview.rows[2].errors[0]).toContain("already exists in this marina");
  });

  it.each([
    [`${header},marina_id\nA-1,North,10,3,2,available,1,true,other`, /Unsupported CSV header: marina_id/],
    ["berth_code,berth_name,zone,max_length_m,max_beam_m,max_draft_m,status\nA,A,North,10,3,2,available", /exactly one berth identity/],
    ["berth_code,zone,max_length_m,max_beam_m,status\nA,North,10,3,available", /Missing required CSV header: max_draft_m/],
    [`${header}\n\"A-1,North,10,3,2,available,1,true`, /unclosed quote/],
  ])("rejects unsafe or malformed CSV structure", (csv, expected) => {
    expect(() => buildBerthImportPreview(csv, [])).toThrow(expected);
  });

  it("rejects tampered preview payloads instead of trusting browser state", () => {
    expect(() => parseBerthImportPayload(JSON.stringify([{
      code: "A-1", zone: "North", maxLengthM: 10, maxBeamM: 3,
      maxDraftM: 2, priority: 1, status: "available", allowSmallerVessels: true,
      marinaId: "other-tenant",
    }]))).toThrow(BerthImportCsvError);
    expect(() => parseBerthImportPayload("not-json")).toThrow(BerthImportCsvError);
  });
});
