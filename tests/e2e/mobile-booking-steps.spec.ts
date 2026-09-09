import { expect, test } from "@playwright/test";

test("mobile search stays inline when unavailable, then opens compact review and preserves edits", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile" || !process.env.E2E_SUPABASE_READY, "Mobile with local Supabase fixtures required.");
  await page.goto("/marina/marina-a");
  const searchHeading = page.getByRole("heading", { name: "Search Availability", exact: true });
  const reviewHeading = page.getByRole("heading", { name: "Review & Pay", exact: true });
  const check = page.getByRole("button", { name: "Check Availability", exact: true });
  const pay = page.getByRole("button", { name: "Continue to Payment", exact: true });
  await expect(searchHeading).toBeVisible();
  await expect(page.locator('form input:visible')).toHaveCount(6);
  await expect(page.getByLabel("ETA", { exact: false })).toBeHidden();
  await expect(pay).toHaveCount(0);
  await page.getByLabel("Arrival date", { exact: true }).fill("2026-12-14");
  await page.getByLabel("Departure date", { exact: true }).fill("2026-12-17");
  await page.getByLabel("Vessel name").fill("Mobile Aurora");
  await page.getByLabel("Length Overall (LOA)").fill("99");
  await page.getByLabel("Beam (Width)").fill("3.1");
  await page.getByLabel("Draft (Depth)").fill("1.7");
  await check.click();
  await expect(page.locator('[data-availability="no_suitable_berth"]')).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/marina/marina-a");
  await expect(searchHeading).toBeVisible();
  await expect(reviewHeading).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Vessel name")).toHaveValue("Mobile Aurora");

  await page.getByLabel("Length Overall (LOA)").fill("9.5");
  // Hold the search response to verify the availability submission state.
  let deliver!: () => void;
  const delivery = new Promise<void>((resolve) => { deliver = resolve; });
  await page.route("**/marina/marina-a?**", async (route) => { await delivery; await route.continue(); });
  try {
    await check.click();
    await expect(page.getByRole("button", { name: "Checking availability…" })).toBeDisabled();
  } finally { deliver(); }
  await expect(reviewHeading).toBeVisible();
  await expect(reviewHeading).toBeFocused();
  await expect(page.getByRole("region", { name: "Dates and vessel" })).toBeHidden();
  await expect(check).toBeHidden();
  await expect(page.locator('form input:visible')).toHaveCount(0);
  const review = page.locator('[data-availability="available"]');
  await expect(review).toContainText("Mobile Aurora");
  await expect(review).toContainText("2026-12-14");
  await expect(review).toContainText("2026-12-17");
  await expect(review).toContainText("9.50 m LOA");
  await expect(review).toContainText("Suitable berth capacity");
  await expect(review).toContainText("Mandatory fees");
  await expect(review).toContainText("Tax / VAT 21%");
  await expect(review).toContainText("Total");
  await expect(review).toContainText("Estimated arrival 14:00, departure 10:00");
  await expect(pay).toBeInViewport();
  await expect(page.locator('[data-hold-token]')).toHaveCount(0);
  const attempt = await page.locator('[name="holdIdempotencyKey"]').inputValue();
  await page.screenshot({ path: testInfo.outputPath("mobile-review.png"), fullPage: true });

  await page.getByRole("button", { name: "Back / Edit Search" }).click();
  await expect(searchHeading).toBeFocused();
  await expect(pay).toBeHidden();
  await expect(page.getByLabel("Arrival date", { exact: true })).toHaveValue("2026-12-14");
  await expect(page.getByLabel("Departure date", { exact: true })).toHaveValue("2026-12-17");
  await expect(page.getByLabel("Vessel name")).toHaveValue("Mobile Aurora");
  await expect(page.getByLabel("Length Overall (LOA)")).toHaveValue("9.5");
  await expect(page.getByLabel("Beam (Width)")).toHaveValue("3.1");
  await expect(page.getByLabel("Draft (Depth)")).toHaveValue("1.7");
  expect(await page.locator('[name="holdIdempotencyKey"]').inputValue()).toBe(attempt);
  await page.getByLabel("Vessel name").fill("Edited Aurora");
  await check.click();
  await expect(reviewHeading).toBeFocused();
  await expect(review).toContainText("Edited Aurora");
  await expect(pay).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
