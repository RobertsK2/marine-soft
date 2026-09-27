# M5 Task 7 — staging backup and restore drill

## Status (2026-09-27)

**PASS for the staging logical export and isolated restore drill.** The staging source was confirmed as `adbjelqixteggaoekqvj`. Schema/data export, isolated restore, data integrity, verification-only Auth sign-in, application booking readback, and tenant isolation passed. The isolated targets and temporary sensitive export files were removed. No operation targeted production or restored over active staging. Provider physical-backup recovery and operational enforcement of the daily/30-day policy remain separate pilot readiness work.

## Drill evidence

- Source: confirmed staging Supabase project `adbjelqixteggaoekqvj`, PostgreSQL 17.6. Destination: newly created container `berthio-m5-task7-restore-20260927`, `--network none`, new database `m5_task7_restore2`. The preexisting local Supabase databases were not used as destinations.
- Backup: Supabase CLI 2.113.0 `db dump --linked` schema export, followed by `--data-only --use-copy`, selecting `public`, `private`, `auth`, `storage`, `extensions`, and `supabase_migrations`. Schema file: 401,234 bytes, SHA-256 `9124fd5ad71ffe2af8dc0786607f2c6f4fee61e2f036fbb73fc2d7e723d4105e`. Data file: 444,989 bytes, SHA-256 `6ef5387a2faaf4a504b1fb7a84fe6250c3a1e58478c252f19491e481acbc06af9`. Created around 17:29 UTC. The export contains staging Auth records and must be handled as sensitive data. Storage object bytes are not included.
- Restore: Supabase PostgreSQL image `17.6.1.155`. The first attempt exposed the required `btree_gist` extension. In a second fresh database, `btree_gist` was installed in `extensions` before applying the schema. Schema and data imports then exited 0. This is a logical database restore drill, not a provider physical-backup restore.
- Counts and complete-row hashes matched between source and restore: `marinas` 2, `berths` 14, `bookings` 9, `booking_payments` 3, `booking_payment_balances` 1, `audit_events` 56, `notification_outbox` 11. The hashes covered every column of every row in each table, ordered by ID.
- Migration history matched: 29 versions. Public indexes matched: 78. Application function definitions matched: 66. All 24 public table RLS settings matched. All 182 public constraints and 46 policies existed by name. Fifteen definition-string differences were attributable to schema qualification (`auth.users`, `auth.uid`) or extra parentheses in rendered check expressions; no named object was missing.
- Relationship checks found zero orphan berths, bookings, balances, notifications, booking payments, or booking audit events; zero priced bookings had snapshot currency/total mismatch; zero public constraints were unvalidated. A representative priced booking had valid stay/vessel details, matching price snapshot, three audit events, two notifications, and a balance record. A restored authenticated member could see its own marina but not an isolated second-tenant marina in a rolled-back SQL RLS check.
- No delivery worker, application, or webhook was started against the restored target. Its Docker network mode was `none`, preventing external email/payment calls. No customer email or payment was sent by this drill.
- The first isolated restore container was stopped and removed by 17:36 UTC. A second isolated local Supabase stack (`berthio-m5-task7-app-restore`, ports 57321/57322) was populated from the same staging export for application verification. The critical-table counts and complete-row hashes matched again. A verification-only `marina_staff` account was created only in that local stack and signed in via Supabase Auth and the Berthio login form. The booking detail returned HTTP 200 and showed the reference, vessel, stay, financial/balance summary, original price snapshot, and audit history. Authenticated Data API reads returned the corresponding balance, three audit events, and two notification records. That account saw only its own marina, not the other restored marina.
- The local application ran with payment credentials disabled; no delivery worker or webhook was started. The second Supabase stack was stopped with `--no-backup`; its remaining isolated volume was removed. The application was stopped. Exact-path deletion removed the staging export and all duplicated data, temporary login credentials, and local API keys from the test workdir. Verification found zero remaining export files, restore containers, or volumes. File removal does not claim forensic erasure of previously written disk blocks.
- Approximate drill window: 17:29–17:59 UTC on 2026-09-27, about 30 minutes including the second application target. Result: PASS for the staging logical drill. Recovery owner and restore approver: Roberts, per the user's instruction. The private policy record is at `C:\Users\Roberts\AppData\Local\Berthio\ops\backup-restore-policy.md`.

## Manual staging procedure

