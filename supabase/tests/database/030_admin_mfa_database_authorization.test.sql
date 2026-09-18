begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'f1100000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'mfa-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'f1100000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'mfa-staff@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members (organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'f1100000-0000-4000-8000-000000000002', 'marina_staff');

insert into public.bookings (
  id, marina_id, arrival_date, departure_date, eta, etd, customer_name,
  customer_email, customer_phone, vessel_length_m, vessel_beam_m, vessel_draft_m
) values (
  'f1200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  '2035-06-01', '2035-06-03', '14:00', '10:00', 'MFA fixture',
  'mfa-booking@example.test', '+37120000001', 8, 2.8, 1.4
);

-- Any newly exposed RPC must be explicitly reviewed, including invoker wrappers.
select is((select array_agg(proname::text order by proname) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')),
  array['assign_booking_berth','get_marina_integration_health','replace_marina_cancellation_policy',
        'replace_marina_pricing_configuration','transition_booking_stay']::text[],
  'authenticated RPC surface contains only the five MFA-guarded entry points');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and not coalesce(p.proconfig @> array['search_path=""'], false)), 0,
  'every application SECURITY DEFINER has an explicit empty search path');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prosecdef
    and has_function_privilege('anon',p.oid,'execute')), 0,
  'anonymous callers have no SECURITY DEFINER entry point');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
