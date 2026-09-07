import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test.describe("berth detail", () => {
  test.skip(!process.env.SUPABASE_SECRET_KEY, "Requires local Supabase fixtures.");
  test.setTimeout(90000);

  function service() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
    return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async function signIn(page: import("@playwright/test").Page, email: string) {
    const result = await service().auth.admin.generateLink({ type: "magiclink", email });
    if (result.error) throw new Error("Local test sign-in failed.");
    await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(result.data.properties.hashed_token)}&next=/dashboard`);
    await expect(page).toHaveURL(/\/dashboard$/);
  }

  test("shows the canonical berth record and real current assignment", async ({ page }, testInfo) => {
    const db = service();
    const marina = await db.from("marinas").select("id").eq("slug", "marina-a").single();
    expect(marina.error).toBeNull();
    const assignments = await db.from("booking_berth_assignments").select("berth_id, booking_id, arrival_date, departure_date").eq("marina_id", marina.data!.id).is("ended_at", null).order("assigned_at", { ascending: false }).limit(1);
    expect(assignments.error).toBeNull();
    const berthId = assignments.data?.[0]?.berth_id ?? (await db.from("berths").select("id").eq("marina_id", marina.data!.id).order("priority").limit(1).single()).data!.id;
    await signIn(page, "admin-a@berthio.test");
    await page.goto(`/dashboard/berths/${berthId}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Berth");
    await expect(page.getByRole("heading", { name: "Physical Limits & Specifications" })).toBeVisible();
    await expect(page.getByText("Maximum Length", { exact: true })).toBeVisible();
    await expect(page.getByText("Maximum Beam", { exact: true })).toBeVisible();
    await expect(page.getByText("Maximum Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Berth ID", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit Berth", exact: true })).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Assign to Booking" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Berth Activity History" })).toBeVisible();
    await expect(page.getByLabel("Berth summary")).toBeVisible();
    if (assignments.data?.[0]) {
      const booking = await db.from("bookings").select("reference").eq("id", assignments.data[0].booking_id).single();
      expect(booking.error).toBeNull();
      await expect(page.getByText(`Booking ${booking.data!.reference}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Open Booking Detail" })).toHaveAttribute("href", `/dashboard/bookings/${assignments.data[0].booking_id}`);
      await expect(page.getByText(/Within Limits|Outside Limits/)).toBeVisible();
    } else {
      await expect(page.getByText("No current booking is assigned to this berth.")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("berth-detail.png"), fullPage: true });
    await page.getByRole("link", { name: "Back to Berths", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard\/berths$/);
  });

  test("staff sees the berth record without admin actions and other tenants stay isolated", async ({ page }) => {
    const db = service();
    const marinaA = await db.from("marinas").select("id").eq("slug", "marina-a").single();
    const marinaB = await db.from("marinas").select("id").eq("slug", "marina-b").single();
    const berthA = await db.from("berths").select("id").eq("marina_id", marinaA.data!.id).limit(1).single();
    const berthB = await db.from("berths").select("id").eq("marina_id", marinaB.data!.id).limit(1).single();
    await signIn(page, "staff-a@berthio.test");
    await page.goto(`/dashboard/berths/${berthA.data!.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Berth");
    await expect(page.getByRole("link", { name: "Edit Berth" })).toHaveCount(0);
    await expect(page.getByText("Service Status", { exact: true })).toHaveCount(0);
    await page.goto(`/dashboard/berths/${berthB.data!.id}`);
    await expect(page.locator("body")).toContainText("404");
  });
});
