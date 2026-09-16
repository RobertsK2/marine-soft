# M5.5 — Staging and Environment Setup

## Goal

Create a real cloud environment that behaves like production closely enough to expose deployment problems before a customer does.

Local Docker is not sufficient evidence for a pilot launch.

## Environment model

Maintain intentional separation between staging and production for at least:

- Supabase;
- Vercel deployment/environment;
- Stripe mode/account configuration;
- Postmark server/stream/sender as appropriate;
- notification worker secret/scheduler configuration;
- Sentry project/environment;
- PostHog project/environment if enabled.

Never copy `.env.local` wholesale into cloud deployment settings.

## Step 1 — Create staging Supabase

Set up a dedicated staging project.

Then:

1. apply migrations from the repo in order;
2. verify migration history;
3. configure auth URLs/redirects for the staging domain;
4. configure required storage policies if applicable;
5. create only staging users/test data;
6. verify RLS and service-role separation.

## Step 2 — Deploy staging app

Deploy the exact intended branch/revision to a stable staging URL.

Configure environment variables through the deployment platform’s secret store.

At minimum verify configuration for:

- public Supabase URL/key;
- server Supabase secret credential;
- site URL/origin;
- guest access signing secret;
- Stripe test secret/publishable keys;
- Stripe Connect webhook secret;
- local Stripe fallback disabled;
- Postmark staging credentials;
- notification worker secret;
- scheduler declaration only after it has been exercised;
- Sentry DSN/environment;
- PostHog values if enabled.

Do not print credential values in evidence files.

## Step 3 — Load realistic pilot data

Use a representative marina rather than toy fixtures.

Include:

- marina profile and IANA timezone;
- real-ish berth codes/zones;
- vessel dimension limits;
- availability/service statuses;
- pricing/seasons/mandatory fees/VAT;
- cancellation policy;
- payment-method configuration;
- representative bookings;
- outstanding balance/pay-at-marina example;
- cancellation/history examples;
- notification history as appropriate.

## Step 4 — Verify all admin routes in cloud

Test as marina admin and staff where applicable:

- login/session persistence;
- Overview;
- Bookings list/detail/create;
- Berths inventory/detail/add/import;
- Berth Map;
- Payments;
- Settings pages;
- Publishing;
- Audit Log.

The goal is not pixel perfection. Look for server action, environment, cookie, routing, auth, database, and provider differences from local development.

## Step 5 — Verify public booking in cloud

Test desktop and mobile:

- public marina URL;
- availability;
- valid/invalid vessel dimensions;
- unavailable dates;
- online payment configuration;
- pay-at-marina configuration;
- both methods;
- booking confirmation;
- guest access links where implemented.

## Step 6 — Create environment inventory

Keep a private environment register containing:

- environment name;
- domain;
- Supabase project;
- Stripe mode/account setup;
- Postmark server/stream;
- scheduler owner;
- Sentry project;
- backup owner;
- deployment owner;
- date last verified.

Do not store secrets in the register.

## Exit criteria

- [ ] staging app is deployed from repository code;
- [ ] staging has its own Supabase project;
- [ ] migrations apply cleanly;
- [ ] auth redirects work on real HTTPS domain;
- [ ] realistic marina data is present;
- [ ] admin cloud smoke test passes;
- [ ] public booking cloud smoke test passes;
- [ ] Stripe local platform fallback is disabled in staging;
- [ ] staging secrets are not production secrets;
- [ ] environment inventory exists without credential values.
