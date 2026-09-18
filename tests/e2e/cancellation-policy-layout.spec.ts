import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test("policy preview boundaries, coverage validation, saves and layout", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const link = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-a@berthio.test" });
  if (link.error) throw new Error("Local sign-in failed.");
  await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(link.data.properties.hashed_token)}&next=/dashboard/settings/cancellation-policy`);
  await completeAdminMfa(page);
  await expect(page.getByRole("heading", { name: "Cancellation Policy", exact: true })).toBeVisible();
  const form = page.locator("form.pricing-config-form");
  await expect(form).toHaveAttribute("data-hydrated", "true");
  const payload = page.locator('input[name="policy"]');
  const original = JSON.parse(await payload.inputValue());
  await expect(page.getByText("Complete coverage · No gaps or overlaps")).toBeVisible();
  const arrival = page.getByLabel("Arrival date", { exact: true });
  const cancellation = page.getByLabel("Cancellation date", { exact: true });
  await arrival.fill("2026-10-15");
  await expect(arrival).toHaveValue("2026-10-15");
  for (const days of [-1, 0, 1, 2, 6, 7, 30]) {
    const date = new Date(Date.UTC(2026, 9, 15 - days)).toISOString().slice(0, 10);
    await cancellation.fill(date);
    await expect(cancellation).toHaveValue(date);
    const tier = original.tiers.find((item: { minDaysBeforeArrival: number | null; maxDaysBeforeArrival: number | null }) => (item.minDaysBeforeArrival === null || days >= item.minDaysBeforeArrival) && (item.maxDaysBeforeArrival === null || days <= item.maxDaysBeforeArrival));
    await expect(page.locator('[aria-labelledby="cancellation-preview-heading"] strong')).toHaveText(`${tier.refundPercent}%`);
  }
  await page.getByRole("button", { name: "Edit cancellation tier 1", exact: true }).click();
  const maximum = page.getByLabel("Maximum days", { exact: true }).first();
  await maximum.fill(String(original.tiers[0].maxDaysBeforeArrival + 1));
  await expect(page.getByText("Tiers must be ordered from lowest to highest and cover every day without gaps or overlaps.")).toBeVisible();
  await expect(page.locator('[aria-labelledby="cancellation-preview-heading"] strong')).toHaveText("—");
  await maximum.fill(String(original.tiers[0].maxDaysBeforeArrival));
  await page.getByRole("button", { name: "Edit cancellation tier 1", exact: true }).click();
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/Cancellation policy (updated|is already up to date)/);
    await expect(page.getByRole("button", { name: "Save Changes", exact: true })).toBeEnabled();
  }
  await page.reload();
  await expect(page.getByRole("heading", { name: "Cancellation Policy", exact: true })).toBeVisible();
  expect(JSON.parse(await payload.inputValue())).toEqual(original);
  await page.getByLabel("Arrival date", { exact: true }).fill("2026-10-15");
  await page.getByLabel("Cancellation date", { exact: true }).fill("2026-10-11");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("cancellation-policy.png"), fullPage: true });
});
