import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { resetLocalAdminFactors } from "./helpers/admin-mfa";

test.use({ trace: "off", screenshot: "off", video: "off" });

function totp(secret: string, offsetSteps = 0) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits -= 8)) & 255); }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("marina admin enrolls MFA before dashboard access and keeps AAL2 after refresh", async ({ page }, testInfo) => {
  test.skip(!process.env.E2E_SUPABASE_READY || process.env.BERTHIO_REQUIRE_ADMIN_MFA !== "true", "Local MFA policy verification required.");
  if (testInfo.project.name === "mobile") await page.setViewportSize({ width: 320, height: 740 });
  await resetLocalAdminFactors();
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(process.env.E2E_MARINA_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/mfa\?/);
  await page.goto("/dashboard/settings/pricing");
  await expect(page).toHaveURL(/\/mfa\?next=%2Fdashboard%2Fsettings%2Fpricing/);
  await expect(page.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();
  await expect(page.getByAltText("Authenticator setup QR code")).toBeVisible();
  const secret = (await page.locator("main code").textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  const codeInput = page.getByRole("textbox", { name: "Authenticator code" });
  const group = codeInput.locator("..");
  const slots = group.locator("[aria-hidden=true]");
  await expect(slots).toHaveCount(6);
  await expect(codeInput).toHaveAccessibleDescription("Enter the six-digit code from your authenticator app.");
  await expect(codeInput).toHaveAttribute("inputmode", "numeric");
  await expect(codeInput).toHaveAttribute("autocomplete", "one-time-code");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("button", { name: "Copy manual setup key" }).focus();
  await page.keyboard.press("Tab");
  await expect(codeInput).toBeFocused();
  await expect(group).toHaveCSS("outline-style", "none");
  await expect(slots.nth(0)).toHaveCSS("outline-color", "rgb(7, 80, 237)");
  for (let index = 0; index < 6; index++) {
    await codeInput.press(String(index));
    await expect(slots.nth(Math.min(index + 1, 5))).toHaveCSS("outline-style", "solid");
  }
  await expect(codeInput).toHaveValue("012345");
  await expect(slots.nth(4)).toHaveCSS("outline-style", "none");
  await codeInput.press("ArrowLeft");
  await expect(slots.nth(4)).toHaveCSS("outline-style", "solid");
  await codeInput.press("ArrowRight");
  await expect(slots.nth(5)).toHaveCSS("outline-style", "solid");
  await expect(codeInput).toHaveValue("012345");
  if (testInfo.project.name === "mobile") await slots.nth(1).tap({ force: true });
  else await slots.nth(1).click({ force: true });
  await expect(slots.nth(1)).toHaveCSS("outline-style", "solid");
  await codeInput.press("x");
  await expect(codeInput).toHaveValue("012345");
  await codeInput.press("9");
  await expect(codeInput).toHaveValue("092345");
  await codeInput.fill("12");
  await codeInput.press("Backspace");
  await expect(slots.nth(1)).toHaveCSS("outline-style", "solid");
  await expect(codeInput).toHaveValue("1");

  await codeInput.evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text/plain", "012 345");
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }));
  });
  await expect(codeInput).toHaveValue("012345");
  await expect(slots).toHaveText(["0", "1", "2", "3", "4", "5"]);
  await expect(slots.nth(5)).toHaveCSS("outline-style", "solid");

  const nearbyCodes = [-2, -1, 0, 1, 2].map((offset) => totp(secret, offset));
  let invalidCode = 0;
  while (nearbyCodes.includes(String(invalidCode).padStart(6, "0"))) invalidCode++;
  await codeInput.fill(String(invalidCode).padStart(6, "0"));
  await codeInput.press("Enter");
  await expect(page.getByRole("alert").filter({ hasText: "The code could not be verified" })).toBeVisible();
  await expect(codeInput).toHaveValue("");
  while (Date.now() % 30_000 > 26_000) await new Promise((resolve) => setTimeout(resolve, 500));
  await codeInput.fill(totp(secret));
  await codeInput.press("Enter");
  await expect(page).toHaveURL(/\/dashboard\/settings\/pricing$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Pricing/i }).first()).toBeVisible();
  if (testInfo.project.name === "mobile") return;
  // A protected mutation must also accept the refreshed AAL2 session.
  const taxMode = page.getByLabel("VAT / tax mode");
  const original = await taxMode.inputValue();
  await taxMode.selectOption(original === "exclusive" ? "inclusive" : "exclusive");
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status")).toContainText("Pricing configuration updated");
  await taxMode.selectOption(original);
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status")).toContainText("Pricing configuration updated");
});
