# M5.5 hosted staging verification evidence

Last recheck: 2026-10-18. Repository revision:
`e23163d1c033c88fa4d4c8fbb07aa3fb01b150c6` (`main`). Legal work was excluded.

## Current result

**MILESTONE 5 TASK 5 — PARTIAL.** Supabase, the hosted public application,
data-backed marina page, migration/schema catalog, RLS, database authorization,
hosted browser Auth/MFA/tenant behavior, exact Vercel deployment provenance, and
the core hosted Stripe test-payment path are verified. Security advisor findings
have a documented disposition. Stripe dashboard redelivery/account-requirement
readback, Resend delivery, scheduler invocation, and Sentry ingestion remain open.

## Infrastructure found

- Application: `https://berthio-staging.vercel.app` on Vercel, reachable by HTTPS.
- Database/Auth target: Supabase project ref `adbjelqixteggaoekqvj`, identified by
  the deployed CSP and the Task 7 restore evidence.
- Historical database evidence: the 2026-09-27 staging logical export contained
  all 29 repository migration versions and passed schema, RLS, relationship,
  representative booking, application readback, and tenant-isolation checks.
- CI: GitHub Actions run 36344683883 passed verify, concurrency, E2E, and the
  aggregate release gate for the exact current `main` SHA.
- Providers named by deployed configuration: Supabase, Stripe, Resend, Sentry;
  PostHog is not present in the deployed CSP and is treated as disabled pending
  confirmation from the environment owner.

## Verified now

- HTTPS and certificate validation pass for the Vercel staging URL.
- `/login` renders the Berthio sign-in page.
- Unauthenticated `/dashboard` redirects to the login route.
- `/mfa` redirects unauthenticated users to login at the server-rendered route level.
- The notification worker rejects an unauthenticated POST with HTTP 401.
- Security headers are present on public, auth, protected-redirect, marina, and API
  responses. CSP includes the deployed Supabase, Sentry, and Stripe origins.
- `STRIPE_LOCAL_PLATFORM_FALLBACK` cannot be read from the deployment, but the
  repository guard rejects that fallback outside non-production localhost usage.

## Historical failure — 2026-10-13

- The configured Supabase host `adbjelqixteggaoekqvj.supabase.co` returns DNS
  `NXDOMAIN`. It was not a usable staging database/Auth endpoint during that check.
- The public marina route does not render its booking UI; its streamed response
  contains server-render error digests. Therefore the public cloud smoke test fails.
- The core staging system was not operational while the deployed app pointed at
  the unavailable Supabase endpoint.

## Reactivation verification — 2026-10-15 13:18–13:21 UTC

### Verified

- The expected target remains `adbjelqixteggaoekqvj`. Every tested Vercel response
  still includes `https://adbjelqixteggaoekqvj.supabase.co` and its WebSocket
  origin in CSP, so the deployed application has not been repointed.
- `adbjelqixteggaoekqvj.supabase.co` resolves to Cloudflare addresses. HTTPS and
  certificate validation pass. `/auth/v1/health` and `/rest/v1/` both reach the
  expected project gateway and return HTTP 401 with
  `UNAUTHORIZED_MISSING_API_KEY`; the Auth response includes the expected
  `sb-project-ref`. This proves endpoint recovery but is not an authenticated
  Auth service health check.
- The Vercel application still has a valid HTTPS certificate. `/login` returns
  HTTP 200, unauthenticated `/dashboard` returns HTTP 307 to
  `/login?next=%2Fdashboard`, and an unauthenticated notification-worker POST
  returns HTTP 401.
- `/marina/marina-a` returns HTTP 200, renders `Marina A | Berthio` with booking
  content, and contains no server-render error digest. The data-backed public route
  that failed during the outage now passes.
- Security headers still include HSTS (`max-age=31536000`), CSP,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, and `Permissions-Policy`. CSP still allowlists the intended
  Supabase project, the configured Sentry ingestion origin, Stripe API,
  Stripe.js, and Stripe Checkout.
