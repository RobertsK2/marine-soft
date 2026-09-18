import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";

test("manual booking waits for hydration before accepting input", async ({ page }) => {
  test.skip(!process.env.E2E_SUPABASE_READY, "Requires isolated local Supabase.");
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_MARINA_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
  await page.getByRole("button", { name: "Sign In" }).click();
  await completeAdminMfa(page);
  await expect(page).toHaveURL(/\/dashboard$/);

  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/dashboard/bookings/new", { waitUntil: "commit" });
    await expect(page.getByLabel("Arrival date")).toBeDisabled();
    await expect(page.getByLabel("Customer name")).toBeDisabled();
    await expect(page.getByRole("button", { name: "Create booking", exact: true })).toBeDisabled();
    releaseScripts();
    await page.waitForLoadState("load");
    await page.getByLabel("Arrival date").fill("2085-01-01");
    await page.getByLabel("Customer name").fill("Hydration regression");
    await expect(page.getByRole("complementary", { name: "Booking summary" })).toContainText("Hydration regression");
    await expect(page.getByLabel("Arrival date")).toHaveValue("2085-01-01");
    await expect(page.getByRole("button", { name: "Create booking", exact: true })).toBeEnabled();
  } finally {
    releaseScripts();
  }
});
