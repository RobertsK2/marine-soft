begin;

create extension if not exists pgtap with schema extensions;
select plan(16);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.berths'::regclass),
  'berths has RLS enabled'
);
select has_pk('public', 'berths', 'berths has a primary key');
select is(
  enum_range(null::public.berth_status)::text,
  '{available,blocked,out_of_service}',
  'berth status contains only Phase 3 values'
);
select cmp_ok(
  (
    select count(*)
    from public.berths
    where marina_id = 'd1000000-0000-4000-8000-000000000001'
  ),
  '>=',
  10::bigint,
  'development pilot marina has at least 10 seeded berths'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'berth-admin-a@example.test', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '31000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'berth-staff-a@example.test', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '32000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'berth-admin-b@example.test', '',
    now(), '{}', '{}', now(), now()
  );

insert into public.organizations (id, name)
values
  ('3a000000-0000-4000-8000-000000000001', 'Berth Test Organization A'),
  ('3b000000-0000-4000-8000-000000000002', 'Berth Test Organization B');

insert into public.marinas (id, organization_id, name, slug, timezone)
values
  (
    '3a100000-0000-4000-8000-000000000001',
    '3a000000-0000-4000-8000-000000000001',
    'Berth Test Marina A', 'berth-test-marina-a', 'Europe/Riga'
  ),
  (
    '3b100000-0000-4000-8000-000000000002',
    '3b000000-0000-4000-8000-000000000002',
    'Berth Test Marina B', 'berth-test-marina-b', 'Europe/Riga'
  );

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '3a000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    'marina_admin'
  ),
  (
    '3a000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000002',
    'marina_staff'
  ),
  (
    '3b000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000001',
    'marina_admin'
  );

insert into public.berths (
  id, marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
)
values
  (
    '3a200000-0000-4000-8000-000000000001',
    '3a100000-0000-4000-8000-000000000001',
    'TEST-A-01', 'Test Pier A', 12, 4, 2, 10
  ),
  (
    '3b200000-0000-4000-8000-000000000002',
    '3b100000-0000-4000-8000-000000000002',
    'TEST-B-01', 'Test Pier B', 15, 5, 3, 10
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select code from public.berths order by code',
  array['TEST-A-01'::text],
  'Marina A admin can read its own berths'
);
select is(
  (select count(*) from public.berths where id = '3b200000-0000-4000-8000-000000000002'),
  0::bigint,
  'Marina A cannot read Marina B berth by manipulated id'
);
select results_eq(
  $$update public.berths set zone = 'Compromised'
    where id = '3b200000-0000-4000-8000-000000000002' returning code$$,
  array[]::text[],
  'Marina A cannot update Marina B berths'
);
select results_eq(
  $$delete from public.berths
    where id = '3b200000-0000-4000-8000-000000000002' returning code$$,
  array[]::text[],
  'Marina A cannot delete Marina B berths'
);
select throws_ok(
  $$insert into public.berths (
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
    ) values (
      '3b100000-0000-4000-8000-000000000002',
      'INJECTED', 'Wrong tenant', 12, 4, 2, 20
    )$$,
  '42501',
  null,
  'Marina A cannot create a berth for Marina B'
);
select results_eq(
  $$insert into public.berths (
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
    ) values (
      '3a100000-0000-4000-8000-000000000001',
      'TEST-A-02', 'Test Pier A', 18, 5.5, 3, 20
    ) returning code$$,
  array['TEST-A-02'::text],
  'Marina A admin can create a valid berth'
);
select throws_ok(
  $$insert into public.berths (
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
    ) values (
      '3a100000-0000-4000-8000-000000000001',
      'NEGATIVE', 'Test Pier A', -1, 4, 2, 30
    )$$,
  '23514',
  null,
  'negative berth dimensions are rejected'
);
select throws_ok(
  $$insert into public.berths (
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
    ) values (
      '3a100000-0000-4000-8000-000000000001',
      'BAD-PRIORITY', 'Test Pier A', 10, 3, 2, 0
    )$$,
  '23514',
  null,
  'non-positive priority is rejected'
);
select results_eq(
  $$update public.berths set status = 'blocked'
    where code = 'TEST-A-01' returning status::text$$,
  array['blocked'::text],
  'blocked status update persists'
);
select results_eq(
  $$update public.berths set status = 'out_of_service'
    where code = 'TEST-A-02' returning status::text$$,
  array['out_of_service'::text],
  'out of service status update persists'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"31000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select results_eq(
  'select code from public.berths order by code',
  array['TEST-A-01'::text, 'TEST-A-02'::text],
  'Marina staff can read its own marina berths'
);
select throws_ok(
  $$insert into public.berths (
      marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority
    ) values (
      '3a100000-0000-4000-8000-000000000001',
      'STAFF-INSERT', 'Test Pier A', 10, 3, 2, 50
    )$$,
  '42501',
  null,
  'Marina staff cannot create berths'
);

reset role;
select * from finish();
rollback;
