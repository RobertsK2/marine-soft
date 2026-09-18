import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test("add berth preserves validation, creation, audit and tenant isolation", async ({ page }, testInfo) => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-a@berthio.test" });
  if (error) throw new Error("Local test sign-in failed.");
  const code = `UI-${testInfo.project.name}-${Date.now()}`;
  let berthId: string | undefined;
  try {
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(data.properties.hashed_token)}&next=/dashboard/berths/new`);
    await completeAdminMfa(page);
    await expect(page.getByRole("heading", { name: "Add Berth", exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /notes/i })).toHaveCount(0);
    const submit = page.getByRole("button", { name: "Add Berth", exact: true });
    await expect(submit).toHaveCount(1);
    await submit.click();
    await expect(page.getByLabel("Berth Code / Name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Maximum Length")).toHaveAttribute("aria-invalid", "true");
    await page.getByLabel("Berth Code / Name").fill("A-01");
    await page.getByLabel("Zone / Pier").fill("UI North Pier");
    await page.getByLabel("Maximum Length").fill("17.5");
    await page.getByLabel("Maximum Beam").fill("5.2");
    await page.getByLabel("Maximum Draft").fill("2.9");
    await page.getByLabel("Assignment Priority").fill("7");
    await page.getByLabel("Initial Status").selectOption("blocked");
    await page.getByLabel("Allow Smaller Vessels").uncheck();
    await submit.click();
    await expect(page.getByText("That berth code already exists in this marina.")).toBeVisible();
    await expect(page.getByLabel("Berth Code / Name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByLabel("Maximum Length")).toHaveValue("17.5");
    await expect(page.getByLabel("Initial Status")).toHaveValue("blocked");
    await expect(page.getByLabel("Zone / Pier")).toHaveValue("UI North Pier");
    await expect(page.getByLabel("Allow Smaller Vessels")).not.toBeChecked();
    await page.getByLabel("Berth Code / Name").fill(code);
    const summary = page.getByRole("complementary", { name: "Berth Summary" });
    await expect(summary).toContainText("17.50 m × 5.20 m × 2.90 m");
    await expect(summary).toContainText("Exact class only");
    await expect(summary).toContainText("It must be available before vessels can be assigned.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (testInfo.project.name === "chromium") {
      const panel = await summary.boundingBox();
      const lastCard = await page.getByRole("region", { name: "3. Status & Allocation" }).boundingBox();
      expect(Math.abs(panel!.y + panel!.height - lastCard!.y - lastCard!.height)).toBeLessThan(2);
    }
    await page.screenshot({ path: testInfo.outputPath("add-berth.png"), fullPage: true });
    await submit.click();
    await expect(page).toHaveURL(/\/dashboard\/berths\/[0-9a-f-]+$/);
    berthId = page.url().split("/").pop();
    const result = await service.from("berths").select("code,zone,max_length_m,max_beam_m,max_draft_m,priority,status,allow_smaller_vessels,marina_id").eq("id", berthId!).single();
    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ code: code.toUpperCase(), zone: "UI North Pier", max_length_m: 17.5, max_beam_m: 5.2, max_draft_m: 2.9, priority: 7, status: "blocked", allow_smaller_vessels: false, marina_id: "d1000000-0000-4000-8000-000000000001" });
    const audit = await service.from("audit_events").select("id").eq("berth_id", berthId!).eq("event_type", "berth.created");
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    await page.getByRole("link", { name: "Edit berth" }).click();
    await expect(page.getByRole("button", { name: "Save berth" })).toBeVisible();
    await expect(page.getByLabel("Zone", { exact: true })).toHaveValue("UI North Pier");
    const other = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-b@berthio.test" });
    if (other.error) throw new Error("Second tenant test sign-in failed.");
    await page.context().clearCookies();
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(other.data.properties.hashed_token)}&next=/dashboard`);
    await completeAdminMfa(page);
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/dashboard/berths/${berthId}`);
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
  } finally {
    const cleanup = berthId ? service.from("berths").delete().eq("id", berthId) : service.from("berths").delete().eq("code", code.toUpperCase());
    expect((await cleanup).error).toBeNull();
  }
});
