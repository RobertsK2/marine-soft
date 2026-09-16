# M5.7 — Backup and Restore Drill

## Goal

Prove that a backup can be restored and that the restored Berthio data is usable and internally consistent.

A checkbox saying “Supabase has backups” is not enough. The risk being tested is whether you can recover the application data correctly when you actually need it.

## Production policy prerequisite

Before pilot launch, privately record:

- which Supabase project owns production data;
- backup frequency;
- retention period;
- encryption/provider guarantees;
- who is responsible for initiating restore;
- who approves a restore;
- target recovery expectations appropriate for the pilot.

## Staging/verification restore procedure

### Step 1 — Create backup

Use the provider-supported backup/export mechanism appropriate to the target environment.

Do not modify production data merely to test backup.

### Step 2 — Restore only into isolation

Restore into a **new isolated verification project/database**.

Never run a restore over:

- production;
- active staging;
- a developer database containing unrelated work.

### Step 3 — Verify schema/migrations

Confirm:

- expected schemas exist;
- migrations are consistent;
- critical constraints/indexes exist;
- RLS/policies/functions needed by the application exist.

### Step 4 — Compare critical data

At minimum compare counts/representative records for:

- `marinas`;
- `berths`;
- `bookings`;
- `booking_payments` or the project’s current payment tables/views;
- `audit_events`;
- `notification_outbox`.

Do not rely only on row counts; inspect relationships and representative records.

### Step 5 — Application verification against restored data

Using a verification-only user/account:

- authenticate;
- prove tenant isolation;
- open one booking detail;
- verify vessel/stay data;
- verify immutable pricing snapshot;
- verify payment/balance state;
- verify audit history;
- verify notification history.

### Step 6 — Prevent accidental external side effects

The restore verification environment must not send real customer emails or process real payments.

Disable/replace external delivery secrets as needed before starting the app against restored data.

### Step 7 — Destroy verification restore

After evidence is captured:

- delete the isolated restore project/database;
- record completion time;
- record result;
- record any recovery issue discovered.

## Local feasibility drill

A local PostgreSQL/Supabase restore drill is useful before cloud restore. It does not replace provider-level production backup evidence, but it can validate schema/data assumptions cheaply.

When using `pg_dump`/restore with Supabase-managed schemas, follow the project’s existing Milestone 4 runbook guidance rather than treating an indiscriminate full-cluster dump as the application restore strategy.

## Failure conditions

FAIL if:

- backup cannot be restored;
- restored schema is missing constraints/policies/functions;
- tenant isolation is broken;
- immutable booking pricing/payment history cannot be verified;
- restore unexpectedly triggers notifications/payments;
- there is no identified recovery owner.

## Exit criteria

- [ ] backup policy/owner documented privately;
- [ ] backup created;
- [ ] restore completed into isolated environment;
- [ ] critical table/data checks passed;
- [ ] application can read representative restored booking data;
- [ ] RLS/tenant isolation still works;
- [ ] restored notifications/payments were not delivered externally;
- [ ] duration/result/approver recorded;
- [ ] isolated restore destroyed after verification.
