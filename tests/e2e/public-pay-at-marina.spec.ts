import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const MARINA_ID = "d1000000-0000-4000-8000-000000000001";

function localDatabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("Local Supabase is required for payment-method E2E tests.");
  }
  return createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function setMethods(db: SupabaseClient, online: boolean, atMarina: boolean) {
  const result = await db.from("marinas").update({ accepts_online_payment: online, accepts_pay_at_marina: atMarina }).eq("id", MARINA_ID);
  expect(result.error).toBeNull();
}

async function removeTestBooking(db: SupabaseClient, bookingId: string, holdId: string) {
  const balance = await db.from("booking_payment_balances").delete().eq("booking_id", bookingId);
  expect(balance.error).toBeNull();
  const booking = await db.from("bookings").delete().eq("id", bookingId);
  expect(booking.error).toBeNull();
  const hold = await db.from("booking_holds").delete().eq("id", holdId);
  expect(hold.error).toBeNull();
}

test("pay-at-marina-only confirms once with the full balance outstanding", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  test.skip(testInfo.project.name !== "mobile" || !process.env.E2E_SUPABASE_READY, "Mobile with local Supabase fixtures required.");
  const db = localDatabase();
  const vesselName = `Pay later E2E ${crypto.randomUUID()}`;
  let bookingId: string | undefined;
  let holdId: string | undefined;
  await setMethods(db, false, true);
  try {
    const query = new URLSearchParams({ arrivalDate: "2026-12-08", departureDate: "2026-12-10", eta: "14:30", etd: "10:00", vesselLengthM: "9.5", vesselBeamM: "3.1", vesselDraftM: "1.7", vesselName });
    await page.goto(`/marina/marina-a?${query}#booking-entry`);
    await expect(page.getByRole("heading", { name: "Review Booking" })).toBeVisible();
    await expect(page.getByLabel("Booking information")).toContainText("Pay at the marina after booking");
    await expect(page.getByLabel("Booking information")).not.toContainText("Stripe");
    await expect(page.getByRole("group", { name: "Payment method" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Continue to Payment" })).toHaveCount(0);
    const confirm = page.getByRole("button", { name: "Confirm Booking", exact: true });
    await page.getByLabel("Full name").fill("Pay Later Guest");
    await page.getByLabel("Email", { exact: true }).fill("pay-later@example.test");
    await page.getByLabel("Phone", { exact: true }).fill("+37120000000");
    const attempt = await page.locator('[name="holdIdempotencyKey"]').inputValue();
    const quotedTotal = Number(await page.locator("[data-price-total-minor]").getAttribute("data-price-total-minor"));

    let deliver!: () => void;
    const delivery = new Promise<void>((resolve) => { deliver = resolve; });
    await page.route("**/marina/marina-a?**", async (route) => {
      if (route.request().method() === "POST") await delivery;
      await route.continue();
    });
    try {
      await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
      await expect(page.getByRole("button", { name: "Confirming booking…" })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Back / Edit Search" })).toBeDisabled();
    } finally {
      deliver();
    }

    await page.waitForURL(/\/guest\/bookings\/[^?]+\?confirmation=1$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    await expect(page.getByText(`Due at marina · €${(quotedTotal / 100).toFixed(2)}`)).toBeVisible();

    const bookings = await db.from("bookings").select("id, booking_hold_id, booking_payment_id, status, price_total_minor, customer_snapshot").eq("vessel_name", vesselName);
    expect(bookings.error).toBeNull();
    expect(bookings.data).toHaveLength(1);
    bookingId = bookings.data![0].id;
    holdId = bookings.data![0].booking_hold_id;
    expect(bookings.data![0]).toMatchObject({ status: "confirmed", booking_payment_id: null, price_total_minor: quotedTotal });
    expect((bookings.data![0].customer_snapshot as { source?: string }).source).toBe("public_pay_at_marina");
    const holds = await db.from("booking_holds").select("id, status").eq("idempotency_key", attempt);
    expect(holds.error).toBeNull();
    expect(holds.data).toEqual([{ id: holdId, status: "consumed" }]);
    const balances = await db.from("booking_payment_balances").select("state, collection_method, total_due_minor, paid_minor, balance_due_minor").eq("booking_id", bookingId);
    expect(balances.error).toBeNull();
    expect(balances.data).toEqual([{ state: "balance_due", collection_method: "on_site", total_due_minor: quotedTotal, paid_minor: 0, balance_due_minor: quotedTotal }]);
    const stripeRows = await db.from("booking_payments").select("id").eq("hold_id", holdId);
    expect(stripeRows.error).toBeNull();
    expect(stripeRows.data).toEqual([]);
  } finally {
    if (bookingId && holdId) await removeTestBooking(db, bookingId, holdId);
    await setMethods(db, true, false);
  }
});

test("both methods show a two-option choice that defaults to Pay now", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile" || !process.env.E2E_SUPABASE_READY, "Mobile with local Supabase fixtures required.");
  const db = localDatabase();
  await setMethods(db, true, true);
  try {
    const query = new URLSearchParams({ arrivalDate: "2026-12-11", departureDate: "2026-12-13", eta: "14:30", etd: "10:00", vesselLengthM: "9.5", vesselBeamM: "3.1", vesselDraftM: "1.7", vesselName: "Payment choice E2E" });
    await page.goto(`/marina/marina-a?${query}#booking-entry`);
    const methods = page.getByRole("group", { name: "Payment method" });
    await expect(methods).toBeVisible();
    await expect(page.getByLabel("Booking information")).toContainText("Choose how to pay when you review your booking");
    await expect(page.getByLabel("Booking information")).not.toContainText("Stripe");
    const payNow = page.getByRole("radio", { name: /Pay now/ });
    const payAtMarina = page.getByRole("radio", { name: /Pay at marina/ });
    await expect(payNow).toBeChecked();
    await expect(payAtMarina).not.toBeChecked();
    await expect(page.getByRole("button", { name: "Continue to Payment" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeHidden();
    await payAtMarina.check();
    await expect(page.getByRole("button", { name: "Confirm Booking" })).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();
    await expect(page.getByText("The full booking total is due at the marina.")).toBeVisible();
  } finally {
    await setMethods(db, true, false);
  }
});
