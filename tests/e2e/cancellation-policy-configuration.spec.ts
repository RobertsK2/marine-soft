import { expect, test } from "@playwright/test";

const password = process.env.E2E_MARINA_PASSWORD;

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("cancellation policy configuration admin", () => {
  test.skip(!process.env.E2E_SUPABASE_READY || !password, "Requires seeded local Supabase admin credentials.");

  test("admin updates a recommendation tier and restores it", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_EMAIL ?? "admin-a@berthio.test");
    await page.goto("/dashboard/settings/cancellation-policy");
    await expect(page.getByRole("heading", { name: "Cancellation policy" })).toBeVisible();
    await expect(page.getByText("It never issues a Stripe refund")).toBeVisible();

    const refundPercentage = page.getByLabel("Refund percentage").nth(1);
    const originalPercentage = await refundPercentage.inputValue();
    const changedPercentage = originalPercentage === "49" ? "50" : "49";
    try {
      await refundPercentage.fill(changedPercentage);
      await page.getByRole("button", { name: "Save cancellation policy" }).click();
      await expect(page.getByRole("status")).toContainText("Existing bookings and financial history were not changed");
      await expect(page.getByLabel("Refund percentage").nth(1)).toHaveValue(changedPercentage);
    } finally {
      await page.goto("/dashboard/settings/cancellation-policy");
      await page.getByLabel("Refund percentage").nth(1).fill(originalPercentage);
      await page.getByRole("button", { name: "Save cancellation policy" }).click();
      await expect(page.getByRole("status")).toContainText("Cancellation policy updated");
    }
  });

  test("staff cannot access cancellation policy configuration", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_STAFF_EMAIL ?? "staff-a@berthio.test");
    await page.goto("/dashboard/settings/cancellation-policy");
    await expect(page.locator("body")).toContainText("404");
  });
});
