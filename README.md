# Berthio

Berthio is a tenant-safe marina booking and operations application. It connects the public booking journey with the work marina teams do after a reservation arrives: protecting capacity, collecting payment, assigning a suitable berth, managing the stay, and keeping an accountable operational history.

## What it solves

Marina availability is constrained by dates and vessel dimensions, while the final berth may still need an operational decision. Berthio keeps those concerns together without exposing one marina's data to another: public guests see bookable capacity and pricing, while authenticated staff manage bookings, berths, assignments, payments, audit history, and notifications.

## Product flow

1. A guest selects a marina, stay dates, and vessel dimensions.
2. Berthio checks safe capacity, calculates the price, and protects checkout with a short-lived hold.
3. Stripe Checkout and verified webhooks confirm online bookings; marina staff can also create operational bookings directly.
4. Staff assign or reassign a compatible berth, then record check-in, check-out, extensions, cancellations, outages, and payment state.
5. Append-only audit records and retry-safe Postmark delivery logs preserve the operational history.

## Tech stack

- Next.js 16 App Router, React 19, and TypeScript
- Supabase Auth and PostgreSQL with tenant-scoped Row Level Security and pgTAP tests
- Stripe Connect Checkout and webhook processing
- Postmark transactional email with an outbox-style delivery worker
- Vitest for unit tests and Playwright for browser tests

## Run locally

Prerequisites: Node.js 20.9 or newer and Docker Desktop or another Docker-compatible runtime.

```bash
npm install
cp .env.example .env.local
npm run supabase:start
npm run supabase:reset
npm run dev
```

On PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. Review `.env.local` after Supabase starts and add environment-specific Stripe and Postmark credentials when testing those integrations. Never expose a Supabase secret/service-role key, Stripe secret, webhook secret, or Postmark token through a `NEXT_PUBLIC_` variable.

Open [http://localhost:3000](http://localhost:3000). Local signup is disabled; `npm run test-users:setup` provisions the seeded test identities when authentication testing is needed.

## Verification

With the local Supabase stack running, execute the main repository checks with:

```bash
npm run verify
```

Browser and concurrency suites are available separately through `npm run test:e2e`, `npm run test:hold-concurrency`, and `npm run test:assignment-concurrency`; their local credentials and integration prerequisites are documented in the milestone verification guides.