select is(private.is_organization_member('d0000000-0000-4000-8000-000000000001'), false, 'AAL1 admin is not an authorized organization member');
select is(private.is_organization_admin('d0000000-0000-4000-8000-000000000001'), false, 'AAL1 admin is not an authorized organization admin');
select is(private.is_marina_member('d1000000-0000-4000-8000-000000000001'), false, 'AAL1 admin is not an authorized marina member');
select is(private.is_marina_admin('d1000000-0000-4000-8000-000000000001'), false, 'AAL1 admin is not an authorized marina admin');
select is((select count(*)::integer from public.organization_members where user_id = auth.uid()), 1, 'AAL1 admin retains self membership for MFA bootstrap');
select is((select count(*)::integer from public.organizations where id = 'd0000000-0000-4000-8000-000000000001'), 0, 'AAL1 admin cannot read private organization data');
select is((select count(*)::integer from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001'), 0, 'AAL1 admin cannot read operational berth data');
select throws_ok($$select * from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')$$,
  '42501', 'Marina admin access is required.', 'AAL1 admin cannot call SECURITY DEFINER integration RPC');
select throws_ok($$select * from public.replace_marina_pricing_configuration('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'AAL1 admin cannot call SECURITY DEFINER pricing RPC');
select throws_ok($$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'AAL1 admin cannot call SECURITY DEFINER cancellation RPC');
with updated as (update public.organizations set name = 'AAL1 denied'
  where id = 'd0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::integer from updated), 0, 'AAL1 admin cannot update organization through Data API policy');
select throws_ok($$insert into public.berths(marina_id,code,max_length_m,max_beam_m,max_draft_m)
  values('d1000000-0000-4000-8000-000000000001','MFA-DENIED',8,3,2)$$,
  '42501', null, 'AAL1 admin cannot insert through RLS');
with deleted as (delete from public.berths where marina_id='d1000000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::integer from deleted), 0, 'AAL1 admin cannot delete through RLS');
select is((select outcome from public.assign_booking_berth('f1200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')),
  'not_found', 'AAL1 admin cannot bypass RLS through assignment definer');
select is((select outcome from public.transition_booking_stay('f1200000-0000-4000-8000-000000000001','checked_in',true)),
  'not_found', 'AAL1 admin cannot bypass RLS through stay transition definer');
select is((select count(*)::integer from public.organization_members where user_id <> auth.uid()), 0,
  'MFA bootstrap exposes no other memberships');
select is((select count(*)::integer from public.bookings), 0, 'AAL1 admin cannot read booking PII');
select is((select count(*)::integer from public.marina_pricing_configs), 0, 'AAL1 admin cannot read pricing');
select is((select count(*)::integer from public.marina_cancellation_policies), 0, 'AAL1 admin cannot read cancellation policies');
select throws_ok($$select * from public.set_marina_publication_state('d1000000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000001',null,false,true)$$,
  '42501', null, 'AAL1 cannot call service-only publication RPC with a forged actor');

select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(private.is_marina_member('d1000000-0000-4000-8000-000000000001'), false, 'missing AAL claim is not an MFA bypass');
select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","user_metadata":{"aal":"aal2","role":"marina_staff"}}', true);
select is(private.is_marina_member('d1000000-0000-4000-8000-000000000001'), false, 'user-editable metadata cannot bypass MFA');

select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is(private.is_organization_member('d0000000-0000-4000-8000-000000000001'), true, 'AAL1 staff retains organization membership');
select is(private.is_marina_member('d1000000-0000-4000-8000-000000000001'), true, 'AAL1 staff retains marina membership');
select is(private.is_organization_admin('d0000000-0000-4000-8000-000000000001'), false, 'staff remains non-admin');
select cmp_ok((select count(*) from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001'), '>', 0::bigint, 'AAL1 staff retains operational berth reads');
select throws_ok($$select * from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')$$,
  '42501', 'Marina admin access is required.', 'AAL1 staff still cannot call admin integration RPC');

select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select is(private.is_organization_member('d0000000-0000-4000-8000-000000000001'), true, 'AAL2 admin regains organization membership');
select is(private.is_organization_admin('d0000000-0000-4000-8000-000000000001'), true, 'AAL2 admin regains organization admin role');
select is(private.is_marina_member('d1000000-0000-4000-8000-000000000001'), true, 'AAL2 admin regains marina membership');
select is(private.is_marina_admin('d1000000-0000-4000-8000-000000000001'), true, 'AAL2 admin regains marina admin role');
select is((select count(*)::integer from public.organizations where id = 'd0000000-0000-4000-8000-000000000001'), 1, 'AAL2 admin reads its organization');
select cmp_ok((select count(*) from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001'), '>', 0::bigint, 'AAL2 admin reads operational berths');
select is((select count(*)::integer from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 1, 'AAL2 admin calls SECURITY DEFINER integration RPC');
with updated as (update public.organizations set name = 'AAL2 allowed'
  where id = 'd0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::integer from updated), 1, 'AAL2 admin updates its organization');
select is((select outcome from public.assign_booking_berth('f1200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')),
  'assigned', 'AAL2 admin successfully assigns through definer');
select is((select outcome from public.transition_booking_stay('f1200000-0000-4000-8000-000000000001','checked_in',false)),
  'checked_in', 'AAL2 admin successfully checks in through definer');
select is((select count(*)::integer from public.organizations where id='e0000000-0000-4000-8000-000000000002'), 0,
  'AAL2 does not grant cross-tenant access');

select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
select is((select outcome from public.transition_booking_stay('f1200000-0000-4000-8000-000000000001','checked_out',false)),
  'checked_out', 'AAL1 staff successfully checks out through definer');

reset role;
update public.organization_members set status='suspended' where user_id='f1100000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f1100000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
select is(private.is_marina_admin('d1000000-0000-4000-8000-000000000001'), false, 'AAL2 does not override suspended membership');

reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select count(*)::integer from public.organizations where id = 'd0000000-0000-4000-8000-000000000001'), 1, 'service role retains organization read');
select cmp_ok((select count(*) from public.berths where marina_id = 'd1000000-0000-4000-8000-000000000001'), '>', 0::bigint, 'service role retains operational read');
with updated as (update public.organizations set name='Service operation' where id='d0000000-0000-4000-8000-000000000001' returning id)
select is((select count(*)::integer from updated), 1, 'service role retains writes without AAL');

reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select cmp_ok((select count(name) from public.marinas where slug='marina-a'), '>', 0::bigint,
  'public published marina read survives MFA enforcement');

select * from finish();
rollback;
