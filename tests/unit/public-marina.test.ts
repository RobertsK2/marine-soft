import { describe, expect, it } from "vitest";
import { marinaInitials, safeBrandColor, timezoneLabel } from "@/domain/public-marinas/model";

describe("Phase 1 public marina model", () => {
  it("keeps valid basic branding and rejects unsafe color values", () => {
    expect(safeBrandColor("#0A4D68")).toBe("#0A4D68");
    expect(safeBrandColor("red; background: url(example)")).toBe("#0A192F");
  });

  it("builds a compact logo fallback from the real marina name", () => {
    expect(marinaInitials("Riga City Yacht Club")).toBe("RC");
    expect(marinaInitials("  Ventspils  ")).toBe("V");
  });

  it("formats valid IANA timezone context and safely handles invalid input", () => {
    expect(timezoneLabel("Europe/Riga")).toMatch(/Eastern European|Riga|GMT/i);
    expect(timezoneLabel("Not/A_Zone")).toBe("Not/A_Zone");
  });
});
