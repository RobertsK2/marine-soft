# M5.4 application security evidence and deployment checks

## Implemented controls

- Production responses use a deliberate CSP and other browser security headers. HSTS is emitted only when `NODE_ENV=production` and `NEXT_PUBLIC_SITE_URL` is HTTPS.
- The public availability calculation is limited server-side to 20 requests per requester session and 120 per network per minute, with atomic database counters. Searches are limited to 365 nights and arrival within 730 days.
- Marina-admin app routes and server actions require a Supabase `aal2` claim in production. Staff remain subject to their existing role checks. Local testing may opt in with `BERTHIO_REQUIRE_ADMIN_MFA=true`.
- Supabase TOTP enrollment/verification is enabled in the local config. The MFA screen supports enrollment and an existing verified factor. Lost factors require a trusted operator to verify the person's identity and perform a Supabase-admin recovery; no self-service bypass exists.

## Before production pilot

1. Enable TOTP MFA in the hosted Supabase Auth configuration and enroll each marina admin. Establish a documented, identity-verified lost-factor recovery operator and test recovery on a non-production account.
2. Configure exact HTTPS Auth site/redirect URLs for staging and production in their respective hosted Supabase projects. The checked-in `supabase/config.toml` contains local-only URLs.
3. Exercise the deployed staging CSP with real Supabase Auth, Stripe Checkout, Sentry, and PostHog (if configured), checking browser CSP violations and network failures. Confirm HSTS on an actual HTTPS production response. Local/unit checks do not substitute for this provider test.
4. Confirm hosted Supabase schema lint and security advisor are clear after deploying the migration. The local CLI checks are not evidence about a hosted project's configuration.

## Database authorization gap fixed

Review date: 2026-09-17. Scope: Task 4 only on
`milestone-5/task-4-application-security-hardening`. No merge or hosted migration.

Previously a password-only admin JWT could bypass app MFA using the Data API.
Migration `20260916201130_admin_mfa_database_authorization.sql` introduces one
private `mfa_allows_role` predicate and replaces the four existing organization/
marina member/admin helpers. It requires exactly the signed top-level `aal2`
claim for stored active admin memberships. Missing/unknown AAL and user metadata
cannot grant admin access. Staff retain AAL1 permissions; AAL2 does not override
tenant isolation or suspended membership. No policy or grant is broadened.

Database enforcement applies in every environment. Set
`BERTHIO_REQUIRE_ADMIN_MFA=true` for the local app to redirect admins to MFA too;
that flag cannot disable the database requirement. The server resolves MFA-screen
tenant labels only after verifying the caller's own active membership.

The explicit bootstrap exception permits an AAL1 admin to read their own
`organization_members` row, with no other memberships or client write grant.
Anonymous published-marina reads also remain available. Neither grants admin
operations.

## Complete RLS audit

The migrated local catalog has **24 public tables, all with RLS enabled**, and
**46 policies**. The 45 authenticated policies use the updated membership helpers,
with the explicit self-membership exception above. The remaining policy is
`marinas_select_published`, restricted to `anon` and `is_public`.

| Tables | Policies and authorization |
| --- | --- |
| `organizations` | SELECT organization member; UPDATE organization admin |
| `marinas` | SELECT organization member; INSERT/UPDATE/DELETE organization admin; separate anonymous published SELECT |
| `organization_members` | SELECT self or organization admin; no client writes |
| `berths` | SELECT marina member; INSERT/UPDATE/DELETE marina admin |
| `bookings` | SELECT/INSERT/UPDATE marina member; existing column grants and triggers still apply |
| `marina_pricing_configs`, `pricing_seasons`, `pricing_season_length_rates`, `pricing_season_meter_rates`, `marina_mandatory_fees` | Each has SELECT marina member and INSERT/UPDATE/DELETE marina admin |
| `booking_holds`, `booking_payments`, `booking_berth_assignments`, `booking_price_adjustments`, `booking_cancellation_events`, `booking_payment_balances`, `audit_events`, `notification_outbox`, `notification_delivery_attempts` | SELECT marina member; existing grants may further restrict access; no client write policy |
| `marina_cancellation_policies`, `marina_cancellation_policy_tiers` | SELECT marina admin; writes through guarded RPC only |
| `stripe_webhook_events`, `guest_booking_access_grants`, `public_availability_rate_limits` | No client policies; server/service operations only |

