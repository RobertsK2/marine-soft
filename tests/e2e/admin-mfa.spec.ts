import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { resetLocalAdminFactors } from "./helpers/admin-mfa";

function totp(secret: string) {
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
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

test("marina admin enrolls MFA before dashboard access and keeps AAL2 after refresh", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY || process.env.BERTHIO_REQUIRE_ADMIN_MFA !== "true", "Local MFA policy verification required.");
  await resetLocalAdminFactors();
  await page.goto("/login");
  await page.getByLabel("Work Email").fill(process.env.E2E_MARINA_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_MARINA_PASSWORD!);
  await page.getByRole("button", { name: "Sign In", exact: true }).click();
  await expect(page).toHaveURL(/\/mfa\?/);
  await page.goto("/dashboard/settings/pricing");
  await expect(page).toHaveURL(/\/mfa\?next=%2Fdashboard%2Fsettings%2Fpricing/);
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("main code").textContent())!.trim();
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  await page.getByLabel("Authenticator code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings\/pricing$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Pricing/i }).first()).toBeVisible();
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
