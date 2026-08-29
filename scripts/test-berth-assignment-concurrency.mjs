import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const secret = process.env.SUPABASE_SECRET_KEY;
const password = process.env.BERTHIO_LOCAL_TEST_PASSWORD;
if (!secret || !password) throw new Error("SUPABASE_SECRET_KEY and BERTHIO_LOCAL_TEST_PASSWORD are required.");

const service = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const staff = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const { error: signInError } = await staff.auth.signInWithPassword({
  email: "staff-a@berthio.test",
  password,
});
if (signInError) throw signInError;

const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const offset = Number.parseInt(suffix, 16) % 1_000;
const arrival = new Date(Date.UTC(2040, 0, 1 + offset)).toISOString().slice(0, 10);
const departure = new Date(Date.UTC(2040, 0, 4 + offset)).toISOString().slice(0, 10);
const bookingIds = [randomUUID(), randomUUID()];
const rows = bookingIds.map((id, index) => ({
  id,
  marina_id: "d1000000-0000-4000-8000-000000000001",
  arrival_date: arrival,
  departure_date: departure,
  eta: "14:00",
  etd: "10:00",
  customer_name: `Assignment race ${index + 1}`,
  customer_email: `assignment-race-${suffix}-${index + 1}@example.test`,
  customer_phone: `+37120000${index + 10}`,
  vessel_name: `Race ${index + 1}`,
  vessel_length_m: 8,
  vessel_beam_m: 2.8,
  vessel_draft_m: 1.4,
}));

const { error: insertError } = await service.from("bookings").insert(rows);
if (insertError) throw insertError;

try {
  const results = await Promise.all(bookingIds.map((target_booking_id) => staff.rpc("assign_booking_berth", {
    target_booking_id,
    target_berth_id: "d5000000-0000-4000-8000-000000000001",
  })));
  const rpcError = results.find((result) => result.error)?.error;
  if (rpcError) throw rpcError;
  const outcomes = results.map((result) => result.data?.[0]?.outcome).sort();
  if (JSON.stringify(outcomes) !== JSON.stringify(["assigned", "conflict"])) {
    throw new Error(`Expected one assigned and one conflict outcome, received ${outcomes.join(", ")}.`);
  }
  console.log("PASS: simultaneous assignment race produced one assignment and one conflict.");
} finally {
  await service.from("booking_berth_assignments").delete().in("booking_id", bookingIds);
  await service.from("bookings").delete().in("id", bookingIds);
  await staff.auth.signOut();
}
