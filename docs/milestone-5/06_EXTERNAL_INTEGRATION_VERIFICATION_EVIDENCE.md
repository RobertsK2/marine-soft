# M5.6 external integration verification evidence

Last check: 2026-10-20. Environment:
`https://berthio-staging.vercel.app`. Repository/deployment revision:
`17175dc0cb8fa38ac47b60d2af915ea343ccd8fb` (`main`). Legal work was excluded.

## Stripe Connect — PASS

| Check | Result | Hosted evidence |
| --- | --- | --- |
| Test-mode staging configuration | PASS | Checkout displayed Stripe Sandbox, the session was test-mode, local fallback remained false, and no live-mode artifact was observed. |
| Public checkout and pre-payment state | PASS | Marina A created one active hold and one pending payment, with no booking before payment. |
| Successful test payment | PASS | Stripe accepted the card payment and returned to the canonical staging success route. |
| Signed Connect webhook | PASS | One accepted `checkout.session.completed` event reconciled the attempt with outcome `confirmed`. Missing and invalid signatures return HTTP 400. |
| Booking/payment reconciliation | PASS | One consumed hold, one paid payment, and one confirmed Marina A booking exist; server-side amounts match. |
| Duplicate/idempotency | PASS | After migration `20261019090500_stripe_webhook_duplicate_noop`, Stripe manually resent the exact original provider-signed connected-account event and staging returned HTTP 200. Complete before/after row comparisons prove that the webhook event, payment, booking, and hold records and every timestamp remained unchanged, with exactly one webhook event, one payment, and one booking. |
| Tenant isolation | PASS | Admin A AAL2 can read the test booking; Admin B AAL2 reads zero matching rows. |
| CSP and redirect URLs | PASS | Success/cancel targets use staging; the Checkout/return flow had no CSP, severe console, or network-load errors. |
| Pay at marina | PASS | The temporary both-methods test created a confirmed on-site booking, no Stripe payment/session/API request, and the full balance due with zero paid. Marina A was restored to online-only. |
| Connect readiness | PASS | Stripe API readback in the authenticated test Dashboard reports `charges_enabled=true`, `payouts_enabled=true`, and `details_submitted=true`, with empty `requirements.currently_due` and `requirements.eventually_due` arrays. Marina A is ready for pilot test-mode Connect flows. |

No secrets, session values, provider identifiers, booking references, payment IDs,
webhook IDs, or customer data are retained in this evidence file.

## Remaining M5.6 work

None. Stripe, Resend, recurring notification scheduling, and Sentry have current
hosted staging evidence.

## Provider resend and Connect readiness — 2026-10-19 08:50 UTC

The authenticated Stripe test Dashboard manually resent the exact original
`checkout.session.completed` event to the staging Connect webhook. Stripe marks
the delivery as manually resent and delivered, and the endpoint response was HTTP
200 with the expected acknowledgement.

The post-delivery database comparison found exactly one webhook event, one
payment, and one booking. The event outcome remained `confirmed`; payment,
booking, and hold states remained `paid`, `confirmed`, and `consumed`. The event
processing timestamp, payment paid timestamp, booking update timestamp, and hold
payment-confirmation timestamp were unchanged. The payment update timestamp
advanced because the duplicate path reissues the paid-payment update before
returning `duplicate`; this is the only failed strict-idempotency assertion.

Authenticated Stripe API readback reports charges and payouts enabled, submitted
details complete, no currently due requirements, no eventually due requirements,
no past-due requirements, and no disabled reason. This connected account is ready
for test-mode pilot Connect flows.

## Duplicate no-op fix and provider retest — 2026-10-19 23:13 UTC

The original database function detected a duplicate event insert but continued
through payment reconciliation. Its otherwise idempotent payment `UPDATE` fired
the standard update-timestamp trigger and advanced `booking_payments.updated_at`.

Migration `20261019090500_stripe_webhook_duplicate_noop` now locks and reads the
existing event audit row immediately after the insert conflict and returns
`duplicate` before reading or updating payment data. The existing
`critical_paid_without_booking` recovery path remains retryable so a failed paid
booking reconciliation can still heal on Stripe retry.

The hosted migration history now contains 31 migrations. A rollback-only hosted
regression using the real confirmed Marina A payment passed before deployment.
After deployment, Stripe manually resent the same original signed event again.
The delivery returned HTTP 200. Full JSON comparisons found the event, payment,
booking, and hold rows unchanged, including every audit timestamp; counts remained
one event, one payment, and one booking. Stripe Connect verification for M5 is
complete.

## Resend delivery and notification reconciliation — 2026-10-20 09:47 UTC

The authenticated Resend workspace identifies a staging sending key and a
verified `berthio.eu` sender domain. The Vercel staging project has the required
server-only `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFICATION_WORKER_SECRET`
configuration. The worker secret was rotated in Vercel because the prior
sensitive value was write-only and no scheduler consumed it. The latest `main`
deployment remained Ready after the configuration-only redeploy. No secret value
was printed or retained in the repository.

