import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test.describe("CSV berth import", () => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  test.setTimeout(90000);
  async function signIn(page: import("@playwright/test").Page, email: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
    const client = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard/berths/import`);
    await completeAdminMfa(page);
  }
  test("shows blocked and ready previews without partial import", async ({ page }, testInfo) => {
    await signIn(page, "admin-a@berthio.test");
    await expect(page.getByRole("heading", { name: "Import Berths", exact: true })).toBeVisible();
    await expect(page.getByRole("list", { name: "CSV import progress" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("link", { name: "Download Sample CSV Template" })).toHaveAttribute("href", "/berth-import-template.csv");
    const header = "berth_code,zone,max_length_m,max_beam_m,max_draft_m,status,priority,allow_smaller_vessels";
    const file = page.getByLabel("Berth inventory CSV");
    await file.setInputFiles({ name: "blocked-berths.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}\nDUP-TEST,North,-1,4,2,reserved,10,true\nDUP-TEST,South,12,4,2,available,11,true`) });
    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(page.getByText("blocked-berths.csv", { exact: true }).first()).toBeVisible();
    const preview = page.getByRole("region", { name: "CSV berth preview table" });
    await expect(preview.getByRole("columnheader")).toHaveText(["Row", "Berth Code", "Zone / Pier", "Dimensions", "Initial Status", "Priority", "Allow Smaller Vessels", "Validation State"]);
    await expect(page.getByLabel("Import preview summary")).toContainText("Total Rows2Valid Rows0Blocked Rows2");
    await expect(page.getByText(/duplicated in CSV rows 2, 3/).first()).toBeVisible();
    await expect(page.getByText(/Maximum length must be/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 2 Berths" })).toBeDisabled();
    await expect(page.getByText("Partial import is unavailable.")).toBeVisible();
    await expect(page.getByText("Skip invalid rows")).toHaveCount(0);
    await file.setInputFiles({ name: "ready-berths.csv", mimeType: "text/csv", buffer: Buffer.from(`${header}\nREADY-ONE,North,12.5,4.2,2.1,available,310,true\nREADY-TWO,South,14,4.8,2.4,out_of_service,311,false`) });
    await page.getByRole("button", { name: "Preview import" }).click();
    await expect(page.getByText("ready-berths.csv", { exact: true }).first()).toBeVisible();
    await expect(page.getByLabel("Import preview summary")).toContainText("Total Rows2Valid Rows2Blocked Rows0");
    await expect(page.getByRole("button", { name: "Import 2 Berths" })).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("berth-import-ready.png"), fullPage: true });
    await page.getByRole("link", { name: "Back to Berths", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/berths$/);
  });
  test("staff cannot open the import flow", async ({ page }) => {
    await signIn(page, "staff-a@berthio.test");
    await expect(page.locator("body")).toContainText("404");
  });
});
