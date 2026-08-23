import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("Local Supabase URL and secret key are required.");

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
};

const results = await Promise.all(clients.map((client, index) => client.rpc("create_booking_hold", {
  ...request,
  request_idempotency_key: randomUUID(),
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

console.log("PASS: concurrent last-capacity race produced one created hold and one unavailable result; winner released.");
