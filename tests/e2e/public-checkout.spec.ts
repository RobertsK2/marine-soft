import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";

test("one payment action creates one private 15-minute hold and one real Stripe Checkout", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  test.skip(!process.env.E2E_STRIPE_CHECKOUT_READY, "Requires local Supabase and Stripe test credentials.");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname) || !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Local database and Stripe test mode required.");
  }
  const db = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const configured = await db.from("marinas").update({ accepts_online_payment: true, accepts_pay_at_marina: false }).eq("id", "d1000000-0000-4000-8000-000000000001");
  expect(configured.error).toBeNull();
  const query = new URLSearchParams({ arrivalDate: "2026-12-20", departureDate: "2026-12-22", eta: "14:30", etd: "10:00", vesselLengthM: "9.5", vesselBeamM: "3.1", vesselDraftM: "1.7", vesselName: `Checkout E2E ${crypto.randomUUID()}` });
  await page.goto(`/marina/marina-a?${query}#booking-entry`);
  const cta = page.getByRole("button", { name: "Continue to Payment", exact: true });
  await expect(cta).toBeVisible();
  await expect(page.getByRole("group", { name: "Payment method" })).toHaveCount(0);
  if (testInfo.project.name === "mobile") {
    await expect(page.getByRole("heading", { name: "Review & Pay" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Dates and vessel" })).toBeHidden();
  }
  await expect(page.locator('[data-hold-token]')).toHaveCount(0);
  const attempt = await page.locator('[name="holdIdempotencyKey"]').inputValue();
  const quotedTotal = Number(await page.locator('[data-price-total-minor]').getAttribute("data-price-total-minor"));
  const before = await db.from("booking_holds").select("id").eq("idempotency_key", attempt);
  expect(before.error).toBeNull();
  expect(before.data).toEqual([]);

  // Pause delivery, not the server implementation, to observe the real loading state.
  let deliver!: () => void;
  const delivery = new Promise<void>((resolve) => { deliver = resolve; });
  await page.route("**/marina/marina-a?**", async (route) => {
    if (route.request().method() === "POST") await delivery;
    await route.continue();
  });
  try {
    await cta.evaluate((button: HTMLButtonElement) => { button.click(); button.click(); });
    await expect(page.getByRole("button", { name: "Opening secure payment…" })).toBeDisabled();
    if (testInfo.project.name === "mobile") await expect(page.getByRole("button", { name: "Back / Edit Search" })).toBeDisabled();
    deliver();
    await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 45_000 });
    const holds = await db.from("booking_holds").select("id, status, created_at, expires_at, price_total_minor").eq("idempotency_key", attempt);
    expect(holds.error).toBeNull();
    expect(holds.data).toHaveLength(1);
    const hold = holds.data![0];
    expect(hold.status).toBe("active");
    expect(Date.parse(hold.expires_at) - Date.parse(hold.created_at)).toBeGreaterThanOrEqual(899_000);
    expect(Date.parse(hold.expires_at) - Date.parse(hold.created_at)).toBeLessThanOrEqual(901_000);
    expect(hold.price_total_minor).toBe(quotedTotal);
    const payments = await db.from("booking_payments").select("id, status, stripe_checkout_session_id").eq("hold_id", hold.id);
    expect(payments.error).toBeNull();
    expect(payments.data).toHaveLength(1);
    expect(payments.data![0].status).toBe("pending");
    expect(payments.data![0].stripe_checkout_session_id).toMatch(/^cs_test_/);
    const bookings = await db.from("bookings").select("id").eq("booking_payment_id", payments.data![0].id);
    expect(bookings.error).toBeNull();
    expect(bookings.data).toEqual([]);
  } finally {
    deliver();
    const hold = await db.from("booking_holds").select("id, public_token").eq("idempotency_key", attempt).maybeSingle();
    if (hold.data) {
      const payment = await db.from("booking_payments").select("id, stripe_checkout_session_id, stripe_account_id").eq("hold_id", hold.data.id).maybeSingle();
      if (payment.data?.stripe_checkout_session_id) {
        const account = payment.data.stripe_account_id;
        const options = account === "acct_testmarinaa" && process.env.STRIPE_LOCAL_PLATFORM_FALLBACK === "true" ? {} : { stripeAccount: account };
        await stripe.checkout.sessions.expire(payment.data.stripe_checkout_session_id, {}, options);
      }
      const released = payment.data
        ? await db.rpc("fail_booking_checkout_creation", { target_payment_id: payment.data.id })
        : await db.rpc("release_booking_hold_after_checkout_failure", { target_hold_token: hold.data.public_token });
      expect(released.error).toBeNull();
    }
  }
});
