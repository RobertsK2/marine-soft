import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

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
  return ((digest.readUInt32BE(digest[digest.length - 1] & 15) & 0x7fffffff) % 1_000_000)
    .toString().padStart(6, "0");
}

test("direct Data API and SECURITY DEFINER RPC deny AAL1 admin and allow AAL2", async ({}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium" || !process.env.E2E_SUPABASE_READY ||
    process.env.BERTHIO_REQUIRE_ADMIN_MFA !== "true", "Local Supabase MFA verification required.");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: "admin-b@berthio.test", password: process.env.E2E_MARINA_PASSWORD!,
  });
  expect(loginError).toBeNull();
  expect((await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal1");
  const aal1Token = (await supabase.auth.getSession()).data.session!.access_token;

  const marinaId = "e1000000-0000-4000-8000-000000000002";
  const organizationId = "e0000000-0000-4000-8000-000000000002";
  const aal1Organization = await supabase.from("organizations").select("id").eq("id", organizationId);
  expect(aal1Organization.error).toBeNull();
  expect(aal1Organization.status).toBe(200);
  expect(aal1Organization.data).toEqual([]);
  const aal1Berths = await supabase.from("berths").select("id").eq("marina_id", marinaId);
  expect(aal1Berths.error).toBeNull();
  expect(aal1Berths.data).toEqual([]);
  const aal1Health = await supabase.rpc("get_marina_integration_health", { target_marina_id: marinaId });
  expect(aal1Health.error?.code).toBe("42501");
  expect(aal1Health.status).toBe(403);
  const deniedUpdate = await supabase.from("organizations").update({ name: "MFA denied" }).eq("id", organizationId).select("id");
  expect(deniedUpdate.error).toBeNull();
  expect(deniedUpdate.data).toEqual([]);
  const deniedInsert = await supabase.from("berths").insert({
    marina_id: marinaId, code: "MFA-DENIED", max_length_m: 8, max_beam_m: 3, max_draft_m: 2,
  });
  expect(deniedInsert.error?.code).toBe("42501");
  expect(deniedInsert.status).toBe(403);

  const { data: factor, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  expect(enrollError).toBeNull();
  expect(factor?.totp?.secret).toBeTruthy();
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
    factorId: factor!.id, code: totp(factor!.totp!.secret),
  });
  expect(verifyError).toBeNull();
  expect((await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal2");

  const aal2Organization = await supabase.from("organizations").select("id").eq("id", organizationId);
  expect(aal2Organization.error).toBeNull();
  expect(aal2Organization.data).toHaveLength(1);
  const aal2Berths = await supabase.from("berths").select("id").eq("marina_id", marinaId);
  expect(aal2Berths.error).toBeNull();
  expect(aal2Berths.data!.length).toBeGreaterThan(0);
  const aal2Health = await supabase.rpc("get_marina_integration_health", { target_marina_id: marinaId });
  expect(aal2Health.error).toBeNull();
  expect(aal2Health.status).toBe(200);
  expect(aal2Health.data).toHaveLength(1);
  const allowedUpdate = await supabase.from("organizations").update({ name: "Marina B" }).eq("id", organizationId).select("id");
  expect(allowedUpdate.error).toBeNull();
  expect(allowedUpdate.data).toHaveLength(1);
  expect((await supabase.auth.refreshSession()).error).toBeNull();
  expect((await supabase.auth.mfa.getAuthenticatorAssuranceLevel()).data?.currentLevel).toBe("aal2");
  expect((await supabase.from("organizations").select("id").eq("id", organizationId)).data).toHaveLength(1);

  // Enrollment must not retroactively authorize the earlier password-only token.
  const staleSession = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${aal1Token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect((await staleSession.from("organizations").select("id").eq("id", organizationId)).data).toEqual([]);
  expect((await staleSession.rpc("get_marina_integration_health", { target_marina_id: marinaId })).error?.code).toBe("42501");

  const staff = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error: staffLoginError } = await staff.auth.signInWithPassword({
    email: process.env.E2E_MARINA_STAFF_EMAIL!, password: process.env.E2E_MARINA_PASSWORD!,
  });
  expect(staffLoginError).toBeNull();
  const staffBerths = await staff.from("berths").select("id").eq("marina_id", "d1000000-0000-4000-8000-000000000001");
  expect(staffBerths.error).toBeNull();
  expect(staffBerths.data!.length).toBeGreaterThan(0);
  expect((await staff.rpc("get_marina_integration_health", { target_marina_id: "d1000000-0000-4000-8000-000000000001" })).error?.code).toBe("42501");
});
