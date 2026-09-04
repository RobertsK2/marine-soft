import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

test("signed guest link shows one safe booking, edits times, and stops after revocation", async ({ page }, testInfo) => {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const signingSecret = process.env.GUEST_ACCESS_SIGNING_SECRET
    ?? process.env.SUPABASE_SECRET_KEY
    ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  test.skip(!secretKey || !signingSecret, "Requires local Supabase and the guest signing secret.");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
    secretKey!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const mobile = testInfo.project.name === "mobile";
  const arrivalDate = mobile ? "2027-04-10" : "2027-04-01";
  const departureDate = mobile ? "2027-04-12" : "2027-04-03";
  const suffix = `${testInfo.project.name}_${Date.now()}`;
  const { data: holdRows, error: holdError } = await supabase.rpc("create_booking_hold", {
    target_marina_id: "d1000000-0000-4000-8000-000000000001",
    request_idempotency_key: crypto.randomUUID(),
    requested_arrival: arrivalDate,
    requested_departure: departureDate,
    requested_eta: "14:00",
    requested_etd: "10:00",
    requested_vessel_name: `Guest Link ${testInfo.project.name}`,
    requested_length_m: 12,
    requested_beam_m: 3.7,
    requested_draft_m: 2.1,
    calculated_price_currency: "EUR",
    calculated_price_total_minor: 5000,
    calculated_price_snapshot: { version: 1, currency: "EUR", totalMinor: 5000, arrivalDate, departureDate, vesselLengthM: 12 },
    request_session_hash: "1".repeat(64),
    request_network_hash: "2".repeat(64),
  });
  expect(holdError).toBeNull();
  const holdToken = holdRows![0].hold_token!;
  const { data: prepared, error: prepareError } = await supabase.rpc("prepare_booking_checkout", { target_hold_token: holdToken });
  expect(prepareError).toBeNull();
  const paymentId = prepared![0].payment_id!;
  const sessionId = `cs_test_guest_${suffix}`;
  expect((await supabase.rpc("attach_booking_checkout_session", { target_payment_id: paymentId, target_session_id: sessionId })).error).toBeNull();
  const { data: outcome, error: eventError } = await supabase.rpc("process_stripe_checkout_event", {
    target_event_id: `evt_guest_${suffix}`,
    target_event_type: "checkout.session.completed",
    target_stripe_account_id: "acct_testmarinaa",
    target_session_id: sessionId,
    target_payment_intent_id: `pi_guest_${suffix}`,
    target_payment_status: "paid",
    target_amount_total_minor: 5000,
    target_currency: "eur",
    target_hold_token: holdToken,
    target_customer_name: "Guest Link Customer",
    target_customer_email: `guest-link-${suffix}@example.test`,
    target_customer_phone: "+37120000003",
  });
  expect(eventError).toBeNull();
  expect(outcome).toBe("confirmed");
  const { data: booking } = await supabase.from("bookings").select("id, reference").eq("booking_payment_id", paymentId).single();
  const { data: grants, error: grantError } = await supabase.rpc("ensure_guest_booking_access", { target_booking_id: booking!.id });
  expect(grantError).toBeNull();
  const grant = grants![0];
  const payload = Buffer.from(JSON.stringify({ g: grant.grant_id, e: Math.floor(Date.parse(grant.expires_at) / 1000) })).toString("base64url");
  const signature = createHmac("sha256", signingSecret!).update(`v1.${payload}`).digest("base64url");
  const token = `v1.${payload}.${signature}`;

  await page.goto(`/guest/bookings/${encodeURIComponent(token)}`);
  await expect(page.getByRole("heading", { name: "Marina A" })).toBeVisible();
  await expect(page.getByText(booking!.reference, { exact: true })).toBeVisible();
  await expect(page.getByText("Paid · €50.00")).toBeVisible();
  await expect(page.getByText(/guest-link-.*@example\.test/)).toHaveCount(0);

  await page.getByRole("textbox", { name: "ETA", exact: true }).fill("16:15");
  await page.getByRole("textbox", { name: "ETD", exact: true }).fill("08:45");
  await page.getByRole("button", { name: "Update ETA / ETD" }).click();
  await expect(page.getByText("Arrival and departure times updated.")).toBeVisible();
  await expect(page.getByText("16:15 / 08:45")).toBeVisible();

  expect((await supabase.rpc("revoke_guest_booking_access", { target_grant_id: grant.grant_id })).data).toBe(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Link unavailable" })).toBeVisible();
});
