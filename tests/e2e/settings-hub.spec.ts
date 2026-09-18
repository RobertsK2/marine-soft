import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test("settings hub preserves destinations, general saves and role guards", async ({ page }, testInfo) => {
  test.setTimeout(90000);
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const signIn = async (email: string) => {
    const result = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.context().clearCookies();
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard`);
    await completeAdminMfa(page);
    await expect(page).toHaveURL(/\/dashboard$/);
  };
  await signIn("admin-a@berthio.test");
  const sidebar = page.getByRole("navigation", { name: "Marina administration" });
  await expect(sidebar.getByRole("link")).toHaveText(["Overview", "Bookings", "Berths", "Berth Map", "Payments", "Settings"]);
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const hub = page.getByRole("navigation", { name: "Settings sections" });
  const destinations = [
    ["General", "/dashboard/settings/general", "General Settings"],
    ["Pricing", "/dashboard/settings/pricing", "Pricing"],
    ["Cancellation Policy", "/dashboard/settings/cancellation-policy", "Cancellation Policy"],
    ["Integrations", "/dashboard/settings/integrations", "Integrations"],
    ["Publishing", "/dashboard/settings/publishing", "Publishing"],
    ["Audit Log", "/dashboard/audit", "Audit Log"],
  ];
  await expect(hub.getByRole("link")).toHaveCount(6);
  expect(await hub.getByRole("link").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(destinations.map((item) => item[1]));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("settings-hub.png"), fullPage: true });
  for (const [title, path, heading] of destinations) {
    await hub.getByRole("link", { name: title, exact: true }).click();
    await expect(page).toHaveURL(`http://localhost:3000${path}`);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  }
  await hub.getByRole("link", { name: "General", exact: true }).click();
  await expect(page.getByLabel("Marina name", { exact: true })).toHaveValue("Marina A");
  // Saving the existing values twice verifies that the relocated page receives a fresh version.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = page.waitForResponse((result) => result.request().method() === "POST" && new URL(result.url()).pathname === "/dashboard/settings/general");
    await page.getByRole("button", { name: "Save marina profile" }).click();
    await response;
    await expect(page.getByRole("status")).toHaveText("Marina profile updated.");
  }
  await signIn("admin-b@berthio.test");
  await page.goto("/dashboard/settings/general");
  await expect(page.getByLabel("Marina name", { exact: true })).toHaveValue("Marina B");
  await signIn("staff-a@berthio.test");
  await expect(sidebar.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  for (const path of ["/dashboard/settings", ...destinations.map((item) => item[1])]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  }
});