- Supabase CLI 2.113.0, matching the repository pin, was downloaded to a temporary
  directory and runs on this host. No project files were changed by that check.
- Stripe.js returns HTTP 200 over valid TLS. Stripe API and the configured Sentry
  ingestion origin are reachable over valid TLS and return expected unauthenticated
  root responses. These checks verify origin reachability and the CSP allowlist,
  not Checkout completion or Sentry event ingestion.

### Blocked / still unverified

- No Vercel CLI/session is available. The deployed CSP proves the application is
  configured for the expected Supabase origin, but the Vercel environment-variable
  records and deployment SHA cannot be inspected directly.
- No staging admin/staff login, password, enrolled TOTP factor, or recovery code is
  available. Hosted MFA, authenticated dashboards, AAL1/AAL2 enforcement, and
  live cross-tenant isolation remain unverified.
- Provider allowlists and origin reachability were confirmed. No authenticated
  browser/provider session is available for Supabase Auth, Stripe Checkout, Sentry
  event ingestion, or browser-console CSP verification.

Historical evidence from 2026-09-27 remains useful but is not a current health
check: the same project then contained all 29 repository migration versions, 24
public tables with RLS enabled, and 46 named policies, and passed an isolated
tenant-bound readback. The current repository still contains 29 migrations.

## Authenticated Supabase verification — 2026-10-15 13:25–13:29 UTC

- Supabase CLI 2.113.0 authenticated successfully and linked to project
  `adbjelqixteggaoekqvj`. The access token is stored in the CLI user profile, not
  the repository. Linking and read-only verification used the CLI login role and
  did not require the staging database password.
- `migration list --linked` reported 29 local and 29 remote versions with an exact
  version-by-version match from `20260809151923` through `20260916201130`.
- Hosted schema lint for `public,private` returned `No schema errors found`.
- The live catalog has 24 public tables and all 24 have RLS enabled. It has 46
  public policies on 21 tables. Comparing table/policy names with every repository
  migration found no missing or extra policy and no expected RLS table missing.
- Three RLS-enabled service tables intentionally have no client policy:
  `guest_booking_access_grants`, `public_availability_rate_limits`, and
  `stripe_webhook_events`. They remain deny-by-default for API roles; privileged
  server/database paths perform their writes.
- Database-role verification used live active memberships and transaction-local
  JWT claims, with every transaction rolled back. Admin AAL1 could see neither its
  own nor another tenant. Admin AAL2 could see its own tenant and not the other.
  Staff AAL1 could see its own tenant and not the other. This verifies live RLS and
  database AAL enforcement, not Auth login, cookie handling, or dashboard routing.
- Hosted membership data contains active admin and staff identities, and two active
  admin members have verified MFA factors. Passwords, factor secrets, user IDs, and
  personal identifiers were not read or recorded.

### Hosted advisors

- Security: 9 findings: 6 WARN and 3 INFO. The INFO findings are the three expected
  deny-by-default tables above. WARN reports leaked-password protection disabled;
  public/anonymous and authenticated execute grants on the provider-installed
  `public.rls_auto_enable()` event-trigger function; and authenticated execute on
  three intentional security-definer RPCs.
- The three application RPC warnings cover `get_marina_integration_health`,
  `replace_marina_cancellation_policy`, and
  `replace_marina_pricing_configuration`. Live catalog checks confirm all three
  deny anonymous execution, grant authenticated execution, use an empty search
  path, and contain the tenant-admin guard. The current MFA membership helper also
  requires AAL2 for admin access. The generic advisor warnings are therefore
  reviewed and expected for these RPC entry points.
- `rls_auto_enable()` is not defined by repository migrations. It is owned by
  `postgres`, backs the enabled `ensure_rls` DDL event trigger, and has execute
  granted to public/anonymous, authenticated, and service roles. Its grants need a
  separate provider/configuration decision; no privilege was changed in this
  verification.