A controlled Marina A booking used the normal booking trigger and created one
pending outbox row with no delivery attempt. An authorized worker request with a
batch limit of one returned HTTP 200 with one claimed and one sent. The outbox
then contained one sent row, one successful immutable attempt, a sent timestamp,
and a provider message ID. Resend marked the matching message `Delivered`, and
the controlled Gmail inbox contained exactly one matching message from the
verified Berthio domain.

Duplicate enqueue returned no new ID and left exactly one row for the dedupe key.
A repeated completion returned `already_sent`; status, attempt count, attempt-row
count, and update timestamp all remained unchanged. A rollback-only hosted
failure/retry probe recorded one failed attempt and reclaimed the same outbox row
for retry without creating another notification. After rollback, the controlled
row remained sent with one successful attempt. Marina A's authenticated member
could read the controlled row, while Marina B's member read zero matching rows.

The application sends Resend only the required sender, recipient, subject, text,
and `event_type` tag, plus an outbox-ID idempotency key. The worker response and
Vercel runtime log contain only route/status and aggregate counts; the observed
401 and 200 worker requests contained no logged secret, message body, recipient,
or customer data. Provider-visible recipient and message content were limited to
the intended controlled delivery.

## Scheduler verification — PASS

The eight older eligible rows were all staging artifacts and were quarantined
without delivery. Four used reserved test domains. Three internal-domain rows
belonged to a synthetic booking driven through creation, assignment, extension,
move, check-in, balance update, and check-out within minutes by a
`berthio.test` member. The remaining internal-domain row used the same staging
recipient and was created seconds later. All eight had zero attempts. Their
history was retained, `next_attempt_at` was moved to the end of year 9999, and a
quarantine reason was recorded. The eligible queue became empty; no sent
timestamp, provider ID, or attempt was added.

Vercel Cron was considered first. The staging project is on the Hobby plan,
which permits only one run per day with hourly timing precision, and Vercel Cron
invokes GET while the established protected worker contract is POST. That is not
an adequate cadence for transactional booking notifications. The hosted
Supabase project already provided Vault and supports Cron plus `pg_net`, so those
extensions were enabled and an active one-minute job named
`berthio-staging-notification-worker` was configured instead.

The bearer credential was rotated in Vercel, redeployed, and stored encrypted in
Supabase Vault. The cron command reads it from Vault at execution and does not
contain a literal credential. It POSTs to the canonical staging worker with a
bounded batch limit. An unauthorized POST returned HTTP 401 after rotation; an
authorized request returned HTTP 200.

Three consecutive real cron runs succeeded at 10:00, 10:01, and 10:02 UTC.
Supabase job history records all three as `succeeded`; `pg_net` records HTTP 200,
and Vercel runtime logs show the scheduled POST. Each response reported zero
arrival reminders queued and zero notifications claimed, sent, or failed. Across
the third run, the outbox remained 19 rows, 11 sent rows, and four immutable
attempt rows with an unchanged latest update timestamp, proving no duplicate or
other notification mutation. After this readback,
`NOTIFICATION_WORKER_SCHEDULED=true` was saved as non-secret Vercel configuration
and deployment `A8bBB1WNz` became Ready and current. A later scheduled run at
10:10 UTC also succeeded with HTTP 200 and zero claimed rows after that final
deployment. Vault contains one scheduler credential, the cron command contains no
literal secret, and the asynchronous HTTP request queue was empty after delivery.

## Sentry staging observability — PASS

The staging deployment at Git commit
`17175dc0cb8fa38ac47b60d2af915ea343ccd8fb` uploaded its server, edge, and browser
source maps to the configured Sentry project during the Vercel build. Sentry
accepted fresh controlled server and browser exceptions from a secret-protected
staging verification path. Provider readback returned both events with
`environment=staging` and a release equal to that exact deployed Git SHA.

Both events resolved their application frame to readable TypeScript source with
source context: the server event to the protected route's `POST` handler and the
browser event to the verification component effect. Neither event reported a
source-map processing error. Server context retained the request method and URL,
Node runtime, cloud, operating-system, and trace data. Browser context retained
the page URL, React, and trace data.

The original verification event showed that Sentry's defaults filtered the
Authorization and platform token headers, but still retained Vercel request
headers and derived city/region data. The staging SDK configuration now removes
request headers, cookies, bodies, query strings, and user context before send.
The Sentry project now also prevents IP-address storage and has a server-side
advanced scrubber that removes all `$user.geo` fields. Fresh server and browser
events after those changes contained no request headers, cookies, bodies, query
data, IP address, or geo values. Exact-value and pattern checks found no
verification credential, password, auth token/JWT, TOTP material, Supabase or
Stripe secret, or email address. The protected endpoint rejects an unauthorized
POST with HTTP 401. No secret value or event identifier is retained in this
evidence file.

Sentry M5.6 scope is complete.
