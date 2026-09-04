import { expect, test } from "@playwright/test";

const password = process.env.E2E_MARINA_PASSWORD;

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("pricing configuration admin", () => {
  test.skip(!process.env.E2E_SUPABASE_READY || !password, "Requires seeded local Supabase admin credentials.");

  test("admin updates VAT mode atomically and can restore it", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_EMAIL ?? "admin-a@berthio.test");
    await page.goto("/dashboard/settings/pricing");
    await expect(page.getByRole("heading", { name: "Pricing configuration" })).toBeVisible();
    await expect(page.getByLabel("Currency")).toHaveValue("EUR");
    await expect(page.getByLabel("Pricing model")).toHaveValue("per_meter");

    const taxMode = page.getByLabel("VAT / tax mode");
    const originalMode = await taxMode.inputValue();
    const changedMode = originalMode === "exclusive" ? "inclusive" : "exclusive";
    try {
      await taxMode.selectOption(changedMode);
      await page.getByRole("button", { name: "Save pricing configuration" }).click();
      await expect(page.getByRole("status")).toContainText("Existing booking snapshots were not changed");
      await expect(page.getByLabel("VAT / tax mode")).toHaveValue(changedMode);
    } finally {
      await page.goto("/dashboard/settings/pricing");
      await page.getByLabel("VAT / tax mode").selectOption(originalMode);
      await page.getByRole("button", { name: "Save pricing configuration" }).click();
      await expect(page.getByRole("status")).toContainText("Pricing configuration updated");
    }
  });

  test("staff cannot access pricing configuration", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_STAFF_EMAIL ?? "staff-a@berthio.test");
    await page.goto("/dashboard/settings/pricing");
    await expect(page.locator("body")).toContainText("404");
  });
});
