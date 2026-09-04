import { expect, test } from "@playwright/test";

const password = process.env.E2E_MARINA_PASSWORD;

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("integration status admin", () => {
  test.skip(!process.env.E2E_SUPABASE_READY || !password, "Requires seeded local Supabase admin credentials.");

  test("admin sees safe readiness and tenant operational health", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_EMAIL ?? "admin-a@berthio.test");
    await page.goto("/dashboard/settings/integrations");
    await expect(page.getByRole("heading", { name: "Integration status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stripe Connect" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Postmark" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notification worker" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Operational health" })).toBeVisible();
    await expect(page.getByText("Status checks are read-only")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:sk|rk)_(?:test|live)_|whsec_|POSTMARK_API_TEST/);
  });

  test("staff cannot access integration status", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_STAFF_EMAIL ?? "staff-a@berthio.test");
    await page.goto("/dashboard/settings/integrations");
    await expect(page.locator("body")).toContainText("404");
  });
});
