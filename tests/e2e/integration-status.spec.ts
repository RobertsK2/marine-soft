import { expect, test } from "@playwright/test";

const password = process.env.E2E_MARINA_PASSWORD;
const localFixtures = Boolean(process.env.SUPABASE_SECRET_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);

test.use({ baseURL: "http://localhost:3000" });

async function login(page: import("@playwright/test").Page, email: string) {
  if (!password && localFixtures) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
    const { createClient } = await import("@supabase/supabase-js");
    const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard`);
    await expect(page).toHaveURL(/\/dashboard$/);
    return;
  }
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("integration status admin", () => {
  test.skip(!(process.env.E2E_SUPABASE_READY && password) && !localFixtures, "Requires seeded local Supabase admin credentials.");
  test.setTimeout(90000);

  test("admin sees safe integration readiness", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_EMAIL ?? "admin-a@berthio.test");
    await page.goto("/dashboard/settings/integrations");
    await expect(page.getByRole("heading", { name: "Integrations", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stripe Payments" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Postmark / Email Delivery" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notification Worker & Scheduler" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "System Diagnostics (Sentry)" })).toBeVisible();
    await expect(page.getByText("Configuration checks only; live service availability is not verified.")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/(?:sk|rk)_(?:test|live)_|whsec_|acct_[A-Za-z0-9]+|POSTMARK_API_TEST/);
    await expect(page.getByText("Worker:", { exact: false })).toContainText("Scheduler:");
    await expect(page.getByText(/Matched webhooks|Open payments|Queued email|Sent email/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Manage in Stripe|Test Delivery|Check Status|Diagnostics|Refresh Statuses/ })).toHaveCount(0);
    await expect(page.getByText("Last checked:", { exact: false })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("integrations.png"), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Back to Settings", exact: true }).last().click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });

  test("staff cannot access integration status", async ({ page }) => {
    await login(page, process.env.E2E_MARINA_STAFF_EMAIL ?? "staff-a@berthio.test");
    await page.goto("/dashboard/settings/integrations");
    await expect(page.locator("body")).toContainText("404");
  });
});
