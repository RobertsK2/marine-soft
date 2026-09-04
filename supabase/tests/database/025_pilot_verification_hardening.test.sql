begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  not has_column_privilege('authenticated', 'public.marinas', 'is_public', 'update'),
  'authenticated clients cannot directly update publication state'
);
select ok(
  not has_column_privilege('anon', 'public.marinas', 'is_public', 'update'),
  'anonymous clients cannot update publication state'
);
select function_privs_are(
  'public', 'set_marina_publication_state',
  array['uuid', 'uuid', 'timestamptz', 'boolean', 'boolean'],
  'service_role', array['EXECUTE'],
  'the readiness-enforcing publication RPC remains server-only'
);

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  'c9100000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'pilot-admin@example.test', '', now(),
  '{}', '{}', now(), now()
);
insert into public.organization_members(organization_id, user_id, role)
values (
  'd0000000-0000-4000-8000-000000000001',
  'c9100000-0000-4000-8000-000000000001',
  'marina_admin'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"c9100000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$update public.marinas set is_public = false
    where id = 'd1000000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'a same-tenant admin cannot bypass publication readiness with a direct update'
);
reset role;

select is(
  (select is_public from public.marinas
    where id = 'd1000000-0000-4000-8000-000000000001'),
  true,
  'the denied direct update leaves publication state unchanged'
);
select ok(
  has_column_privilege('authenticated', 'public.marinas', 'public_description', 'update'),
  'existing authenticated profile-edit capability is preserved'
);

select * from finish();
rollback;
