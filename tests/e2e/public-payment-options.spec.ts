import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

test.skip(!process.env.BERTHIO_CONFIRMATION_FIXTURES, "Requires isolated HTTP fixtures; does not verify database persistence.");
const query = new URLSearchParams({ arrivalDate: "2027-05-24", departureDate: "2027-05-28", vesselLengthM: "11.5", vesselBeamM: "3.8", vesselDraftM: "1.6", etaWindow: "morning" });
test.beforeEach(async ({ page }) => {
  await page.route("https://fixture.berthio.test/harbour.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="280"><rect width="1000" height="280" fill="#698ca2"/></svg>' }));
});

test("payment options obey marina configuration, default to online, and support keyboard selection", async ({ page }, info) => {
  await page.goto(`/marina/marina-a?${query}`);
  await expect(page.getByRole("group", { name: "Choose how to pay" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Pay at Marina/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue to Payment" })).toBeVisible();

  await page.goto(`/marina/payment-options?${query}`);
  const total = await page.locator("[data-price-total-minor]").getAttribute("data-price-total-minor");
  const online = page.getByRole("radio", { name: "Pay Online Secure card payment via Stripe" });
  const atMarina = page.getByRole("radio", { name: "Pay at Marina Reserve now and pay directly at the marina" });
  await expect(online).toBeChecked();
  await expect(page.getByLabel("Full name")).toBeHidden();
  await online.focus();
  await page.keyboard.press("ArrowRight");
  await expect(atMarina).toBeChecked();
  await expect(page.getByRole("button", { name: "Confirm Booking", exact: true })).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeVisible();
  await expect(page.getByText("The full booking total is due at the marina. No payment is collected now.")).toBeVisible();
  expect(await page.locator("[data-price-total-minor]").getAttribute("data-price-total-minor")).toBe(total);
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
  await page.screenshot({ path: info.outputPath("pay-at-marina-choice-initial.png"), fullPage: true });
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole("button", { name: "Confirm Booking", exact: true })).toHaveCSS("background-color", "rgb(7, 80, 237)");
  }
  await page.screenshot({ path: info.outputPath("pay-at-marina-choice.png"), fullPage: true });
  await online.check();
  await expect(page.getByLabel("Full name")).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue to Payment" })).toBeVisible();

  await page.goto(`/marina/pay-at-marina-only?${query}`);
  await expect(page.getByRole("group", { name: "Choose how to pay" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm Booking", exact: true })).toBeVisible();
});

test("signed guest confirmation shows unpaid balance and optional arrival preference accurately", async ({ page }, info) => {
  for (const suffix of ["11", "12"]) {
    const payload = Buffer.from(JSON.stringify({ g: `30000000-0000-4000-8000-0000000000${suffix}`, e: 1893456000 })).toString("base64url");
    const signature = createHmac("sha256", "fixture-signing-secret-at-least-32-characters").update(`v1.${payload}`).digest("base64url");
    await page.goto(`/guest/bookings/v1.${payload}.${signature}?confirmation=1`);
    await expect(page.getByRole("heading", { name: "Booking confirmed", exact: true })).toBeVisible();
    await expect(page.locator("dd").getByText("Pay at Marina", { exact: true })).toBeVisible();
    await expect(page.getByText("Due at Marina", { exact: true })).toBeVisible();
    await expect(page.getByText(suffix === "11" ? "Morning (06:00–12:00)" : "Not specified", { exact: true }).first()).toBeVisible();
    await expect(page.locator('[name="eta"]')).toHaveValue("");
    await expect(page.locator('[name="etd"]')).toHaveValue("");
    await expect(page.getByText("Paid", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Your reservation is confirmed. Payment will be collected directly by the marina.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("pay-at-marina-confirmation.png"), fullPage: true });
});
