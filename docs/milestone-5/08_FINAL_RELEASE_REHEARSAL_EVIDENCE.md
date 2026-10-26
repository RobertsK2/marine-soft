# M5.8 final release rehearsal evidence

Rehearsal date: 2026-10-22. Legal review was intentionally excluded by the
release owner. Final release candidate:
`2a7dfa2475373ba24b516e1c0103cd5ad719e939` on `main`.

## Release identity

- Vercel deployment `9rvxYEcyVNajNYBtcq8sy35vjG6P` is Ready, Latest, Current,
  and owns `https://berthio-staging.vercel.app`.
- Vercel identifies source branch `main` and commit
  `2a7dfa2475373ba24b516e1c0103cd5ad719e939`.
- Local `HEAD`, `origin/main`, and the Vercel source SHA match.

## Rehearsal results

| Pilot-critical check | Result | Evidence |
| --- | --- | --- |
| GitHub release gate | PASS | Run `39701154713` completed successfully for the exact SHA: verify, concurrency, E2E, and aggregate release gate all passed. Verify reported 39/39 test files and 244/244 unit tests passing. |
| Public Marina A booking | PASS | Marina A rendered from hosted data; a fresh availability search returned a suitable berth and the expected server-calculated price. |
| Hold lifecycle and expiry | PASS | The fresh online flow created and consumed one hold. Exact-SHA database/E2E tests cover the 15-minute expiry, lazy expiry transition, capacity release, quotas, and races. |
| Stripe online payment | PASS | A fresh Stripe Sandbox Checkout completed and returned to staging. Hosted readback showed one confirmed booking, one paid payment, and one consumed hold. |
| Signed webhook reconciliation | PASS | The hosted audit row records one `checkout.session.completed` event with outcome `confirmed`. The endpoint only records an event after signature validation. |
| Pay at marina | PASS | The existing controlled on-site booking remains confirmed and due at marina in the current hosted ledger. Prior provider proof established no Stripe session; the deployed runtime payment code is unchanged. |
| Admin MFA/AAL2 | PASS | Fresh login reached the required TOTP challenge. The prior hosted AAL2 admin proof remains applicable because the release-candidate diff contains only migration tracking and tests; no Auth/runtime source changed. |
| Staff authorization | PASS | Fresh Staff A login loaded Marina A Overview, Bookings, Berths, Map, and Payments. Admin-only Settings/Audit remained unavailable. |
| Tenant isolation | PASS | Staff A rendered only Marina A data. Exact-SHA database tests cover RLS/AAL isolation; the previously completed Admin A/B browser isolation proof remains applicable because application/Auth code is unchanged. |
| Session/logout/protected routes | PASS | Staff session persisted across refresh/navigation. Logout and unauthenticated protected-route redirects were rechecked; direct unauthenticated requests redirect to login. |
| Dashboard/core routes | PASS | Hosted Overview, Bookings, Berths, Marina Map, and Payments loaded; the fresh paid booking appeared in Bookings and Payments. |
| Notifications and Resend | PASS | The fresh booking produced exactly one notification and one delivery attempt; hosted state is `sent`. Resend reports the controlled test message as `Delivered`. |
| Recurring scheduler | PASS | The one-minute `berthio-staging-notification-worker` job is active. Three fresh runs reported `succeeded`; authorized requests returned 200 and an unauthenticated POST returned 401. |
| Sentry | PASS | The final build uploaded server and client Sentry artifact bundles and source maps with release `2a7dfa2475373ba24b516e1c0103cd5ad719e939`. Prior controlled server/client events verified `staging`, readable TypeScript frames, useful context, and scrubbed secrets/PII; no Sentry/runtime source changed in the final candidate. |
| HTTPS/security headers/CSP | PASS | Public, Auth, protected redirect, and API responses have valid HTTPS, CSP, HSTS, nosniff, frame protection, referrer, and permissions policies. Stripe Checkout/return and Supabase/Auth flows succeeded with the deployed CSP. |
| Security findings | PASS | Supabase advisors report zero errors. Four reviewed warnings remain: three guarded authenticated RPCs and leaked-password protection unavailable on the Free plan. No unresolved critical/high finding is known; the dependency lockfile is unchanged from the recorded zero-vulnerability audit. |
| Application errors | PASS | Vercel reports 0% error rate for the final deployment; current rehearsal traffic showed no unexpected 5xx or application error page. |
| Backup/restore applicability | PASS | The isolated logical export/restore drill remains applicable. Migrations 30 and 31 change function permission/logic only and introduce no table, extension, storage, or restore prerequisite. Provider physical restore remains outside the Free-plan drill. |
| Migration parity | PASS | Repository `main` now tracks all 31 migration files. Hosted history lists the same 31 versions through `20261019090500`; hosted schema/RLS remains 24 RLS tables and 46 policies. |

## Defects found and fixed

1. The E2E seasonal-price boundary used 2026 dates that had become historical.
   The deterministic pilot fixture and assertion now use a stable 2028 boundary.
2. The notification reminder test used the database session date while production
   correctly uses the marina-local date. The fixture now uses Europe/Riga local
   time.
3. Hosted migrations 30 and 31 and the strict duplicate-webhook regression test
   were absent from repository `main`. The exact already-deployed migrations and
   test are now tracked.

All fixes are migrations/tests/fixtures. No legal page or unrelated product
feature changed.

## Decision

**GO for the controlled pilot, excluding the intentionally deferred legal
review.** No hosted or repository release blocker remains.
