# Phase 7 — Pilot Verification and Readiness Checklist

## Goal

Audit Berthio as a controlled-pilot product and fix only verification-required issues. Do not add new product features.

## Pilot Readiness Checklist

### Marina Configuration

- Marina profile is complete.
- IANA timezone is configured.
- Berth inventory is loaded and validated.
- Pricing, seasons, VAT, and mandatory fees are configured.
- Cancellation policy is configured.
- Public page publish state is intentional.

### Integrations

- Stripe production/test environment is explicitly identified.
- Stripe webhook configuration is verified.
- Postmark credentials are configured for the target environment.
- Notification scheduler/worker invocation is configured.
- No secrets are exposed to the client or committed to git.

### Operations

- Public booking succeeds end-to-end.
- Booking appears in admin operations.
- Assignment, check-in, changes, moves, outage handling, cancellation, balance, audit, notifications, and check-out still work.
- Cross-tenant access remains blocked.
- Concurrency protections still pass.

### Production Safety

- Staging and production environment configuration is documented.
- Sentry/error reporting is verified.
- Analytics instrumentation is verified if enabled.
- Backup/restore procedure is documented and tested where feasible.
- CI is green.
- `npm run verify` is green.
- Supabase lint/advisors have no unresolved security warnings.

### Pilot Data

- A realistic demo/pilot marina can be seeded or imported.
- Demo data contains representative bookings, arrivals, occupancy, balances, berth conflicts, cancellations, audit history, and notifications.

## Final Output

Return a full PASS/FAIL checklist and one of:

`MILESTONE 4 — PILOT READINESS PASS`

or

`MILESTONE 4 — PILOT READINESS FAIL`
