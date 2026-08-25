import { expect, test } from "@playwright/test";

test("local paid Checkout confirms one booking and exposes it to marina admin", async ({ page }) => {
  test.setTimeout(120_000);
  test.skip(!process.env.E2E_STRIPE_LOCAL_READY, "Requires local Supabase, Stripe test mode, and the CLI listener.");

  const query = new URLSearchParams({
    arrivalDate: "2026-10-28",
    departureDate: "2026-10-30",
    eta: "14:30",
    etd: "10:00",
    vesselBeamM: "3.8",
    vesselDraftM: "2.1",
    vesselLengthM: "12",
    vesselName: `Phase 6 Local ${Date.now()}`,
  });
  await page.goto(`/marina/marina-a?${query.toString()}#booking-entry`);
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.locator("[data-hold-token]")).toContainText("Capacity is held for 15 minutes");
  await page.getByRole("button", { name: "Pay securely with Stripe" }).click();
  await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, { timeout: 30_000 });

  await fillCheckoutField(page, /email/i, "#email", "phase6-local@berthio.test");
  const cardPaymentMethod = page.getByRole("button", { name: "Pay with card" });
  if (await cardPaymentMethod.count()) await cardPaymentMethod.evaluate((button: HTMLButtonElement) => button.click());
  await fillCheckoutField(page, /card number/i, "#cardNumber", "4242424242424242");
  await fillCheckoutField(page, /expir/i, "#cardExpiry", "1234");
  await fillCheckoutField(page, /security code|cvc/i, "#cardCvc", "123");
  await fillCheckoutField(page, /cardholder name|name on card/i, "#billingName", "Phase Six Local");
  await fillCheckoutField(page, /^phone number$/i, "#phoneNumber", "+37120000000");

  const country = page.getByLabel(/country or region/i).first();
  if (await country.count()) await country.selectOption("LV");
  const postcode = page.getByLabel(/postal code|zip/i).first();
  if (await postcode.count()) await postcode.fill("LV-1050");
  const agentDisclosure = page.getByRole("checkbox", { name: /AI agent acting on behalf/i });
  if (await agentDisclosure.count()) {
    await agentDisclosure.evaluate((checkbox: HTMLInputElement) => checkbox.click());
  }

  await page.getByRole("button", { name: /pay/i }).last().click();
  await page.waitForURL(/\/marina\/marina-a\/checkout\/return\?session_id=cs_test_/, { timeout: 60_000 });
  const sessionId = new URL(page.url()).searchParams.get("session_id");
  expect(sessionId).toMatch(/^cs_test_[A-Za-z0-9_]+$/);
  await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("No specific berth has been assigned by this confirmation.")).toBeVisible();
  const bookingReference = (await page.locator(".checkout-confirmation-grid dd").first().textContent())?.trim();
  expect(bookingReference).toMatch(/^BK-[A-Z0-9]{10}$/);

  const adminEmail = process.env.E2E_MARINA_EMAIL;
  const adminPassword = process.env.E2E_MARINA_PASSWORD;
  expect(adminEmail, "E2E_MARINA_EMAIL is required for the admin visibility assertion").toBeTruthy();
  expect(adminPassword, "E2E_MARINA_PASSWORD is required for the admin visibility assertion").toBeTruthy();
  await page.goto("/login");
  await page.getByLabel("Email").fill(adminEmail!);
  await page.getByLabel("Password").fill(adminPassword!);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/dashboard/bookings");
  const bookingRow = page.getByRole("row").filter({ hasText: bookingReference! });
  await expect(bookingRow).toContainText("Online · paid");
  await expect(bookingRow).toContainText("Confirmed");
  console.log(`PHASE6_SESSION_ID=${sessionId}`);
});

async function fillCheckoutField(page: import("@playwright/test").Page, label: RegExp, selector: string, value: string) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      const labelled = frame.getByLabel(label).first();
      if (await labelled.count()) {
        await labelled.fill(value);
        return;
      }
      const selected = frame.locator(selector).first();
      if (await selected.count()) {
        await selected.fill(value);
        return;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`Stripe Checkout field was not available: ${label}`);
}