Every UPDATE policy has both USING and WITH CHECK, protecting old and new tenant
scope. There are no application views bypassing RLS. `private` is not an exposed
API schema (`public` and `graphql_public` are configured); underlying table RLS
also applies to GraphQL. No application storage buckets/policies are in use.

## Complete RPC and SECURITY DEFINER audit

Exactly five public RPCs are executable by `authenticated`; none by `anon`:

| RPC | Authorization before data access/mutation |
| --- | --- |
| `assign_booking_berth` | Invoker wrapper calls private definer; booking filter uses `is_marina_member`; denied returns `not_found` |
| `transition_booking_stay` | Invoker wrapper calls private definer; same member filter; denied returns `not_found` |
| `replace_marina_pricing_configuration` | Definer checks `auth.uid()` and `is_marina_admin`; denied raises `42501` |
| `replace_marina_cancellation_policy` | Same explicit admin check and `42501` denial |
| `get_marina_integration_health` | Same explicit admin check and `42501` denial |

All **23 application SECURITY DEFINER functions** have an explicit empty
`search_path`, qualified object references, and no anonymous EXECUTE grant:

- Four membership helpers and private `assign_booking_berth`/
  `transition_booking_stay`: authenticated EXECUTE, guarded as above.
- Three public admin RPCs above: authenticated EXECUTE, guarded.
- `set_marina_publication_state`, `queue_upcoming_arrival_reminders`,
  `claim_notification_deliveries`, `complete_notification_delivery`: service-only
  EXECUTE. Publication validates the server-supplied actor's active admin
  membership; clients cannot impersonate that actor through the Data API.
- Private `pricing_configuration_snapshot`, `cancellation_policy_snapshot`,
  `enqueue_booking_notification`: internal calls only; EXECUTE revoked from
  PUBLIC/anon/authenticated/service_role.
- Private `capture_operational_audit_event`, `capture_marina_profile_audit_event`,
  `capture_pricing_table_audit_event`, `capture_stripe_account_audit_event`,
  `capture_marina_publication_audit_event`, `insert_default_cancellation_policy`,
  `queue_operational_notification`: trigger-only; EXECUTE revoked from client
  and service roles; run after an authorized operation.

All other public RPCs are SECURITY INVOKER and service-role only:

- Holds/checkout: `create_booking_hold`, `prepare_booking_checkout`,
  `attach_booking_checkout_session`, `fail_booking_checkout_creation`,
  `release_booking_hold_after_checkout_failure`, `process_stripe_checkout_event`,
  `confirm_pay_at_marina_booking`.
- Guest: `ensure_guest_booking_access`, `rotate_guest_booking_access`,
  `revoke_guest_booking_access`, `get_guest_booking`, `update_guest_booking_times`.
- Operations: `update_booking_details`, `preview_booking_extension`,
  `confirm_booking_extension`, `preview_berth_block_impact`,
  `preview_booking_cancellation`, `confirm_booking_cancellation`,
  `set_booking_payment_state`, `audited_update_booking_details`,
  `audited_confirm_booking_extension`, `audited_confirm_booking_cancellation`.
- Abuse protection: `allow_public_availability_check`.

Private invoker `capacity_is_available` obeys caller RLS;
`berth_assignment_is_open` operates only on supplied JSON. Other private invoker
functions are trigger guards, except the service-only extension capacity helper
and non-client-callable MFA predicate. They create no privileged MFA bypass.

Service-role BYPASSRLS and existing RPC grants are preserved. Server actions must
still authenticate and tenant-scope actors before service-only RPCs. No JWT AAL
requirement is imposed on guest, webhook, availability or server operations.

## Focused verification

`030_admin_mfa_database_authorization.test.sql` has 47 assertions:

- AAL1/missing-AAL denials; hidden tenant/berth/booking/pricing rows; UPDATE/DELETE
  affect zero rows; INSERT raises `42501`; editable metadata cannot bypass MFA.
- All five authenticated entry points deny AAL1, including private operational
  definers; forged actor cannot invoke service-only publication.
- AAL2 reads/writes, assignment (`assigned`) and check-in (`checked_in`) succeed;
  cross-tenant and suspended membership remain denied.
- AAL1 staff reads/check-out succeed; admin RPC denied. Service-role reads/writes
  without AAL and anonymous published reads succeed.
- Catalog assertions lock the authenticated RPC surface to the five reviewed
  functions and reject unsafe definer search paths/anonymous grants.

