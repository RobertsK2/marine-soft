begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

select has_index(
  'public', 'berths', 'berths_marina_code_unique_idx',
  'berth imports use the marina-scoped case-insensitive code constraint'
);
select has_trigger(
  'public', 'berths', 'berths_capture_audit',
  'every imported berth is covered by the operational audit trigger'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'import-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'import-staff@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'a2100000-0000-4000-8000-000000000002', 'marina_staff');

create temporary table import_before as
select
  (select count(*) from public.bookings) as booking_count,
  (select count(*) from public.booking_berth_assignments) as assignment_count,
  (select id from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001' and code = 'A-01') as stable_berth_id;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a2100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.berths(
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m,
      priority, status, allow_smaller_vessels
    ) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-T20-A', 'Import Pier', 12.5, 4.2, 2.1, 201, 'available', true),
      ('d1000000-0000-4000-8000-000000000001', 'CSV-T20-B', 'Import Pier', 14.0, 4.8, 2.4, 202, 'blocked', false)$$,
  'an admin can apply a valid multi-row import as one statement'
);
select is(
  (select count(*)::integer from public.berths where code like 'CSV-T20-%'),
  2,
  'the valid import writes exactly the previewed berth count'
);
select is(
  (select count(*)::integer from public.audit_events
    where event_type = 'berth.created' and after_data ->> 'code' like 'CSV-T20-%'),
  2,
  'each successful bulk-created berth has an audit event'
);
select is(
  (select count(*)::integer from public.audit_events
    where event_type = 'berth.created'
      and after_data ->> 'code' like 'CSV-T20-%'
      and actor_id = 'a2100000-0000-4000-8000-000000000001'),
  2,
  'bulk audit events retain the importing admin actor'
);

select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-CROSS-OWN', 'Pier', 10, 3, 2),
      ('e1000000-0000-4000-8000-000000000002', 'CSV-CROSS-OTHER', 'Pier', 10, 3, 2)$$,
  '42501', null,
  'a cross-tenant row rejects the entire import statement'
);
select is(
  (select count(*)::integer from public.berths where code = 'CSV-CROSS-OWN'),
  0,
  'the otherwise-valid own-tenant row rolls back after a cross-tenant failure'
);

select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-DIM-VALID', 'Pier', 10, 3, 2),
      ('d1000000-0000-4000-8000-000000000001', 'CSV-DIM-BAD', 'Pier', -1, 3, 2)$$,
  '23514', null,
  'an invalid dimension rejects the entire import statement'
);
select is(
  (select count(*)::integer from public.berths where code in ('CSV-DIM-VALID', 'CSV-DIM-BAD')),
  0,
  'no dimension-test rows survive the failed atomic import'
);

select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, status) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-STATUS-VALID', 'Pier', 10, 3, 2, 'available'),
      ('d1000000-0000-4000-8000-000000000001', 'CSV-STATUS-BAD', 'Pier', 10, 3, 2, 'reserved')$$,
  '22P02', null,
  'an invalid status rejects the import'
);
select is(
  (select count(*)::integer from public.berths where code like 'CSV-STATUS-%'),
  0,
  'no status-test rows survive the failed atomic import'
);

select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-DUPLICATE', 'Pier', 10, 3, 2),
      ('d1000000-0000-4000-8000-000000000001', 'csv-duplicate', 'Pier', 11, 3, 2)$$,
  '23505', null,
  'case-insensitive duplicates within one import are rejected'
);
select is(
  (select count(*)::integer from public.berths where lower(code) = 'csv-duplicate'),
  0,
  'duplicate import rows roll back together'
);

select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m) values
      ('d1000000-0000-4000-8000-000000000001', 'CSV-CONFLICT-NEW', 'Pier', 10, 3, 2),
      ('d1000000-0000-4000-8000-000000000001', 'a-01', 'Pier', 10, 3, 2)$$,
  '23505', null,
  'an existing marina code conflict rejects the import'
);
select is(
  (select count(*)::integer from public.berths where code = 'CSV-CONFLICT-NEW'),
  0,
  'a new row is not partially committed beside an existing-code conflict'
);

select set_config('request.jwt.claims', '{"sub":"a2100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.berths(marina_id, code, zone, max_length_m, max_beam_m, max_draft_m)
    values ('d1000000-0000-4000-8000-000000000001', 'CSV-STAFF', 'Pier', 10, 3, 2)$$,
  '42501', null,
  'marina staff cannot apply an import'
);

reset role;
select is(
  (select count(*) from public.bookings),
  (select booking_count from import_before),
  'imports do not mutate bookings'
);
select is(
  (select count(*) from public.booking_berth_assignments),
  (select assignment_count from import_before),
  'imports do not mutate existing berth assignments'
);
select is(
  (select id from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001' and code = 'A-01'),
  (select stable_berth_id from import_before),
  'existing berth IDs remain stable'
);
select is(
  (select count(*)::integer from public.berths where marina_id = 'e1000000-0000-4000-8000-000000000002' and code = 'CSV-CROSS-OTHER'),
  0,
  'the cross-tenant identifier never creates a berth in the other marina'
);

select * from finish();
rollback;
