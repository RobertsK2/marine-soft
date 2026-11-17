// Local-only HTTP fixtures exercise the real Next routes and Supabase query
// builder. These do not replace the database/webhook integration suite.
import http from "node:http";
import { spawn } from "node:child_process";
const marinaId = "10000000-0000-4000-8000-000000000001";
const snapshot = { version: 1, currency: "EUR", totalMinor: 17908, accommodationMinor: 14000, mandatoryFeesMinor: 800, taxMinor: 3108, taxBehavior: "exclusive", taxRateBps: 2100 };
const marina = { id: marinaId, name: "Test Harbour Ādaži", slug: "test-harbour", timezone: "Europe/Riga", is_public: true, contact_email: "harbour@example.test", contact_phone: "+37120000000", cover_image_url: "https://fixture.berthio.test/harbour.svg", logo_url: null, primary_color: "#073bcb", accepts_online_payment: true, accepts_pay_at_marina: false };
const guestTimes = new Map();
const guestId = suffix => `30000000-0000-4000-8000-0000000000${suffix}`;
const guestSuffixes = ["01", "11", "12", "13", "14", "15", "16"];
const guestRecord = suffix => ({ id: guestId(suffix), marina_id: marinaId, booking_payment_id: ["01", "15"].includes(suffix) ? "cs_test_paid" : null, price_snapshot: snapshot });
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:54329");
  if (url.pathname === "/cover.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="280"><rect width="1000" height="280" fill="#698ca2"/><path d="M0 230L1000 150M100 0L220 280M400 0L520 280M700 0L820 280" stroke="#c6ced2" stroke-width="20"/></svg>');
  }
  let data = [];
  if (url.pathname === "/rest/v1/marinas") {
    const slug = url.searchParams.get("slug") ?? (url.searchParams.get("id") === `eq.${marinaId}` ? "eq.test-harbour" : null);
    data = slug === "eq.test-harbour" ? [marina] : slug === "eq.marina-a" ? [{ ...marina, slug: "marina-a" }] : slug === "eq.payment-options" ? [{ ...marina, slug: "payment-options", accepts_pay_at_marina: true }] : slug === "eq.pay-at-marina-only" ? [{ ...marina, slug: "pay-at-marina-only", accepts_online_payment: false, accepts_pay_at_marina: true }] : slug === "eq.no-contact" ? [{ ...marina, slug: "no-contact", contact_email: null, contact_phone: null, website_url: null }] : [];
  } else if (url.pathname === "/rest/v1/booking_payments") {
    const session = url.searchParams.get("stripe_checkout_session_id")?.replace(/^eq\./, "");
    if (url.searchParams.get("marina_id") !== `eq.${marinaId}`) { res.writeHead(403); return res.end('{}'); }
    if (["cs_test_paid", "cs_test_paid_morning", "cs_test_paid_unspecified", "cs_test_pending", "cs_test_failed", "cs_test_cancelled"].includes(session)) data = [{ id: session, status: session === "cs_test_pending" ? "pending" : session === "cs_test_failed" ? "failed" : "paid", amount_total_minor: 17908, currency: "EUR", paid_at: session.startsWith("cs_test_paid") ? "2027-05-01T10:00:00Z" : null, price_snapshot: snapshot }];
  } else if (url.pathname === "/rest/v1/bookings") {
    const payment = url.searchParams.get("booking_payment_id");
    if (!payment) {
      const suffix = url.searchParams.get("id")?.slice(-2);
      if (guestSuffixes.includes(suffix)) data = [guestRecord(suffix)];
    } else if (url.searchParams.get("marina_id") !== `eq.${marinaId}`) { res.writeHead(403); return res.end('{}'); }
    if (["eq.cs_test_paid", "eq.cs_test_paid_morning", "eq.cs_test_paid_unspecified", "eq.cs_test_cancelled"].includes(payment)) data = [{ id: "20000000-0000-4000-8000-000000000001", reference: "BK-TEST-8492", arrival_date: "2027-05-24", departure_date: "2027-05-28", eta: ["eq.cs_test_paid_morning", "eq.cs_test_paid_unspecified"].includes(payment) ? null : "12:00:00", etd: ["eq.cs_test_paid_morning", "eq.cs_test_paid_unspecified"].includes(payment) ? null : "11:00:00", eta_window: payment === "eq.cs_test_paid_morning" ? "morning" : null, vessel_name: "Jūras vējš IV", vessel_length_m: 11.5, vessel_beam_m: 3.8, vessel_draft_m: 1.6, status: payment === "eq.cs_test_cancelled" ? "cancelled" : "confirmed" }];
  } else if (url.pathname === "/rest/v1/guest_booking_access_grants") {
    const suffix = url.searchParams.get("id")?.slice(-2);
    if (guestSuffixes.includes(suffix)) data = [{ booking_id: guestId(suffix) }];
  } else if (url.pathname === "/rest/v1/booking_payment_balances") {
    const suffix = url.searchParams.get("booking_id")?.slice(-2);
    const paid = suffix === "13" ? 5000 : ["14", "15", "01"].includes(suffix) ? 17908 : 0;
    data = [{ total_due_minor: 17908, paid_minor: paid, balance_due_minor: 17908 - paid, currency: "EUR" }];
  } else if (url.pathname === "/rest/v1/berths") {
    data = [{ id: "40000000-0000-4000-8000-000000000001", marina_id: marinaId, code: "T1", priority: 1, status: "available", allow_smaller_vessels: true, max_length_m: 30, max_beam_m: 8, max_draft_m: 5 }];
  } else if (url.pathname === "/rest/v1/marina_pricing_configs") {
    data = [{ currency: "EUR", model: "per_meter", tax_behavior: "exclusive", tax_rate_bps: 2100 }];
  } else if (url.pathname === "/rest/v1/pricing_seasons") {
    data = [{ id: "season-fixture", name: "Test season", starts_on: "2026-01-01", ends_on: "2029-12-31" }];
  } else if (url.pathname === "/rest/v1/pricing_season_meter_rates") {
    data = [{ season_id: "season-fixture", nightly_rate_per_meter_minor: 300 }];
  } else if (url.pathname === "/rest/v1/rpc/allow_public_availability_check") {
    data = true;
  } else if (url.pathname === "/rest/v1/rpc/confirm_pay_at_marina_booking") {
    data = [{ outcome: "confirmed", booking_id: guestId("12") }];
  } else if (url.pathname === "/rest/v1/rpc/ensure_guest_booking_access") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    data = [{ grant_id: body.target_booking_id === guestId("12") ? guestId("12") : guestId("01"), expires_at: "2030-01-01T00:00:00Z" }];
  } else if (url.pathname === "/rest/v1/rpc/get_guest_booking") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const suffix = body.target_grant_id.slice(-2);
    if (guestSuffixes.includes(suffix)) {
      const paid = suffix === "13" ? 5000 : ["01", "14", "15"].includes(suffix) ? 17908 : 0;
      data = [{ booking_reference: "BK-TEST-8492", marina_name: marina.name, arrival_date: "2027-05-24", departure_date: "2027-05-28", eta: null, etd: null, eta_window: suffix === "11" ? "morning" : null, vessel_name: "Jūras vējš IV", vessel_length_m: 11.5, vessel_beam_m: 3.8, vessel_draft_m: 1.6, price_total_minor: 17908, price_currency: "EUR", balance_due_minor: 17908 - paid, collection_method: ["01", "15"].includes(suffix) ? "berthio" : "on_site", booking_status: suffix === "16" ? "cancelled" : "confirmed", access_expires_at: "2030-01-01T00:00:00Z", ...guestTimes.get(body.target_grant_id) }];
    }
  } else if (url.pathname === "/rest/v1/rpc/update_guest_booking_times") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    data = guestSuffixes.includes(body.target_grant_id.slice(-2)) && !body.target_grant_id.endsWith("16");
    if (data) guestTimes.set(body.target_grant_id, { eta: body.requested_eta, etd: body.requested_etd });
  } else if (!["/rest/v1/booking_berth_assignments", "/rest/v1/notification_outbox", "/rest/v1/booking_holds", "/rest/v1/pricing_season_length_rates", "/rest/v1/marina_mandatory_fees"].includes(url.pathname)) {
    res.writeHead(404); return res.end('{}');
  }
  res.writeHead(200, { "Content-Type": "application/json", ...(Array.isArray(data) ? { "Content-Range": `0-${Math.max(0, data.length - 1)}/${data.length}` } : {}) });
  res.end(JSON.stringify(data));
});
await new Promise(resolve => server.listen(54329, "127.0.0.1", resolve));
const next = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--port", "3110"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54329", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "fixture-public-key", SUPABASE_SECRET_KEY: "fixture-secret-key", GUEST_ACCESS_SIGNING_SECRET: "fixture-signing-secret-at-least-32-characters", NEXT_PUBLIC_SITE_URL: "http://localhost:3110", NEXT_PUBLIC_SENTRY_DSN: "", NEXT_PUBLIC_POSTHOG_KEY: "", SENTRY_AUTH_TOKEN: "", STRIPE_SECRET_KEY: "", STRIPE_CONNECT_WEBHOOK_SECRET: "", NEXT_TELEMETRY_DISABLED: "1" },
});
function stop() { next.kill("SIGTERM"); server.close(); }
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
next.on("exit", code => { server.close(); process.exitCode = code ?? 0; });