Existing DB assertions remain intact; admin fixtures now use AAL2 and staff use
AAL1. Pricing/cancellation mutation, role/tenant, guest-token, quota and concurrency
coverage is preserved. Local test-user setup checks AAL1 denial and obtains a
real Auth-issued AAL2 session for its original tenant assertions; it removes the
temporary test factor afterwards.

`admin-mfa-data-api.spec.ts` uses real password login and Supabase TOTP over HTTP.
It checks AAL1 hidden reads/updates, denied insert/RPC, AAL2 success and refresh,
stale AAL1-token denial after enrollment, and staff AAL1 behavior.
`admin-mfa.spec.ts` tests browser enrollment, protected-route redirects and access
after refresh. No fabricated JWT authorizes the HTTP tests.

## Header/deployment review

CSP deliberately allows the configured Supabase HTTP/WebSocket, Sentry ingestion,
PostHog/EU asset, and Stripe script/frame/checkout origins, local Next.js assets
and fonts, and HTTPS images. Production excludes unsafe-eval. Inline scripts and
styles remain permitted for the current rendering architecture; this is not a
nonce-based strict CSP. HSTS omits premature preload/includeSubDomains.

The browser test checks direct public/auth/protected redirect response headers,
final pages, CSP violations and the sign-in control. `E2E_PRODUCTION=1` in the
isolated integration runner builds/serves the production app without developer
provider secrets. Local production checks do not prove external HTTPS or enabled
provider compatibility.

## Verification results

- `npm run verify`: PASS (secrets, ESLint, TypeScript, 39 unit suites / 244 tests,
  30 database suites / 728 assertions repeated three times without reset, and
  production build).
- Isolated database lint for `public,private`: no schema errors. Local security
  advisor: no issues. Both now run inside `test:db` before the three test passes.
- Focused development HTTP/browser run: 4 passed (MFA Data API, enrollment,
  availability rate limit, security headers).
- Production integration (`E2E_PRODUCTION=1`, `BERTHIO_REQUIRE_ADMIN_MFA=true`):
  **9 passed**, 5 intentional project-specific skips. Covers signed-token MFA,
  enrollment/refresh/protected pricing save, guest-link edit/revocation on desktop
  and mobile, the 21st availability request denied, mobile pay-at-marina booking
  and payment-method choice, and desktop/mobile headers without CSP violations.
  Skips are duplicate MFA/rate-limit tests on mobile and mobile-specific booking
  tests on desktop. Real external Stripe Checkout was not exercised (no provider
  credentials in the isolated runner); DB webhook/checkout suites passed.
- AAL1 HTTP evidence: organization GET returns `200` with `[]`; organization
  UPDATE returns no rows; berth INSERT and integration RPC return `403`/`42501`.
  AAL2 returns owned rows, successfully updates, and integration RPC returns `200`;
  refresh retains access and the old AAL1 token remains denied.
- `npm run test:hold-concurrency`: PASS; simultaneous capacity attempts yield
  one created/one unavailable and four same-session quota attempts yield exactly
  two created/two rate_limited.
- `npm run test:assignment-concurrency`: PASS; simultaneous AAL1 staff requests
  produce exactly one assignment and one conflict.
- Browser bundle scan: no provider-secret patterns in `.next/static` JavaScript.
  Repository secret scan and logging unit tests pass; raw error payloads and
  caller context are no longer forwarded by `captureServerError`.
- `git diff --check`: PASS. All checks used isolated local databases; the
  developer database and hosted schema were not migrated/reset.

The production HTTP availability test explicitly replays the server-issued
Secure requester cookie, since the local API test client uses HTTP. Production
Secure cookie behavior and the 20-request assertion are preserved.

Reproduce the production suite in PowerShell:

```powershell
$env:E2E_PRODUCTION = '1'
$env:BERTHIO_REQUIRE_ADMIN_MFA = 'true'
npm.cmd run test:e2e -- admin-mfa admin-mfa-data-api security-headers public-availability-limit public-pay-at-marina guest-access
```

Header JSON attachments are available in the local Playwright report. On local
HTTP, public/auth requests return 200 and the protected dashboard returns a 307
redirect; CSP has no unsafe-eval. HSTS is intentionally absent on local HTTP;
its configured HTTPS value is unit-tested, not yet verified on a hosted response.

## Hosted findings and remaining Task 4 gates

