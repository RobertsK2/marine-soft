import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });

test("pricing rows, percentage conversion, save version and responsive layout", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-a@berthio.test" });
  if (result.error) throw new Error("Local test sign-in failed.");
  await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard/settings/pricing`);
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await expect(page.locator(".pricing-config-form h2")).toHaveText(["Base Pricing", "Seasonal Pricing", "Mandatory Fees", "VAT & Tax"]);
  const payload = page.locator('input[name="configuration"]');
  const original = JSON.parse(await payload.inputValue());
  await page.getByRole("button", { name: "Add season", exact: true }).click();
  const season = page.locator('[aria-labelledby="pricing-seasons-heading"] details').last();
  await season.getByLabel("Name", { exact: true }).fill("Test season");
  await expect(season.getByLabel("Starts on")).toBeVisible();
  await season.getByRole("button", { name: "Remove season", exact: true }).click();
  await page.getByRole("button", { name: "Add Fee", exact: true }).click();
  const fee = page.locator('[aria-labelledby="pricing-fees-heading"] details').last();
  await fee.getByLabel("Fee name").fill("Test fee");
  await expect(fee.getByLabel("Fee type")).toBeVisible();
  await fee.getByRole("button", { name: /Remove mandatory fee/ }).click();
  expect(JSON.parse(await payload.inputValue())).toEqual(original);
  const rate = page.getByLabel("VAT percentage (%)");
  await rate.fill("21.25");
  expect(JSON.parse(await payload.inputValue()).taxRateBps).toBe(2125);
  await rate.fill(String(original.taxRateBps / 100));
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Pricing configuration updated");
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeEnabled();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pricing", exact: true })).toBeVisible();
  await expect(rate).toBeVisible();
  await expect(rate).toHaveValue(String(original.taxRateBps / 100));
  expect(JSON.parse(await payload.inputValue())).toEqual(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("pricing-settings.png"), fullPage: true });
});
