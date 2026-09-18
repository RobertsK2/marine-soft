import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test.describe("audit settings", () => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  test.setTimeout(90000);
  async function signIn(page: import("@playwright/test").Page, email: string) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
    const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await service.auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard/audit`);
    await completeAdminMfa(page);
    return service;
  }
  test("real tenant events, filters, expansion and pagination", async ({ page }, testInfo) => {
    const service = await signIn(page, "admin-a@berthio.test");
    await expect(page.getByRole("heading", { name: "Audit Log", exact: true })).toBeVisible();
    await expect(page.locator("thead th")).toHaveText(["Time", "User / Actor", "Action", "Entity", "Details"]);
    await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
    const marina = await service.from("marinas").select("id").eq("slug", "marina-a").single();
    expect(marina.error).toBeNull();
    const expected = await service.from("audit_events").select("occurred_at").eq("marina_id", marina.data!.id).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(9);
    expect(expected.error).toBeNull();
    expect(await page.locator("tbody time").evaluateAll((times) => times.map((time) => time.getAttribute("datetime")))).toEqual(expected.data!.map((event) => event.occurred_at));
    await page.getByRole("button", { name: "Expand event 1 details", exact: true }).click();
    await expect(page.getByText("Timestamp", { exact: true })).toBeVisible();
    await expect(page.getByText("Affected entity", { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b|whsec_|acct_|(?:sk|rk)_(?:test|live)_/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("audit-expanded.png"), fullPage: true });
    await page.getByRole("button", { name: "Collapse event 1 details", exact: true }).click();
    if (await page.getByRole("button", { name: "Next", exact: true }).isEnabled()) {
      await page.getByRole("button", { name: "Next", exact: true }).click();
      await expect(page.getByRole("navigation", { name: "Audit pagination" })).toContainText("Page 2");
    }
    await page.getByRole("textbox", { name: "Search audit events" }).fill("no-matching-event-zzzz");
    await expect(page.getByText("No events match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    const actor = page.getByRole("combobox", { name: "User / Actor" });
    await actor.selectOption({ index: 1 });
    const actorName = await actor.inputValue();
    for (const row of await page.locator("tbody tr").all()) await expect(row.locator("td").nth(1)).toContainText(actorName);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    const action = page.getByRole("combobox", { name: "Action / Event Type" });
    await action.selectOption({ index: 1 });
    const actionName = await action.inputValue();
    for (const row of await page.locator("tbody tr").all()) await expect(row.locator("td").nth(2)).toHaveText(actionName);
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByLabel("From date", { exact: true }).fill("2099-01-01");
    await expect(page.getByText("No events match these filters.")).toBeVisible();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await page.getByRole("link", { name: "Back to Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings$/);
  });
  test("staff cannot open the admin audit log", async ({ page }) => {
    await signIn(page, "staff-a@berthio.test");
    await expect(page.locator("body")).toContainText("404");
  });
});
