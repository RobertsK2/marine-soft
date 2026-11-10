import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Local Supabase URL and secret key are required.");
if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("Concurrency tests require local Supabase.");
const runKeys = [];
function idempotencyKey() {
  const key = randomUUID();
  runKeys.push(key);
  return key;
}

const clients = [0, 1].map(() => createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
}));
const request = {
  target_marina_id: "d1000000-0000-4000-8000-000000000001",
  requested_arrival: "2026-11-10",
  requested_departure: "2026-11-12",
  requested_eta: "14:00",
  requested_etd: "10:00",
  requested_length_m: 19,
  requested_beam_m: 5.8,
  requested_draft_m: 3.1,
  calculated_price_currency: "EUR",
  calculated_price_total_minor: 10000,
  calculated_price_snapshot: {
    version: 1, currency: "EUR", totalMinor: 10000,
    arrivalDate: "2026-11-10", departureDate: "2026-11-12", vesselLengthM: 19,
  },
  // Isolate separate test runs while all racers within this run share quotas.
  request_session_hash: randomBytes(32).toString("hex"),
  request_network_hash: randomBytes(32).toString("hex"),
};

try {
  const results = await Promise.all(clients.map((client, index) => client.rpc("create_booking_hold", {
    ...request,
    request_idempotency_key: idempotencyKey(),
    requested_vessel_name: `Concurrent racer ${index + 1}`,
  })));
  for (const result of results) assert.equal(result.error, null);
  const rows = results.map((result) => result.data?.[0]);
  assert.deepEqual(rows.map((row) => row?.outcome).sort(), ["created", "unavailable"]);

  const winner = rows.find((row) => row?.outcome === "created");
  assert.ok(winner?.hold_token);
  const release = await clients[0].rpc("release_booking_hold_after_checkout_failure", {
    target_hold_token: winner.hold_token,
  });
  assert.equal(release.error, null);
  assert.equal(release.data, true);

  const quotaResults = await Promise.all(Array.from({ length: 4 }, async (_, index) => {
    const arrivalDay = 1 + index * 3;
    const arrivalDate = `2026-12-${String(arrivalDay).padStart(2, "0")}`;
    const departureDate = `2026-12-${String(arrivalDay + 2).padStart(2, "0")}`;
    return clients[index % clients.length].rpc("create_booking_hold", {
      ...request,
      request_idempotency_key: idempotencyKey(),
      requested_arrival: arrivalDate,
      requested_departure: departureDate,
      requested_vessel_name: `Quota racer ${index + 1}`,
      calculated_price_snapshot: {
        ...request.calculated_price_snapshot,
        arrivalDate,
        departureDate,
      },
    });
  }));
  const quotaRows = quotaResults.map((result) => result.data?.[0]);
  try {
    for (const result of quotaResults) assert.equal(result.error, null);
    assert.deepEqual(quotaRows.map((row) => row?.outcome).sort(), ["created", "created", "rate_limited", "rate_limited"]);
  } finally {
    for (const row of quotaRows.filter((candidate) => candidate?.hold_token)) {
      const cleanup = await clients[0].rpc("release_booking_hold_after_checkout_failure", { target_hold_token: row.hold_token });
      assert.equal(cleanup.error, null);
    }
  }

  const marina = await clients[0].from("marinas").select("accepts_online_payment,accepts_pay_at_marina").eq("id", request.target_marina_id).single();
  assert.equal(marina.error, null);
  const bookingIds = [];
  try {
    const enabled = await clients[0].from("marinas").update({ accepts_online_payment: true, accepts_pay_at_marina: true }).eq("id", request.target_marina_id);
    assert.equal(enabled.error, null);
    const payLater = {
      ...request,
      requested_arrival: "2027-04-10", requested_departure: "2027-04-12",
      requested_eta: null, requested_etd: null, requested_eta_window: "morning",
      calculated_price_snapshot: { ...request.calculated_price_snapshot, arrivalDate: "2027-04-10", departureDate: "2027-04-12" },
      request_session_hash: randomBytes(32).toString("hex"), request_network_hash: randomBytes(32).toString("hex"),
      requested_customer_name: "Capacity Guest", requested_customer_email: "capacity@example.test", requested_customer_phone: "+37120000000",
    };
    const attempts = clients.map((_, index) => ({ ...payLater, request_idempotency_key: idempotencyKey(), requested_vessel_name: `Pay later racer ${index + 1}` }));
    const races = await Promise.all(clients.map((client, index) => client.rpc("confirm_pay_at_marina_booking", attempts[index])));
    for (const race of races) if (race.data?.[0]?.booking_id) bookingIds.push(race.data[0].booking_id);
    for (const race of races) assert.equal(race.error, null);
    assert.deepEqual(races.map(race => race.data?.[0]?.outcome).sort(), ["confirmed", "unavailable"]);
    const winnerIndex = races.findIndex(race => race.data?.[0]?.outcome === "confirmed");
    const winnerId = races[winnerIndex].data[0].booking_id;
    const retries = await Promise.all(clients.map(client => client.rpc("confirm_pay_at_marina_booking", attempts[winnerIndex])));
    for (const retry of retries) {
      assert.equal(retry.error, null);
      assert.deepEqual(retry.data, [{ outcome: "existing", booking_id: winnerId }]);
    }
    const booking = await clients[0].from("bookings").select("status,eta,etd,eta_window,booking_payment_id,price_total_minor").eq("id", winnerId).single();
    assert.equal(booking.error, null);
    assert.deepEqual(booking.data, { status: "confirmed", eta: null, etd: null, eta_window: "morning", booking_payment_id: null, price_total_minor: 10000 });
    const balance = await clients[0].from("booking_payment_balances").select("state,collection_method,paid_minor,balance_due_minor,due_at").eq("booking_id", winnerId).single();
    assert.equal(balance.error, null);
    assert.deepEqual(balance.data, { state: "balance_due", collection_method: "on_site", paid_minor: 0, balance_due_minor: 10000, due_at: null });
    const online = await clients[1].rpc("create_booking_hold", {
      ...request, request_idempotency_key: idempotencyKey(), requested_vessel_name: "Online after pay later",
      requested_arrival: payLater.requested_arrival, requested_departure: payLater.requested_departure,
      calculated_price_snapshot: payLater.calculated_price_snapshot,
      request_session_hash: randomBytes(32).toString("hex"), request_network_hash: randomBytes(32).toString("hex"),
    });
    assert.equal(online.error, null);
    assert.equal(online.data?.[0]?.outcome, "unavailable", "Confirmed unpaid booking blocks online demand immediately.");
    const holds = await clients[0].from("booking_holds").select("id").in("idempotency_key", attempts.map(attempt => attempt.request_idempotency_key));
    assert.equal(holds.error, null);
    const payments = await clients[0].from("booking_payments").select("id").in("hold_id", holds.data.map(hold => hold.id));
    assert.equal(payments.error, null);
    assert.deepEqual(payments.data, [], "Pay at Marina creates no Stripe payment rows.");
  } finally {
    if (bookingIds.length) {
      const balances = await clients[0].from("booking_payment_balances").delete().in("booking_id", bookingIds);
      assert.equal(balances.error, null);
      const bookings = await clients[0].from("bookings").delete().in("id", bookingIds);
      assert.equal(bookings.error, null);
    }
    const restored = await clients[0].from("marinas").update(marina.data).eq("id", request.target_marina_id);
    assert.equal(restored.error, null);
  }
  console.log("PASS: hold quotas, Pay at Marina capacity races, idempotent retries, and shared online capacity stayed protected.");
} finally {
  const cleanup = await clients[0].from("booking_holds").delete().in("idempotency_key", runKeys);
  assert.equal(cleanup.error, null, "All holds created by this run must be cleaned up, including failed races.");
}
