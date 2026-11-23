import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

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
    await expect(page.getByText("Advanced payment management", { exact: true })).toHaveCount(0);
    for (const [summary, control] of [["Edit booking details", "Customer name"], ["Assign / reassign berth", "Suitable operational berth"], ["Extend stay / berth moves", "New departure date"], ["Review cancellation", "Booking status"]]) {
      await page.locator("summary").filter({ hasText: summary }).click();
      await expect(page.getByLabel(control, { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("summary").filter({ hasText: summary }).click();
    }
    await page.goto("/dashboard/bookings/da000000-0000-4000-8000-000000000001");
    await expect(page.getByRole("button", { name: "Confirm check-out" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm check-in" })).toHaveCount(0);
    await page.goto("/dashboard/bookings/da000000-0000-4000-8000-000000000004");
    await expect(page.locator(".booking-operational-form")).toHaveCount(0);
    await expect(page.locator("summary").filter({ hasText: "Review cancellation" })).toHaveCount(0);
    const cancellation = page.getByRole("region", { name: "Cancellation Summary" });
    await expect(page.getByRole("region", { name: "Payment", exact: true }).getByText("€0.00", { exact: true })).toBeVisible();
    await expect(cancellation.getByText("€80.56", { exact: true })).toBeVisible();
    await expect(cancellation.getByText("€80.56 (100%)", { exact: true })).toBeVisible();
    await expect(cancellation.locator("time")).toHaveText("18/01/2028, 15:05:00");
    await page.getByRole("link", { name: "Back to bookings" }).click();
    await expect(page).toHaveURL(/\/dashboard\/bookings$/);
    expect(errors).toEqual([]);
  });

  test("shows a legacy cancellation without inventing refund details", async ({ page }) => {
    test.skip(!process.env.BERTHIO_ISOLATED_TESTS, "Requires disposable local fixtures.");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) throw new Error("Booking fixtures require local Supabase.");
    const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { data: booking, error } = await db.from("bookings").insert({
      marina_id: "d1000000-0000-4000-8000-000000000001",
      status: "cancelled",
      arrival_date: "2032-04-15", departure_date: "2032-04-17", eta: "14:00", etd: "10:00",
      customer_name: "Legacy cancellation", customer_email: "legacy@example.test", customer_phone: "+37120000000",
      vessel_length_m: 8, vessel_beam_m: 2.5, vessel_draft_m: 1,
    }).select("id").single();
    if (error) throw error;

    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_MARINA_STAFF_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/dashboard/bookings/${booking.id}`);
    const summary = page.getByRole("region", { name: "Cancellation Summary" });
    await expect(summary.getByText("No cancellation decision was recorded for this booking.")).toBeVisible();
    await expect(summary.getByText("Recommended refund", { exact: true })).toHaveCount(0);
    await expect(summary.locator("time")).toHaveCount(0);
  });
});
