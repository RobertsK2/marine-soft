# Milestone 4 Pilot Operations Runbook

This runbook is the deployment-side verification companion to
`07_PILOT_VERIFICATION.md`. It documents existing Berthio behavior; it does not
add a scheduler, provider account, backup service, or product feature.

## Environment separation

Use separate Supabase, Stripe, Postmark, Sentry, and PostHog projects for staging
and production. Store server credentials in the deployment platform's secret
store and restrict access to the application or scheduler that consumes them.
Do not copy `.env.local` into a deployment or commit generated environment files.

| Setting | Staging | Production | Exposure |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Staging project URL | Production project URL | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Staging publishable key | Production publishable key | Browser-safe |
| `SUPABASE_SECRET_KEY` | Staging secret key | Production secret key | Server secret |
| `NEXT_PUBLIC_SITE_URL` | Staging HTTPS origin | Production HTTPS origin | Browser-safe |
| `GUEST_ACCESS_SIGNING_SECRET` | Unique 32+ byte value | Different unique 32+ byte value | Server secret |
| `STRIPE_SECRET_KEY` | Restricted test key where possible | Restricted live key where possible | Server secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Test publishable key | Live publishable key | Browser-safe |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | Staging endpoint secret | Production endpoint secret | Server secret |
| `STRIPE_LOCAL_PLATFORM_FALLBACK` | `false` | `false` | Non-secret |
| `POSTMARK_SERVER_TOKEN` | Staging/test server token | Production server token | Server secret |
| `POSTMARK_FROM_EMAIL` | Verified staging sender | Verified production sender | Non-secret |
| `POSTMARK_MESSAGE_STREAM` | Staging stream | Production transactional stream | Non-secret |
| `NOTIFICATION_WORKER_SECRET` | Unique 32+ byte value | Different unique 32+ byte value | Server secret |
| `NOTIFICATION_WORKER_SCHEDULED` | `true` only after readback | `true` only after readback | Non-secret declaration |
| `NEXT_PUBLIC_SENTRY_DSN` | Staging Sentry project DSN | Production Sentry project DSN | Browser-safe DSN |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional staging project key | Optional production project key | Browser-safe project key |
| `NEXT_PUBLIC_POSTHOG_HOST` | Approved regional host | Approved regional host | Browser-safe |

Before publishing, an administrator must review **Settings → Integrations** and
**Settings → Publishing** in the target deployment. Production must report live
Stripe mode, a real marina Connect account, a signed webhook, configured
Postmark delivery, and a protected scheduled worker. A warning is not evidence
that an external provider or scheduler was exercised.

## Provider readback

1. Confirm the Stripe key modes match and the local fallback is false.
2. Confirm the production webhook endpoint is enabled for the connected-account
   events used by Berthio. Send a provider test event and verify a matched event
   appears in tenant-scoped integration health without logging its signing secret.
3. Confirm the Postmark sender and message stream are verified. Exercise delivery
   with a non-customer pilot booking and verify a provider message ID is recorded.
4. Configure the external scheduler to `POST` to `/api/notifications/process`
   with its bearer secret. Verify a successful invocation in scheduler logs and
   Berthio health before setting `NOTIFICATION_WORKER_SCHEDULED=true`.
5. If Sentry is configured, send one controlled staging exception and confirm it
   reaches the correct project/environment with PII disabled. If PostHog is
   enabled, exercise one existing typed event and confirm the approved regional
   project receives no unintended personal properties.

Never paste credential values into tickets, chat, screenshots, logs, or this
runbook. Rotate a credential immediately if it is exposed.

## Backup and restore verification

Production backups are owned by the Supabase project and must be configured and
retained according to the pilot agreement. Before opening the pilot:

1. Record the project, backup schedule, retention, encryption, and recovery owner
   in the private operations system.
2. Create an on-demand backup without changing the live database.
3. Restore it into a new, isolated verification project—not over staging or
   production.
4. Verify migration history and counts for `marinas`, `berths`, `bookings`,
   `booking_payments`, `audit_events`, and `notification_outbox`.
5. Sign in with a verification-only user and confirm tenant isolation, one
   booking detail, its immutable price snapshot, audit history, and notification
   history. Do not deliver restored notifications.
6. Delete the isolated restore after recording the date, duration, result, and
   approver. The evidence belongs in the private operations system because it
   contains deployment and customer context.

For a local feasibility drill, create a custom-format `pg_dump` of the
application schemas (`public`, `private`, `auth`, `storage`, `extensions`, and
`supabase_migrations`). Restore it into a newly named temporary database in the
same local container in three sections: pre-data, data, then post-data. Install
`btree_gist` into the restored `extensions` schema after pre-data and before
post-data so the booking exclusion constraints can be recreated. Compare the
table counts above, and then drop only that explicit temporary database. Do not
treat a raw full-cluster dump of Supabase-managed schemas such as Realtime as an
application restore, and never use a restore command against an existing staging
or production database.

## Release gate

Run `npm run verify`, both concurrency scripts, the complete seeded E2E suite,
Supabase schema lint and both security/performance advisors, and
`npm run verify:secrets`. Confirm `git diff --check`, repository status, and CI
for the exact revision. Any missing provider readback, scheduler execution,
backup evidence, unresolved security finding, or failing check keeps the pilot
gate closed.
