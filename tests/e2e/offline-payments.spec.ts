import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";

const marinaId = "d1000000-0000-4000-8000-000000000001";
test.describe("offline payment recording", () => {
  test.skip(!process.env.BERTHIO_ISOLATED_TESTS || !process.env.E2E_SUPABASE_READY, "Requires isolated local Supabase.");
  test.use({ baseURL: "http://localhost:3000" });
  test("records partial and full receipts on desktop and mobile, safely handles concurrent requests", async ({ page }, testInfo) => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Offline payment tests require local Supabase.");
    const db = createClient<Database>(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
    const { data: users, error: usersError } = await db.auth.admin.listUsers();
    expect(usersError).toBeNull();
    const staff = users!.users.find(user => user.email === process.env.E2E_MARINA_STAFF_EMAIL)!;
    expect(staff).toBeDefined();
    const creation = {
      target_marina_id: marinaId, target_actor_id: staff.id, requested_request_id: crypto.randomUUID(),
      requested_total_minor: 4576, requested_booking: {
        arrival_date: "2032-06-01", departure_date: "2032-06-03", eta: "14:00", etd: "10:00",
        customer_name: "Offline receipt test", customer_email: "receipts@example.test", customer_phone: "+37120000000",
        vessel_name: "Receipt test", vessel_length_m: 8, vessel_beam_m: 2.5, vessel_draft_m: 1,
      },
    };
    const creations = await Promise.all([db.rpc("create_manual_booking_with_balance", creation).single(),
      db.rpc("create_manual_booking_with_balance", creation).single()]);
    creations.forEach(result => expect(result.error).toBeNull());
    expect(creations.map(result => result.data?.outcome).sort()).toEqual(["created", "existing"]);
    const id = creations[0].data?.booking_id;
    if (!id) throw new Error("Manual booking creation returned no booking ID.");
    expect(creations[1].data?.booking_id).toBe(id);
    const balances = await db.from("booking_payment_balances").select("paid_minor,balance_due_minor").eq("booking_id", id);
    expect(balances.error).toBeNull();
    expect(balances.data).toEqual([{ paid_minor: 0, balance_due_minor: 4576 }]);
    // Immutable test receipts are retained only in the disposable integration DB.
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_MARINA_STAFF_EMAIL!);
    await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto(`/dashboard/bookings/${id}`);
    const payment = page.getByRole("region", { name: "Payment", exact: true });
    await expect(payment.getByText("Unpaid", { exact: true })).toBeVisible();
    await expect(page.getByText("Advanced payment management", { exact: true })).toHaveCount(0);
    await expect(payment.getByText("Payment settings", { exact: true })).toHaveCount(0);
    await expect(payment.getByText("Set booking total", { exact: true })).toHaveCount(0);
    await payment.locator("summary").filter({ hasText: /^Record payment$/ }).click();
    await expect(payment.getByLabel("Amount received (€)")).toHaveValue("45.76");
    await payment.getByLabel("Amount received (€)").fill("46.00");
    await payment.getByRole("combobox", { name: "Payment method", exact: true }).selectOption("cash");
    await payment.getByLabel("Note (optional)").fill("Received at the office");
    await payment.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(payment.getByRole("alert")).toContainText("must not exceed");
    await expect(payment.getByLabel("Amount received (€)")).toHaveValue("46.00");
    await expect(payment.getByLabel("Note (optional)")).toHaveValue("Received at the office");
    await payment.getByLabel("Amount received (€)").fill("19.76");
    await payment.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(payment.getByRole("status")).toContainText("Payment recorded.");
    await expect(payment.getByText("Partially paid", { exact: true })).toBeVisible();
    await expect(payment.getByLabel("Amount received (€)")).toHaveValue("26.00");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("offline-payment-partial.png"), fullPage: true });

    const args = { target_marina_id: marinaId, target_booking_id: id, target_actor_id: staff.id, target_actor_label: staff.email!,
      requested_request_id: crypto.randomUUID(), requested_currency: "EUR", requested_amount_minor: 1000,
      requested_method: "card_terminal", requested_note: "Already collected externally", expected_paid_minor: 1976 };
    const results = await Promise.all([db.rpc("record_booking_offline_payment", args), db.rpc("record_booking_offline_payment", args)]);
    results.forEach(result => expect(result.error).toBeNull());
    expect(results.map(result => result.data?.[0]?.outcome).sort()).toEqual(["already_recorded", "recorded"]);
    const stale = await db.rpc("record_booking_offline_payment", { ...args, requested_request_id: crypto.randomUUID() });
    expect(stale.data?.[0]?.outcome).toBe("stale");
    // Different request IDs from two simultaneous staff actions: only one wins.
    const parallel = await Promise.all([1, 2].map(() => db.rpc("record_booking_offline_payment", {
      ...args, requested_request_id: crypto.randomUUID(), expected_paid_minor: 2976, requested_amount_minor: 100,
    })));
    parallel.forEach(result => expect(result.error).toBeNull());
    expect(parallel.map(result => result.data?.[0]?.outcome).sort()).toEqual(["recorded", "stale"]);
    await page.reload();
    await payment.locator("summary").filter({ hasText: /^Record payment$/ }).click();
    await expect(payment.getByLabel("Amount received (€)")).toHaveValue("15.00");
    await payment.getByRole("combobox", { name: "Payment method", exact: true }).selectOption("bank_transfer");
    await payment.getByRole("button", { name: "Record payment", exact: true }).click();
    await expect(payment.getByText("Paid", { exact: true })).toBeVisible();
    await expect(payment.getByRole("status")).toContainText("Payment recorded.");
    await expect(payment.getByRole("button", { name: "Record payment", exact: true })).toHaveCount(0);
    await payment.locator("summary").filter({ hasText: /^Payment history/ }).click();
    await expect(payment.getByText("€19.76 · Cash", { exact: true })).toBeVisible();
    const receipts = await db.from("booking_offline_payments").select("amount_minor,recorded_by").eq("booking_id", id);
    expect(receipts.error).toBeNull();
    expect(receipts.data).toHaveLength(4);
    expect(receipts.data!.reduce((sum, receipt) => sum + receipt.amount_minor, 0)).toBe(4576);
    expect(receipts.data!.every(receipt => receipt.recorded_by === staff.id)).toBe(true);
    expect((await db.from("bookings").select("status,booking_payment_id").eq("id", id).single()).data).toMatchObject({ status: "confirmed", booking_payment_id: null });
    await page.screenshot({ path: testInfo.outputPath("offline-payment-paid.png"), fullPage: true });
  });
});
