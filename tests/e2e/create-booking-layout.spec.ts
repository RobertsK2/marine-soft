import { completeAdminMfa } from "./helpers/admin-mfa";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test.use({ baseURL: "http://localhost:3000" });
test("manual booking preserves validation and creates unassigned capacity", async ({ page }, testInfo) => {
  test.skip(!process.env.BERTHIO_ISOLATED_TESTS || !process.env.E2E_SUPABASE_READY || !process.env.SUPABASE_SECRET_KEY, "Requires disposable local Supabase fixtures.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Local test database required.");
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email: "admin-a@berthio.test" });
  if (error) throw new Error("Local test sign-in failed.");
  const guest = `Create UI ${testInfo.project.name} ${Date.now()}`;
  const runtimeErrors: string[] = [];
  page.on("pageerror", (value) => runtimeErrors.push(value.message));
  await page.goto(`/auth/confirm?type=magiclink&token_hash=${encodeURIComponent(data.properties.hashed_token)}&next=/dashboard`);
  await completeAdminMfa(page);
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/bookings/new");
  await expect(page.getByRole("heading", { name: "Create manual booking" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create booking", exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("create-booking.png"), fullPage: true });
  await page.getByRole("button", { name: "Create booking", exact: true }).click();
  await expect(page.getByText("Enter a valid arrival date.")).toBeVisible();
  await expect(page.getByText("Enter a positive euro amount with up to two decimal places.")).toBeVisible();
  await page.getByLabel("Customer name").fill(guest);
  await page.getByLabel("Phone", { exact: true }).fill("+37120000009");
  await page.getByLabel("Email", { exact: true }).fill("create-ui@example.test");
  await page.getByLabel("Length (m)").fill("9999");
  await page.getByLabel("Beam (m)").fill("2.8");
  await page.getByLabel("Draft (m)").fill("1.4");
  await page.locator("summary").filter({ hasText: "Optional vessel details" }).click();
  await page.getByLabel("Vessel name").fill("UI Test Vessel");
  const arrival = new Date(Date.UTC(2080, 0, 1 + (testInfo.project.name === "mobile" ? 100 : 0)));
  const departure = new Date(arrival.getTime() + 3 * 86400000);
  const date = (value: Date) => value.toISOString().slice(0, 10);
  await page.getByLabel("Arrival date").fill(date(arrival));
  await page.getByLabel("Departure date").fill(date(departure));
  await page.getByLabel("ETA", { exact: true }).fill("14:30");
  await page.getByLabel("ETD", { exact: true }).fill("10:00");
  await page.getByLabel("Booking total (€)").fill("45,76");
  await page.getByRole("button", { name: "Create booking", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Booking summary" }).getByRole("alert")).toContainText("No safe berth capacity");
  await expect(page.getByLabel("Customer name")).toHaveValue(guest);
  await page.getByLabel("Length (m)").fill("8");
  await expect(page.getByRole("complementary", { name: "Booking summary" })).toContainText("3 nights");
  await expect(page.getByLabel("Booking total (€)")).toHaveValue("45,76");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("create-booking-validation.png"), fullPage: true });
  await page.getByRole("button", { name: "Create booking", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/[0-9a-f-]+$/, { timeout: 15000 });
  const bookingId = page.url().split("/").pop()!;
  const result = await service.from("bookings").select("source,customer_name,price_total_minor,status").eq("id", bookingId).single();
  expect(result.error).toBeNull();
  expect(result.data).toMatchObject({ source: "manual", customer_name: guest, price_total_minor: null, status: "confirmed" });
  const assignments = await service.from("booking_berth_assignments").select("id").eq("booking_id", bookingId);
  expect(assignments.error).toBeNull();
  expect(assignments.data).toEqual([]);
  const payment = page.getByRole("region", { name: "Payment", exact: true });
  await expect(payment.getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(payment.locator("summary").filter({ hasText: /^Record payment$/ })).toBeVisible();
  await expect(payment.getByText("Advanced payment management", { exact: true })).toHaveCount(0);
  await payment.getByText("Payment settings", { exact: true }).click();
  const dueAt = `${date(arrival)}T12:00`;
  const link = "https://payments.example.test/manual-booking";
  await payment.getByLabel("Payment link (optional)").fill(link);
  await payment.getByLabel("Payment due date (optional)").fill(dueAt);
  await payment.getByRole("button", { name: "Save payment settings" }).click();
  await expect(payment.getByRole("status")).toContainText("Payment settings saved.");
  const balance = await service.from("booking_payment_balances")
      .select("state,collection_method,currency,total_due_minor,paid_minor,balance_due_minor,payment_link_url").eq("booking_id", bookingId).single();
  expect(balance.error).toBeNull();
  expect(balance.data).toEqual({ state: "balance_due", collection_method: "on_site", currency: "EUR",
      total_due_minor: 4576, paid_minor: 0, balance_due_minor: 4576, payment_link_url: link });

  const legacyId = crypto.randomUUID();
  const legacy = await service.from("bookings").insert({
    id: legacyId, marina_id: "d1000000-0000-4000-8000-000000000001",
    arrival_date: date(arrival), departure_date: date(departure), eta: "14:30", etd: "10:00",
    customer_name: "Legacy payment fixture", customer_email: "legacy-payment@example.test", customer_phone: "+37120000009",
    vessel_length_m: 8, vessel_beam_m: 2.8, vessel_draft_m: 1.4,
  });
  expect(legacy.error).toBeNull();
  await page.goto(`/dashboard/bookings/${legacyId}`);
  const setup = payment.locator("summary").filter({ hasText: /^Set booking total$/ });
  await setup.click();
  await payment.getByLabel("Booking total (€)").fill("31.25");
  await payment.getByRole("button", { name: "Set booking total" }).click();
  await expect(setup).toHaveCount(0);
  await expect(payment.getByText("Unpaid", { exact: true })).toBeVisible();
  await expect(payment.locator("summary").filter({ hasText: /^Record payment$/ })).toBeVisible();

  // The isolated integration database owns these bookings and their audit and payment records.
  expect(runtimeErrors).toEqual([]);
});
