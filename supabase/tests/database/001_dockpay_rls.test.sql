begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.marinas'::regclass),
  'marinas has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organization_members'::regclass),
  'organization_members has RLS enabled'
);
select has_column('public', 'organization_members', 'id', 'memberships have an id');
select has_pk('public', 'organization_members', 'memberships have a primary key');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'admin-a@example.test', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'staff-a@example.test', '',
    now(), '{}', '{}', now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'admin-b@example.test', '',
    now(), '{}', '{}', now(), now()
  );

insert into public.organizations (id, name)
values
  ('a0000000-0000-0000-0000-000000000001', 'Marina A Organization'),
  ('b0000000-0000-0000-0000-000000000002', 'Marina B Organization');

insert into public.marinas (id, organization_id, name, slug, timezone)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Marina A', 'rls-marina-a', 'Europe/Riga'
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'Marina B', 'rls-marina-b', 'Europe/Riga'
  );

insert into public.organization_members (organization_id, user_id, role)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    'marina_admin'
  ),
  (
    'a0000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    'marina_staff'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000001',
    'marina_admin'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select results_eq(
  'select name from public.organizations order by name',
  array['Marina A Organization'::text],
  'Marina A admin sees only Marina A organization'
);
select results_eq(
  'select name from public.marinas order by name',
  array['Marina A'::text],
  'Marina A admin sees only Marina A marina'
);
select results_eq(
  'select role::text from public.organization_members order by role',
  array['marina_admin'::text, 'marina_staff'::text],
  'Marina A admin resolves both Marina A roles'
);
select results_eq(
  $$update public.marinas set name = 'Marina A Updated'
    where id = 'a1000000-0000-0000-0000-000000000001' returning name$$,
  array['Marina A Updated'::text],
  'Marina A admin can update Marina A'
);
select results_eq(
  $$update public.marinas set name = 'Compromised'
    where id = 'b1000000-0000-0000-0000-000000000002' returning name$$,
  array[]::text[],
  'Marina A admin cannot update Marina B'
);
select throws_ok(
  $$insert into public.marinas (organization_id, name, slug, timezone)
    values ('b0000000-0000-0000-0000-000000000002', 'Injected', 'injected', 'UTC')$$,
  '42501',
  null,
  'Marina A admin cannot insert into Marina B'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select results_eq(
  'select name from public.organizations order by name',
  array['Marina A Organization'::text],
  'Marina A staff sees Marina A organization'
);
select results_eq(
  'select role::text from public.organization_members',
  array['marina_staff'::text],
  'Marina A staff role resolves correctly'
);
select results_eq(
  $$update public.marinas set name = 'Staff Changed'
    where id = 'a1000000-0000-0000-0000-000000000001' returning name$$,
  array[]::text[],
  'Marina staff cannot change marina configuration'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select results_eq(
  'select name from public.marinas order by name',
  array['Marina B'::text],
  'Marina B admin sees only Marina B'
);
select is(
  (
    select count(*)
    from public.organizations
    where id = 'a0000000-0000-0000-0000-000000000001'
  ),
  0::bigint,
  'Marina B admin cannot read Marina A by manipulated id'
);
select results_eq(
  $$update public.marinas set name = 'Marina B Updated'
    where id = 'b1000000-0000-0000-0000-000000000002' returning name$$,
  array['Marina B Updated'::text],
  'Marina B admin can update Marina B'
);
select throws_ok(
  $$insert into public.organization_members (organization_id, user_id, role)
    values (
      'a0000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001',
      'marina_admin'
    )$$,
  '42501',
  null,
  'client cannot create a cross-tenant membership'
);

reset role;
select ok(
  not has_table_privilege('anon', 'public.organizations', 'select'),
  'anonymous users have no organization table access'
);

select * from finish();
rollback;