Read-only inspection on 2026-09-17: linked `marine-soft-saas`
(`jngnuvkylpfndhbisotb`) security advisor returned zero findings and storage has
zero buckets. Its migration history contains only `20260809151923` (foundation).
This does **not** verify deployment of Task 4 or a complete pilot schema.

Still required on the actual staging/production target:

1. Deploy the reviewed migration chain, run hosted lint/advisor, repeat signed
   AAL1/AAL2 Data API checks against staging.
2. Inspect actual HTTPS public/auth/protected/authenticated dashboard headers,
   including HSTS; exercise enabled Stripe/Auth/Sentry/PostHog integrations and
   check browser CSP/network failures.
3. Verify hosted Auth site/redirect origins for each environment; checked-in
   Supabase configuration has local URLs only.
4. Confirm hosted TOTP enablement, enroll pilot admins, identify the recovery
   operator and test identity-verified lost-factor recovery on a test account.

No deployment URL has been supplied. These remain Task 4 exit gates; no pilot
exception is asserted and Task 5 has not been started.

**Database MFA fix and local verification: PASS. Task 4 overall: FAIL / blocked
on hosted deployment verification.** The code is ready for review; this report
does not claim production readiness. No automatic merge was performed.

## Task 4 changed files

Includes the uncommitted Task 4 implementation present at the start of this continuation.
Unrelated pre-existing design reference images are excluded.

- `docs/milestone-5/04_APPLICATION_SECURITY_EVIDENCE.md`
- `next.config.ts`
- `playwright.config.ts`
- `scripts/setup-local-test-users.mjs`
- `scripts/test-database.mjs`
- `scripts/test-integration.mjs`
- `src/app/auth/actions.ts`
- `src/app/auth/callback/route.ts`
- `src/app/auth/confirm/route.ts`
- `src/app/marina/[slug]/page.tsx`
- `src/app/mfa/page.tsx`
- `src/components/auth/mfa-form.tsx`
- `src/domain/public-availability/service.ts`
- `src/domain/public-booking/validation.ts`
- `src/lib/auth/authorization.ts`
- `src/lib/auth/authorization-tenant.ts`
- `src/lib/auth/mfa-policy.ts`
- `src/lib/auth/session.ts`
- `src/lib/monitoring/server.ts`
- `src/lib/security/headers.ts`
- `src/types/database.ts`
- `supabase/config.toml`
- `supabase/migrations/20260916194216_public_availability_rate_limit.sql`
- `supabase/migrations/20260916201130_admin_mfa_database_authorization.sql`
- `supabase/tests/database/001_dockpay_rls.test.sql`
- `supabase/tests/database/002_berths_core.test.sql`
- `supabase/tests/database/003_bookings_core.test.sql`
- `supabase/tests/database/005_pricing_engine.test.sql`
- `supabase/tests/database/006_booking_holds.test.sql`
- `supabase/tests/database/010_berth_assignment.test.sql`
- `supabase/tests/database/011_check_in_out.test.sql`
- `supabase/tests/database/012_booking_changes.test.sql`
- `supabase/tests/database/013_extensions_and_moves.test.sql`
- `supabase/tests/database/014_blocked_berth_impact.test.sql`
- `supabase/tests/database/015_cancellation_flow.test.sql`
- `supabase/tests/database/017_audit_log.test.sql`
- `supabase/tests/database/018_notifications.test.sql`
- `supabase/tests/database/019_marina_profile_timezone.test.sql`
- `supabase/tests/database/020_berth_inventory_import.test.sql`
- `supabase/tests/database/021_pricing_configuration.test.sql`
- `supabase/tests/database/022_cancellation_policy_configuration.test.sql`
- `supabase/tests/database/023_integration_status.test.sql`
- `supabase/tests/database/025_pilot_verification_hardening.test.sql`
- `supabase/tests/database/028_public_booking_payment_methods.test.sql`
- `supabase/tests/database/029_public_availability_rate_limit.test.sql`
- `supabase/tests/database/030_admin_mfa_database_authorization.test.sql`
- `tests/e2e/admin-mfa.spec.ts`
- `tests/e2e/admin-mfa-data-api.spec.ts`
- `tests/e2e/public-availability-limit.spec.ts`
- `tests/e2e/security-headers.spec.ts`
- `tests/unit/admin-mfa-policy.test.ts`
- `tests/unit/public-booking-search.test.ts`
- `tests/unit/security-headers.test.ts`
- `tests/unit/server-monitoring.test.ts`
