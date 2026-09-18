import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) bytes.push((value >>> (bits -= 8)) & 255);
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

/** Keep the shared local fixture in an unenrolled state for each browser scenario. */
export async function resetLocalAdminFactors() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) {
    throw new Error("MFA test factor reset requires local Supabase.");
  }
  const service = createClient(url, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
  const { data: users, error: usersError } = await service.auth.admin.listUsers();
  if (usersError) throw usersError;
  for (const user of users.users.filter((candidate) => candidate.email?.endsWith("@berthio.test"))) {
    const { data: factors, error: factorsError } = await service.auth.admin.mfa.listFactors({ userId: user.id });
    if (factorsError) throw factorsError;
    for (const factor of factors.factors) {
      const { error } = await service.auth.admin.mfa.deleteFactor({ userId: user.id, id: factor.id });
      if (error) throw error;
    }
  }
}

/** Complete the same UI enrollment and challenge required of a real admin. */
export async function completeAdminMfa(page: Page) {
  await expect(page).toHaveURL(/\/(?:mfa\?next=|dashboard(?:\/|$))/);
  if (!new URL(page.url()).pathname.startsWith("/mfa")) return; // Staff remains AAL1.
  await resetLocalAdminFactors();
  await page.reload();
  await page.getByRole("button", { name: "Set up authenticator" }).click();
  const secret = (await page.locator("main code").textContent())?.trim();
  expect(secret).toMatch(/^[A-Z2-7]+$/);
  // Avoid enrolling in the last seconds of a TOTP window.
  while (Date.now() % 30_000 > 26_000) await new Promise((resolve) => setTimeout(resolve, 500));
  await page.getByLabel("Authenticator code").fill(totp(secret!));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/dashboard(?:\/|$)/);
}
