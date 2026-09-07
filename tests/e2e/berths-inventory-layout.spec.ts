import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });

test("berth inventory filters preserve totals and existing routes", async ({ page }, testInfo) => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-a@berthio.test" });
  if (error) throw new Error("Local test sign-in failed.");
  await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(data.properties.hashed_token)}&next=/dashboard`);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/berths");
  await expect(page.getByRole("heading", { name: "Berths", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader")).toHaveText(["Berth", "Zone / Pier", "Maximum Dimensions", "Status", "Priority", "Actions"]);
  const summary = page.getByLabel("Berth status summary");
  const totals = await summary.innerText();
  const firstCode = await page.locator("tbody tr td:first-child").first().innerText();
  await page.getByRole("searchbox", { name: "Search berths" }).fill(firstCode);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByRole("link", { name: `View berth ${firstCode}` })).toHaveAttribute("href", /\/dashboard\/berths\/[0-9a-f-]+$/);
  await page.getByRole("searchbox").fill("no-such-berth-xyz");
  await expect(page.getByText("No berths match your filters")).toBeVisible();
  expect(await summary.innerText()).toBe(totals);
  await page.getByRole("searchbox").fill("");
  await page.getByLabel("Status", { exact: true }).selectOption("available");
  for (const cell of await page.locator("tbody tr td:nth-child(4)").all()) await expect(cell).toHaveText("Available");
  await page.getByLabel("Status", { exact: true }).selectOption("all");
  await expect(page.getByRole("link", { name: "Import CSV" })).toHaveAttribute("href", "/dashboard/berths/import");
  await expect(page.getByRole("link", { name: "Add berth" })).toHaveAttribute("href", "/dashboard/berths/new");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("berths-inventory.png"), fullPage: true });
});
