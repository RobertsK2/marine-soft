# Pay at Marina staging preflight — no Docker

Prepared on 2026-11-10 for `wip/optional-booking-times` at `51e39a9`.
This is an execution plan, not authorization to change a remote environment.
No backup, migration, database mutation test, commit, push, or deployment was
performed while preparing this plan.

## Review result

- **GO for a feature-only commit after approval.**
- **NO-GO for a push under the current no-deployment restriction.** Vercel has
  automatically deployed previous pushes on this branch. Confirm a build-ignore
  rule or explicitly approve the resulting Preview deployment before pushing.
- **NO-GO for staging application deployment until the backup and database
  verification below have passed.** Unit/browser fixtures do not establish real
  database compatibility.

The authorized staging project is `adbjelqixteggaoekqvj`. Read-only catalog
inspection confirmed migration `20261105195546` is applied; `bookings.eta_window`
and nullable ETA/ETD exist; the Pay at Marina setting still defaults to false.

The only new migration is
`20261110153112_guest_booking_arrival_window.sql`. It replaces
`public.get_guest_booking(uuid)` with the same input and existing 16 outputs,
then appends `eta_window text`. Its SELECT, joins, expiry and revocation filters
are otherwise unchanged. It preserves STABLE, SECURITY INVOKER, empty
search_path, and service-role-only execution. Staging reports no normal catalog
dependents on this function. DROP/recreate is needed to extend a TABLE return
type; execute all four statements atomically. There is no CASCADE, table DDL,
data rewrite, new payment ledger, or RLS/Stripe configuration change.

## Files eligible for a later commit

Include this plan and only these 26 feature files:

```text
playwright.confirmation.config.ts
scripts/test-booking-hold-concurrency.mjs
src/app/dashboard/bookings/[bookingId]/page.tsx
src/app/dashboard/settings/page.tsx
src/app/guest/bookings/[token]/page.tsx
src/components/pricing/payment-methods-form.tsx
src/components/pricing/pricing-settings.module.css
src/components/public-booking/guest-booking.module.css
src/components/public-booking/hold-control.tsx
src/domain/booking-payments/model.ts
src/domain/guest-access/service.ts
src/domain/guest-access/types.ts
src/types/database.ts
supabase/migrations/20261110153112_guest_booking_arrival_window.sql
supabase/tests/database/028_public_booking_payment_methods.test.sql
supabase/tests/database/029_optional_public_booking_times.test.sql
tests/e2e/pricing-settings-layout.spec.ts
tests/e2e/public-checkout.spec.ts
tests/e2e/public-pay-at-marina.spec.ts
tests/e2e/public-payment-options.spec.ts
tests/fixtures/checkout-confirmation-server.mjs
tests/unit/booking-payments.test.ts
tests/unit/guest-access.test.ts
tests/unit/payment-method-settings.test.ts
tests/unit/public-booking-checkout-action.test.ts
tests/unit/public-booking-payment-pricing.test.ts
```

Exclude all seven pre-existing local changes:

```text
docs/MILESTONE_5_PILOT_LAUNCH.zip                         (deleted)
public/brand/berthio-lockup.svg                         (deleted)
public/brand/berthio-mark.svg                           (deleted)
docs/design/reference/Marina A Berth Booking UI.png     (untracked)
docs/design/reference/desktop_a_p_p.jpeg                (untracked)
docs/design/reference/mobile_a_p_p.jpeg                 (untracked)
public/brand/outputss_white_logo.svg                   (untracked)
```

Do not use `git add .` or `git add -A`. Database source typings are required
source; `.next/`, `test-results/`, and `playwright-report/` are ignored artifacts.
After explicit staging, compare the index to this list, scan the staged blobs for
credentials, and run `git diff --cached --check` before any approved commit.

## 1. Back up staging before approving migration execution

Use native PostgreSQL 17 clients on a trusted computer; Docker is unnecessary.
`psql`, `pg_dump`, and `pg_restore` are currently absent on this MacBook. They can
instead run on the Windows desktop. Use the staging connection from Supabase's
Connect dialog (direct connection or session pooler, not transaction pooler).
Set PGHOST, PGPORT, PGUSER, PGDATABASE, PGSSLMODE=verify-full and PGSSLROOTCERT
using the corresponding Supabase CA. Supply the password through a private
PGPASSFILE, never command arguments, source files, or captured terminal logs.

Set `backup_dir` to a private directory outside this repository, then run:

```sh
pg_dump --format=custom --no-owner --no-acl \
  --schema=public --schema=private --schema=auth --schema=supabase_migrations \
  --file="$backup_dir/staging-before-pay-at-marina.dump"
pg_restore --list "$backup_dir/staging-before-pay-at-marina.dump" \
  > "$backup_dir/staging-before-pay-at-marina.contents"
psql -X -At -v ON_ERROR_STOP=1 \
  -c "select pg_get_functiondef('public.get_guest_booking(uuid)'::regprocedure)" \
  > "$backup_dir/get_guest_booking.before.sql"
```

Save the current function owner and privileges alongside the backup:

```sql
select pg_get_userbyid(proowner) as owner, proacl,
  has_function_privilege('anon',oid,'execute') as anon_execute,
  has_function_privilege('authenticated',oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',oid,'execute') as service_role_execute
from pg_proc where oid='public.get_guest_booking(uuid)'::regprocedure;
```

Require successful dump/list commands and a nonempty function backup. This is an
affected-schema logical backup, not a substitute for a full provider disaster
recovery snapshot. Auth data makes the archive sensitive; never commit it. If
backup access is unavailable, stop before applying the migration.