1. In the private operations register, record the staging Supabase project ref, staging app URL, backup owner, restore operator and approver, backup schedule, retention, provider encryption guarantees, and recovery targets. Confirm the source ref with the environment owner. Keep credentials and customer data out of this file.
2. Record a UTC start time and a source snapshot time. In the **staging** project's Database > Backups page, check the available backup and whether **Restore to a New Project** is available. Supabase's [restore-to-new-project guide](https://supabase.com/docs/guides/platform/clone-project) requires a paid plan and physical backups. If available, choose a staging backup and a **new** project; review the displayed cost and record the new project ref before starting. If unavailable, create a logical export using the project-specific application-schema approach in the [Milestone 4 runbook](../milestone-4/PILOT_OPERATIONS_RUNBOOK.md), then restore into a newly provisioned, empty, isolated database. Never use an existing project/database as the destination.
3. Before any restore, compare source and destination refs and verify the destination has no production or staging app, scheduler, webhook, email, or payment credentials. A provider clone copies database content, including `auth` users, but needs separate Auth/API settings and does not copy Storage objects. Disable cloned external database jobs/extensions that could call outside services. Keep the restored app and notification worker stopped until safe, test-only configuration is in place.
4. Restore. Record method, backup timestamp, UTC completion time, source/destination refs, and any errors in the private register. Check migration history against `supabase/migrations` and confirm `public`, `private`, `auth`, and `storage` schema presence as applicable. Check primary/foreign/exclusion constraints, indexes, RLS and policies, and application functions. A schema count alone is insufficient.
5. Capture read-only counts on the staging source at the snapshot time and on the restored target for `marinas`, `berths`, `bookings`, `booking_payments`, `booking_payment_balances`, `audit_events`, and `notification_outbox`. Allow for writes made on staging after the snapshot. Compare representative IDs, marina relationships, booking reference/stay/vessel details, immutable `price_snapshot` and total, payment status/balance, audit history, and notification history. Do not export personal data into this repository.
6. With a verification-only account and a restored app configured solely for the isolated target, sign in and open a representative booking detail. Verify its stay/vessel, price snapshot, payment/balance, audit, and notification history. Verify that the account cannot read another tenant's data through the application or Data API. Confirm the delivery worker and Stripe webhooks remain inactive and no email or payment was sent.
7. Record PASS only if export/backup, restore, schema, data, app readback, tenant isolation, and side-effect checks all pass. Record duration, result, issues, and approver privately. Delete **only the recorded isolated target** after verifying its identity again; record UTC deletion time. Retain operational backups under the approved policy, or delete a disposable drill export after evidence capture.

## Read-only SQL checks

Run on source and restored target with the same snapshot basis. Save counts and UUIDs in the private register, not this repository.

```sql
select 'marinas' as table_name, count(*) from public.marinas
union all select 'berths', count(*) from public.berths
union all select 'bookings', count(*) from public.bookings
union all select 'booking_payments', count(*) from public.booking_payments
union all select 'booking_payment_balances', count(*) from public.booking_payment_balances
union all select 'audit_events', count(*) from public.audit_events
union all select 'notification_outbox', count(*) from public.notification_outbox;

select count(*) as orphan_berths from public.berths b
left join public.marinas m on m.id = b.marina_id where m.id is null;
select count(*) as orphan_bookings from public.bookings b
left join public.marinas m on m.id = b.marina_id where m.id is null;
select count(*) as orphan_balances from public.booking_payment_balances p
left join public.bookings b on b.id = p.booking_id
where b.id is null or b.marina_id <> p.marina_id;
select count(*) as orphan_notifications from public.notification_outbox n
left join public.bookings b on b.id = n.booking_id
where n.booking_id is not null and (b.id is null or b.marina_id <> n.marina_id);
select count(*) as invalid_price_snapshots from public.bookings
where price_snapshot is not null and (
  price_snapshot ->> 'currency' is distinct from price_currency
  or (price_snapshot ->> 'totalMinor')::bigint is distinct from price_total_minor
);

select n.nspname, c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in
  ('marinas','berths','bookings','booking_payments',
   'booking_payment_balances','audit_events','notification_outbox')
order by c.relname;
select schemaname, tablename, policyname from pg_policies
where schemaname = 'public' and tablename in
  ('marinas','berths','bookings','booking_payments',
   'booking_payment_balances','audit_events','notification_outbox')
order by tablename, policyname;
select conrelid::regclass as table_name, conname, contype
from pg_constraint where connamespace = 'public'::regnamespace
  and conrelid in (
    'public.marinas'::regclass, 'public.berths'::regclass,
    'public.bookings'::regclass, 'public.booking_payments'::regclass,
    'public.booking_payment_balances'::regclass,
    'public.audit_events'::regclass, 'public.notification_outbox'::regclass
  ) order by table_name, conname;
```

Compare migration versions in `supabase_migrations.schema_migrations` and inspect representative rows with a tightly scoped `where id = ...` query. The orphan and invalid snapshot counts must be zero on the restored target; counts and policy/constraint lists must match the staging snapshot. Record any justified difference.

## Remaining pilot readiness items

- This free-plan staging project cannot use Supabase's paid-plan physical-backup Restore to a New Project feature. Provider physical-backup recovery remains untested; the logical export path was proven instead.
- Roberts' private policy specifies daily backups and 30-day retention. Automation, retention enforcement, Storage object backup, encryption/provider guarantees, and a numeric recovery time target have not been verified or set up. Do not treat this drill export, which was deleted after verification, as a retained operational backup.

Safe to merge this Task 7 evidence: **Yes**. Pilot launch readiness remains subject to the operational items above.
