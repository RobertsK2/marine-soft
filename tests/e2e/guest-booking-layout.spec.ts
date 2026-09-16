import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000" });
test("public booking search, fit errors, one payment CTA and stale-result protection", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  await page.goto("/marina/marina-a");
  await expect(page.getByRole("heading", { name: "Book your stay at Marina A" })).toBeVisible();
  await expect(page.getByLabel("Booking information")).toContainText("Check suitable capacity before booking");
  await expect(page.getByLabel("Booking information")).not.toContainText("Capacity reserved");
  await expect(page.getByRole("navigation", { name: "Marina administration" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check Availability", exact: true }).click();
  await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
  await page.getByLabel("Arrival date", { exact: true }).fill("2026-12-14");
  await page.getByLabel("Departure date", { exact: true }).fill("2026-12-17");
  if (testInfo.project.name === "chromium") {
    await page.getByLabel("ETA", { exact: false }).fill("14:30");
    await page.getByLabel("ETD", { exact: false }).fill("10:00");
  }
  await page.getByLabel("Vessel name").fill("Layout Aurora");
  await page.getByLabel("Length Overall (LOA)").fill("9.5");
  await page.getByLabel("Beam (Width)").fill("3.1");
  await page.getByLabel("Draft (Depth)").fill("1.7");
  await page.getByRole("button", { name: "Check Availability", exact: true }).click();
  await expect(page.locator('[data-availability="available"]')).toBeVisible();
  await expect(page.locator('[data-availability="available"]')).toContainText("No booking has been created.");
  await expect(page.getByRole("heading", { name: "Suitable berth capacity" })).toBeVisible();
  await expect(page.locator('[data-price-total-minor]')).toBeVisible();
  await expect(page.locator('[data-berth-id]')).toHaveCount(0);
  const cta = page.getByRole("button", { name: "Continue to Payment", exact: true });
  await expect(cta).toBeVisible();
  const bounds = await cta.boundingBox();
  if (testInfo.project.name === "chromium") {
    expect(bounds!.width).toBeGreaterThanOrEqual(220);
    expect(bounds!.width).toBeLessThanOrEqual(280);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeLessThanOrEqual(48);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("guest-booking.png"), fullPage: true });
  await expect(page.locator('[data-hold-token]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /hold|reserve|pay.*stripe/i })).toHaveCount(0);
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Back / Edit Search" }).click();
  await page.getByLabel("Length Overall (LOA)").fill("99");
  await expect(cta).toBeHidden();
  await expect(page.getByText("Details changed. Please check availability again.")).toBeVisible();
  await page.getByRole("button", { name: "Check Availability", exact: true }).click();
  await expect(page.locator('[data-availability="no_suitable_berth"]')).toBeVisible();
  await expect(page.locator('[data-price-total-minor]')).toHaveCount(0);
  await expect(cta).toHaveCount(0);
});