## 2. Test the database on an approved disposable hosted test branch

Use an isolated hosted Supabase branch/project with staging's schema and no
existing fixture data. Provisioning it requires separate approval. Do not load
`supabase/seed.sql` into shared staging: the existing pgTAP suites depend on its
fixed IDs and defaults. Do not repoint localhost-only test scripts at staging or
remove their safety guards.

On that isolated target, apply the new migration, load `supabase/seed.sql` once,
and run the real SQL suites with native clients and pg_prove:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/seed.sql
pg_prove --dbname postgres --recurse supabase/tests/database
```

The environment/PGPASSFILE must target the isolated branch. pg_prove must be
installed separately; psql alone does not turn pgTAP `not ok` results into a
failing exit status. Suites 028 and 029 use BEGIN/ROLLBACK and cover legacy/new
RPC permissions, disabled methods, unpaid balances, idempotency, NULL times,
guest arrival windows, due dates/reminders and admin/staff/tenant permissions.

For the capacity race, enable Pay at Marina on fixture Marina A **only in this
isolated target**, then execute this RPC concurrently in two SQL sessions. Each
session generates a different idempotency key. Use autocommit so the loser can
observe the committed winner:

```sql
with request as (select gen_random_uuid() as idempotency_key)
select request.idempotency_key, result.*
from request cross join lateral public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001',request.idempotency_key,
  '2027-04-10','2027-04-12',null::time,null::time,'Capacity race',19,5.8,3.1,
  'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-04-10","departureDate":"2027-04-12","vesselLengthM":19}'::jsonb,
  repeat('a',64),repeat('b',64),'Test Guest','guest@example.test','+37120000000','morning'
) result;
```

Expected: one `confirmed`, one `unavailable`; one booking, no booking_payments
row, consumed winning hold, full on_site balance_due, zero paid, NULL ETA/ETD,
and morning preference. Repeat the winner's request using its original key:
expect `existing` with the same booking ID. An overlapping online hold must be
unavailable. This uses real database/RPC execution without calling Stripe.

## 3. Stage the schema change before the application

After successful backup, isolated tests, and explicit approval, authenticate the
repository-pinned Supabase CLI without logging credentials:

```sh
npx supabase link --project-ref adbjelqixteggaoekqvj
npx supabase migration list --linked
npx supabase db push --linked --dry-run
```

The dry run must list **only** `20261110153112_guest_booking_arrival_window.sql`.
Stop on drift or additional pending migrations. Never add --include-all,
--include-seed, reset, or migration repair to bypass a mismatch.

For a rehearsal in SQL Editor, begin a transaction, set lock_timeout to 5s and
statement_timeout to 30s, paste the exact migration, perform the catalog checks
below, then ROLLBACK. This is remote DDL even when rolled back and needs approval.
For the approved persistent application, use:

```sh
npx supabase db push --linked
```

The migration runner must apply all four statements in a single transaction and
record the migration version. Do not execute DROP and CREATE in separate SQL
Editor submissions.

```sql
select pg_get_function_result('public.get_guest_booking(uuid)'::regprocedure);
select prosecdef,provolatile,proconfig,
  has_function_privilege('anon',oid,'execute') as anon_execute,
  has_function_privilege('authenticated',oid,'execute') as authenticated_execute,
  has_function_privilege('service_role',oid,'execute') as service_role_execute
from pg_proc where oid='public.get_guest_booking(uuid)'::regprocedure;
select count(*) from public.get_guest_booking(gen_random_uuid());
```

Expect 17 output columns ending in eta_window text; security invoker; stable;
empty search_path; anon/authenticated false; service_role true; unknown grant
returns zero rows. Verify migration history and unchanged booking/payment row
counts. An approved existing signed guest link should preserve access and show
its real window, or Not specified if NULL. Expired/revoked links remain denied.

## 4. Approve Preview deployment and test the actual staging UI

Resolve Vercel automatic deployment handling before an approved push. No key,
account, webhook, or environment-variable changes are part of this feature.

- Toggle Pay at Marina off/on as marina admin; reload to verify persistence;
  marina staff and a different tenant must not change it.
- Disabled: option absent; a stale/direct action requesting it rejects without
  inventory allocation. Enabled: Pay Online default, unchanged total/fees/VAT.
- Confirm Pay at Marina with no ETA preference and then a selected window on a
  separate nonconflicting stay; verify confirmed/unpaid, no Stripe Session or
  transaction row, one reservation after retries/refresh, and blocked capacity.
- Check signed guest details, marina operations, and actual test-inbox delivery.
  Enter a real exact ETA later; check marina-local due_at and reminders. Record
  an offline payment through the existing staff workflow.
- Exercise the existing Stripe test Checkout path with separately authorized
  test-payment permission; verify paid webhook and confirmed booking without
  changing any Stripe configuration.

## Recovery and release gate

If the four-statement migration fails, its transaction must leave the original
function and privileges intact. If later projection recovery is needed, use a
reviewed forward migration that drops the extended function and recreates the
saved original function atomically, restores owner postgres, revokes PUBLIC,
anon and authenticated execution, and grants only service_role execution.
Do not undo the optional-times migration or manufacture times in existing rows.
The current application safely treats an absent eta_window projection as NULL.

The existing 309 unit tests, 22 HTTP-fixture browser tests, build, TypeScript and
ESLint passed. Real hosted migration, RPC/concurrency/RLS tests, backup recovery,
notification delivery, and staging payment regression remain pending.
