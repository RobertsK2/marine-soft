import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test.describe("publishing settings", () => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires seeded local Supabase fixtures.");
  test.setTimeout(90000);

  function localService() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
    return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async function signIn(page: import("@playwright/test").Page, email: string) {
    const result = await localService().auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard/settings/publishing`);
    return result.data.user.id;
  }

  test("layout, unpublishing, stale writes and tenant isolation", async ({ page }, testInfo) => {
    const service = localService();
    const actorId = await signIn(page, "admin-a@berthio.test");
    const original = await service.from("marinas").select("id, is_public").eq("slug", "marina-a").single();
    const otherTenant = await service.from("marinas").select("is_public, updated_at").eq("slug", "marina-b").single();
    expect(original.error).toBeNull();
    expect(otherTenant.error).toBeNull();
    const restorePublication = async (isPublic: boolean) => {
      const current = await service.from("marinas").select("updated_at").eq("id", original.data!.id).single();
      expect(current.error).toBeNull();
      const result = await service.rpc("set_marina_publication_state", {
        target_marina_id: original.data!.id, target_actor_id: actorId,
        expected_updated_at: current.data!.updated_at, requested_public: isPublic, integrations_ready: true,
      });
      expect(result.error).toBeNull();
      expect(["updated", "unchanged"]).toContain(result.data?.[0].outcome);
    };
    const stalePage = await page.context().newPage();
    try {
      await restorePublication(true);
      await page.reload();
      await expect(page.getByRole("heading", { name: "Publishing", exact: true })).toBeVisible();
      await expect(page.locator("main h2")).toHaveText(["Public Booking Page", "Publishing Readiness", "Publication Status"]);
      await expect(page.getByText("Published", { exact: true })).toHaveCount(1);
      const checklist = page.getByRole("region", { name: "Publishing Readiness", exact: true });
      await expect(checklist.getByRole("listitem")).toHaveCount(6);
      await expect(checklist.getByRole("link")).toHaveText([
        "Marina Profile", "Accepted Payment Methods", "Pricing & Seasonal Rates",
        "Payment Readiness (Stripe)", "Email Delivery (Postmark)", "Notification Worker & Scheduler",
      ]);
      await expect(checklist.getByRole("button")).toHaveCount(0);
      for (const row of await checklist.getByRole("listitem").all()) {
        await expect(row.getByText(/^(Ready|Action Required)$/)).toHaveCount(1);
      }
      await expect(checklist.getByText(/\d of 6 Ready/)).toBeVisible();
      await expect(page.getByRole("link", { name: "View Public Page" })).toHaveAttribute("href", "/marina/marina-a");
      await expect(page.getByRole("button", { name: "Copy URL" })).toHaveCount(0);
      await expect(page.locator("main code")).toContainText("/marina/marina-a");
      await expect(page.locator("main")).not.toContainText(/(?:sk|rk)_(?:test|live)_|whsec_|acct_[A-Za-z0-9]+|POSTMARK_API_TEST/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("publishing-published.png"), fullPage: true });
      await stalePage.goto("/dashboard/settings/publishing");
      await expect(stalePage.getByRole("button", { name: "Unpublish Booking Page" })).toBeEnabled();
      await page.getByRole("button", { name: "Unpublish Booking Page" }).click();
      await expect(page.getByRole("status")).toContainText("Public booking page unpublished");
      await expect(page.getByText("Unpublished", { exact: true })).toHaveCount(1);
      await expect(page.getByRole("link", { name: "View Public Page" })).toHaveCount(0);
      const blocked = await page.getByText("Complete the required setup to enable publishing.").isVisible();
      if (blocked) await expect(page.getByRole("button", { name: "Publish Booking Page" })).toBeDisabled();
      else await expect(page.getByRole("button", { name: "Publish Booking Page" })).toBeEnabled();
      await page.screenshot({ path: testInfo.outputPath("publishing-unpublished.png"), fullPage: true });
      await stalePage.getByRole("button", { name: "Unpublish Booking Page" }).click();
      await expect(stalePage.locator("main").getByRole("alert")).toContainText("Publication settings changed after this page was opened");
      await page.getByRole("link", { name: "Back to Settings", exact: true }).last().click();
      await expect(page).toHaveURL(/\/dashboard\/settings$/);
      await page.goto("/marina/marina-a");
      await expect(page.locator("body")).toContainText("404");
      const after = await service.from("marinas").select("is_public, updated_at").eq("slug", "marina-b").single();
      expect(after.error).toBeNull();
      expect(after.data).toEqual(otherTenant.data);
    } finally {
      await stalePage.close();
      await restorePublication(original.data!.is_public);
    }
  });

  test("staff cannot open publishing settings", async ({ page }) => {
    await signIn(page, "staff-a@berthio.test");
    await expect(page.locator("body")).toContainText("404");
  });
});