- Performance: 48 INFO findings: 12 unindexed foreign keys and 36 unused indexes.
  Unused-index evidence from low-traffic staging is not sufficient to remove an
  index. No performance schema change was made.

## Security advisor disposition — 2026-10-15 13:34 UTC

- Live metadata and the [Supabase event-trigger guide](https://supabase.com/docs/guides/database/postgres/event-triggers)
  identify `rls_auto_enable()` plus `ensure_rls` as Supabase's documented optional
  auto-RLS template. It is a project object owned by `postgres`, is not an extension
  member, and appears in zero hosted migration records. It was therefore installed
  outside this repository, likely during project/dashboard setup; it is not an
  internal `supabase_admin` event trigger.
- Its only live dependency is the enabled `ensure_rls` event trigger, which calls
  it after `CREATE TABLE`, `CREATE TABLE AS`, and `SELECT INTO`. A rollback-only
  proof revoked execution from `PUBLIC`, `anon`, and `authenticated`, created a
  probe table, confirmed the trigger still enabled RLS, and rolled back the table
  and privilege changes.
- Migration `20261015133429_harden_rls_auto_enable_execute.sql` conditionally
  applies that minimum revoke. It was dry-run and applied to staging. All 30 local
  and remote migration versions now match. A second rollback-only probe confirmed
  the live event trigger still enables RLS; the probe was removed. `service_role`
  retains its explicit execute grant.
- The security-advisor rerun contains 7 findings: 4 WARN and 3 INFO. Both
  `rls_auto_enable()` API-role warnings are resolved.
- Three remaining WARN entries are intentionally accepted: the authenticated-only
  security-definer RPCs `get_marina_integration_health`,
  `replace_marina_cancellation_policy`, and
  `replace_marina_pricing_configuration`. Live checks confirm they deny `anon`,
  use an empty search path, and enforce the tenant-admin guard; live AAL tests
  confirm admins require AAL2.
- Three remaining INFO entries are intentionally accepted: the RLS-enabled
  server-only tables `guest_booking_access_grants`,
  `public_availability_rate_limits`, and `stripe_webhook_events` have no client
  policies and are deny-by-default for API roles.
- Leaked-password protection remains the only actionable security WARN. A scoped
  Management API read confirmed `password_hibp_enabled=false`. The attempted
  update returned HTTP 402 with Supabase's response that the feature is available
  on Pro plans and above; a follow-up read confirmed it remained false. The
  Keychain token and API responses were held only in permission-restricted `/tmp`
  files, never printed, and deleted immediately after verification.

## Controlled-pilot advisor disposition — 2026-10-17

The M5.4 exit criterion requires no unresolved critical/high Supabase advisor
issue. Leaked-password protection is a WARN and is not listed among the milestone
hard blockers, so a Supabase Pro upgrade is not required now. The warning is an
accepted controlled-pilot exception owned by Roberts: admin AAL2 and tenant/RLS
enforcement remain mandatory, accounts are limited to pilot/test use, and hosted
browser MFA enrollment/challenge must pass before pilot. Those browser checks now
pass; lost-factor recovery remains restricted to the documented trusted-operator
process. Reassess and enable the feature when the project moves to Pro, no later
than 2026-11-17 or before expanding beyond the controlled pilot, whichever is earlier.

## Staging Auth membership setup — 2026-10-17

The existing Auth users `admin-a@berthio.test`, `staff-a@berthio.test`, and
`admin-b@berthio.test` were found in staging. Existing `marina-a` / Marina A and
`marina-b` / Marina B records each resolve to their existing organization. None
of the three users had an organization membership before this step.

Exactly three active `organization_members` rows were created using the live Auth
user and organization identifiers: admin A as `marina_admin` for Marina A's
organization, staff A as `marina_staff` for Marina A's organization, and admin B
as `marina_admin` for Marina B's organization. The application schema has no
separate user profile table. Post-write verification found exactly one membership
per target user, with the requested tenant and role and no cross-tenant membership.

## Hosted browser authentication and authorization — 2026-10-17

- Admin A completed TOTP enrollment. A subsequent password login required the
  existing factor challenge and produced an AAL2 session. Marina A Overview,
  Bookings, Berths, Berth Map, Payments, Settings, and Audit loaded successfully.
- Staff A logged in at AAL1 and could use Marina A Overview, Bookings, Berths,
  Berth Map, and Payments. The Settings link was absent. Direct requests for
  Settings, Integrations, Audit, berth import, and add berth returned 404.
- Admin B completed TOTP enrollment, reached AAL2, and loaded Marina B Overview,
  Bookings, Berths, Berth Map, Payments, and Settings.
- Admin A and B remained at AAL2 across refresh/navigation; staff remained at
  AAL1. Logout succeeded for every account, and protected routes redirected to
  login afterward.
- Tenant assertions checked rendered pages plus captured staging document/fetch/
  XHR responses from the application and Supabase Auth/REST. Marina A sessions
  exposed no Marina B label/account, and Marina B exposed no Marina A label/account.
  There were zero cross-tenant response findings, unexpected network failures, or
  CSP/Auth browser-console errors. Expected staff authorization 404s were excluded.
- No password, TOTP secret, token, cookie, or session value was printed or stored
  in the repository. Temporary isolated browser profiles were removed.

## Remaining provider access

Authenticated Vercel access became available on 2026-10-18 and the project,
deployment, and environment inventory were inspected. External-provider dashboard
readback is still required for:

- interactive availability, booking submission, pay-at-marina, guest access, and
  Stripe test checkout;
- Stripe test keys/account/webhook ownership;
- Resend sender/API configuration and delivery;
- notification scheduler authorized invocation/readback;
- Sentry controlled-event ingestion and release/environment tags.

## Required verification input

Provide authenticated read access to the Stripe, Resend, and Sentry staging
provider configuration/readback. Do not provide secret values in repository files.

## Vercel staging configuration verification — 2026-10-17

### Verified from the running deployment and provider readback

- `https://berthio-staging.vercel.app` is healthy on Vercel over HTTPS. Public,
  login, and protected-route smoke checks pass and return Vercel response headers.
- The checked-out and remote `main` revision is
  `e23163d1c033c88fa4d4c8fbb07aa3fb01b150c6`; its release-gate checks are green.
  This is repository evidence only: the live deployment SHA could not be read and
  is not asserted to match.
- The live CSP names only staging Supabase project `adbjelqixteggaoekqvj`, and
  hosted Auth plus REST flows work against it. This proves a usable
  `NEXT_PUBLIC_SUPABASE_URL` and publishable key are deployed.
- Admin MFA tenant-label resolution exercised the server privileged client. One
  of `SUPABASE_SECRET_KEY` or the supported legacy `SUPABASE_SERVICE_ROLE_KEY` is
  present and usable; the Vercel variable name cannot be distinguished remotely.
- Supabase Management API readback reports Auth Site URL
  `https://berthio-staging.vercel.app` and the sole allowed redirect pattern
  `https://berthio-staging.vercel.app/**`. There are no localhost or other
  production-like Auth origins in that configuration.
- Authenticated Integration Settings reports Stripe mode `Test Connect`, proving
  test-mode server credentials and that local fallback is not requested. Stripe
  is `Not ready`; the aggregate UI does not reveal whether the remaining cause is
  the connected account, publishable key, webhook, or the application's expected
  rejection of test keys when `NODE_ENV=production` on Vercel.
- Integration Settings reports Resend `Ready`, which proves a syntactically valid
  Resend key and sender identity are present. It does not prove message delivery.
- The notification worker is configured with bearer protection of at least 32
  bytes, while its scheduler is `unverified`; therefore
  `NOTIFICATION_WORKER_SCHEDULED` is false or absent and no scheduled invocation
  is asserted.
- Sentry is `Configured`, and its deployed origin is permitted by CSP. The server
  code derives environment from `VERCEL_ENV`/`NODE_ENV`; the client has no explicit
  environment setting, and no explicit release is configured in repository code.
  Provider readback is still needed to confirm effective environment/release tags.
- No production Supabase origin or live-mode Stripe credential was observed in
  the public deployment behavior. Full exclusion of production secrets cannot be
  established without inspecting Vercel variable values and scopes.

### Superseded on 2026-10-18

The Vercel-only blockers in this section were resolved by the authenticated
verification below. External provider delivery/readback remains open.

## Authenticated Vercel verification — 2026-10-18

### Project and deployment

- Project `berthio-staging` is in the Hobby workspace
  `kruminsrrk-1088s-projects` (project ID
  `prj_gp23YFBzHvVvR5sksuNe3zYMwxFU`, team ID
  `team_jJoGi97c2A20CbvYnWTuOJVd`). The Production target serves
  `https://berthio-staging.vercel.app`; this dedicated Vercel project's Production
  environment is the application staging environment.
- Current deployment `4aVVUNQdzmyjorSHEQgGKVecW5Us` is Ready and was created by
  `kruminsrrk-1088` on 2026-09-29 with `vercel deploy`. The project is not connected
  to Git. Vercel records no commit SHA or ref for this deployment.
- Repository and remote `main` are
  `e23163d1c033c88fa4d4c8fbb07aa3fb01b150c6`. Because the live deployment is an
  unversioned CLI upload, it cannot be proven to match that revision. This fails
  the exact-revision traceability part of the M5.5 staging exit criterion.

### Environment inventory

- The project has the default Production, Preview, and Development environments
  and no custom Staging environment. All application/provider variables are scoped
  only to Production. Preview and Development contain no project variables.
- `NEXT_PUBLIC_SITE_URL` exactly equals the HTTPS staging domain.
- The staging Supabase publishable key and preferred `SUPABASE_SECRET_KEY` are
  present. `SUPABASE_SERVICE_ROLE_KEY` is absent. Runtime Auth and privileged
  tenant-label behavior confirm those credentials work against staging project
  `adbjelqixteggaoekqvj`.
- `STRIPE_LOCAL_PLATFORM_FALLBACK` is explicitly `false`. The browser publishable
  key is test mode, and runtime Integration Settings identifies the server key as
  Test Connect. The Connect webhook secret is present. An extra
  `STRIPE_WEBHOOK_SECRET` variable is present but is not read by the current
  application code.
- `RESEND_API_KEY` and `EMAIL_FROM` are present. Runtime configuration reports
  Resend Ready; delivery and provider-account separation remain unverified.
- Sentry DSN, auth token, organization, and project variables are present.
  `SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` both say `staging`, but
  repository runtime configuration does not consume those variables: server
  events explicitly use `VERCEL_ENV`/`NODE_ENV`, and client initialization has no
  explicit environment. This Production-target staging deployment can therefore
  be tagged `production`. No explicit Sentry release variable is configured.
- `NOTIFICATION_WORKER_SECRET` is present. Vercel Cron Jobs are enabled globally
  but no job is configured, so no scheduled invocation is verified.
- No production Supabase URL or live-mode Stripe key was found. Encrypted Resend
  and Sentry credentials do not expose provider ownership or environment, so the
  absence of production-only provider secrets cannot be proven without provider
  readback.

### Safe configuration correction

- Targeted readback confirmed the existing Production-scope
  `NEXT_PUBLIC_SUPABASE_URL` exactly names `adbjelqixteggaoekqvj`; it was not
  changed.
- Added Production-scope `NOTIFICATION_WORKER_SCHEDULED=false` so the current
  unscheduled state is explicit. It must remain false until an authorized scheduler
  invocation is configured and verified.
- No redeployment was triggered. The current live deployment remains Ready; the
  corrected records will apply to a subsequent Production deployment.

## Git-based deployment verification — 2026-10-18

- Vercel is connected to GitHub repository `RobertsK2/marine-soft`.
- Production deployment `26Gr1qkd1hVVveVkzbmAkaxpPZ7N` is Ready and Current. Its
  recorded source is branch `main`, commit
  `e23163d1c033c88fa4d4c8fbb07aa3fb01b150c6`, message
  `test: refresh public booking dates`.
- Local `HEAD`, `origin/main`, and Vercel's deployment SHA are an exact match.
- Vercel assigns both `berthio-staging.vercel.app` and the generated Production
  deployment domain to this deployment. The canonical staging alias is public;
  the generated deployment domain is protected by Vercel SSO.
- Post-deployment smoke checks pass on the canonical alias: `/`, `/login`,
  `/marina/marina-a`, and `/mfa` return HTTP 200 with valid page titles and no
  application error/digest; Marina A renders booking content; unauthenticated
  `/dashboard` returns HTTP 307 to `/login?next=%2Fdashboard`; and an unauthorized
  notification-worker POST returns HTTP 401.
- All checked canonical responses are served by Vercel over HTTPS with HSTS and
  the application CSP. The deployment dashboard reports a zero-percent recent
  error rate.

The exact-revision deployment traceability requirement now passes. Remaining M5
work is Stripe provider-signed redelivery and Connect readiness readback, Resend
delivery plus authorized scheduling, and controlled Sentry event
environment/release readback.

## Hosted Stripe verification — 2026-10-18 15:07 UTC

- Marina A was verified public with online payment enabled, a configured Connect
  account reference, and available inventory. Staging retained
  `STRIPE_LOCAL_PLATFORM_FALLBACK=false` and test-mode credentials.
- A real public Marina A attempt created exactly one active 15-minute hold and one
  pending payment before redirect, with no booking or webhook row. Stripe hosted
  Checkout displayed `Sandbox`, used a test Checkout session, and charged the
  server-calculated amount.
- The successful card payment returned to the canonical staging Checkout return
  route. The signed Connect webhook produced one
  `checkout.session.completed` event with outcome `confirmed`; the hold became
  consumed, the payment became paid, and exactly one confirmed Marina A booking
  was created with matching amounts.
- The return/Checkout navigation produced no CSP violation, severe browser-console
  error, or failed network load. Both success and cancel destinations resolve to
  `berthio-staging.vercel.app`; no production URL or live-mode Stripe artifact was
  observed.
- A hosted replay of the same event identity returned `duplicate`, retained one
  webhook row, one paid payment, and one booking. A provider-triggered signed
  redelivery remains unverified because no authenticated Stripe Dashboard/API
  session is available.
- Admin A's live AAL2/RLS context could read the created booking. Admin B's live
  AAL2/RLS context could read zero matching rows, confirming the new payment and
  booking remained tenant-bound to Marina A.
- For the pay-at-marina control, Marina A was temporarily changed from online-only
  to both payment methods, then restored to its original online-only setting. The
  on-site path created one confirmed booking and consumed hold, recorded the full
  balance due with zero paid, created no Stripe payment row, and made zero Stripe
  Checkout/API browser requests.
- The successful direct-charge Checkout proves the configured Connect account can
  accept this test payment. Outstanding Connect requirements and payout readiness
  still require Stripe provider readback. No secret, token, Checkout identifier,
  payment identifier, webhook identifier, or customer data was recorded here.

The Stripe portion of M5.5 is operationally green for checkout, signed webhook,
reconciliation, isolation, and CSP. Provider-signed duplicate delivery and Connect
account requirements/payout readback remain the Stripe blockers for full M5.6.
