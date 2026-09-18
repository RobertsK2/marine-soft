import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.describe("booking detail workspace", () => {
  test.use({ baseURL: "http://localhost:3000" });
  test.skip(!process.env.E2E_SUPABASE_READY || !process.env.E2E_MARINA_EMAIL || (!process.env.E2E_MARINA_PASSWORD && !process.env.SUPABASE_SECRET_KEY), "Requires local marina fixtures.");
  test("preserves contextual actions and existing management forms", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (!process.env.E2E_MARINA_PASSWORD) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Test sign-in links require local Supabase.");
      const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email: process.env.E2E_MARINA_EMAIL! });
      if (error) throw new Error("Unable to generate local test sign-in link.");
      await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(data.properties.hashed_token)}&next=/dashboard`);
    } else {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_MARINA_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    }
    await completeAdminMfa(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto("/dashboard/bookings/da000000-0000-4000-8000-000000000002");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("BK-PILOT00002");
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toBeVisible();
    await expect(page.locator(".button-primary:visible")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "History / Activity" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Berth summary" })).toContainText("B-02");
    await expect(page.getByText("Send Message to Skipper", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("booking-detail.png"), fullPage: true });
    for (const [summary, control] of [["Edit booking details", "Customer name"], ["Assign / reassign berth", "Suitable operational berth"], ["Extend stay / berth moves", "New departure date"], ["Manage payment / staff note", "Payment state"], ["Review cancellation", "Booking status"]]) {
      await page.locator("summary").filter({ hasText: summary }).click();
      await expect(control === "Payment state" ? page.getByRole("combobox", { name: control, exact: true }) : page.getByLabel(control, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("summary").filter({ hasText: summary }).click();
    }
    await page.goto("/dashboard/bookings/da000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("button", { name: "Confirm check-out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toHaveCount(0);
    await page.goto("/dashboard/bookings/da000000-0000-4000-8000-000000000004");
    await expect(page.locator(".booking-operational-form")).toHaveCount(0);
    await expect(page.locator("summary").filter({ hasText: "Review cancellation" })).toHaveCount(0);
    await page.getByRole("link", { name: "Back to bookings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings$/);
    expect(errors).toEqual([]);
  });
});
