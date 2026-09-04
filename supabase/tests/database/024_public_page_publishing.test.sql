begin;
create extension if not exists pgtap with schema extensions;
select plan(32);

select has_function('public', 'set_marina_publication_state', array['uuid', 'uuid', 'timestamptz', 'boolean', 'boolean'], 'publication mutation RPC exists');
select function_privs_are('public', 'set_marina_publication_state', array['uuid', 'uuid', 'timestamptz', 'boolean', 'boolean'], 'service_role', array['EXECUTE'], 'only the server role is granted publication execution');
select ok(not has_function_privilege('authenticated', 'public.set_marina_publication_state(uuid,uuid,timestamptz,boolean,boolean)', 'execute'), 'authenticated browser clients cannot call the privileged publication RPC');
select ok(not has_function_privilege('anon', 'public.set_marina_publication_state(uuid,uuid,timestamptz,boolean,boolean)', 'execute'), 'anonymous clients cannot call the publication RPC');
select has_trigger('public', 'marinas', 'marinas_capture_publication_audit', 'publication state has audit coverage');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c8100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'publishing-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-8000-000000000000', 'c8100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'publishing-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c8100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'publishing-other@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'c8100000-0000-4000-8000-000000000003', 'marina_admin');

create temporary table phase6_booking_baseline as
select id, price_total_minor, price_currency, price_snapshot, status
from public.bookings
where marina_id = 'd1000000-0000-4000-8000-000000000001';
create temporary table phase6_payment_baseline as
select id, status, amount_total_minor, currency, price_snapshot
from public.booking_payments
where marina_id = 'd1000000-0000-4000-8000-000000000001';
grant select on phase6_booking_baseline, phase6_payment_baseline to service_role;

set local role service_role;

select is(
  (select outcome from public.set_marina_publication_state(
    'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
    (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), false, false
  )),
  'updated',
  'admin can unpublish even when integrations are not ready'
);
select is((select is_public from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), false, 'unpublish changes only the publication flag');
select is((select event_type from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.unpublished' order by id desc limit 1), 'marina.unpublished', 'unpublish is audited');
select is((select actor_id from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.unpublished' order by id desc limit 1), 'c8100000-0000-4000-8000-000000000001'::uuid, 'audit records the acting admin');
select is((select before_data from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.unpublished' order by id desc limit 1), '{"isPublic": true}'::jsonb, 'audit before state contains only publication state');
select is((select after_data from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.unpublished' order by id desc limit 1), '{"isPublic": false}'::jsonb, 'audit after state contains only publication state');
reset role;
set local role anon;
select is((select count(*) from public.marinas where slug = 'marina-a'), 0::bigint, 'unpublished slug is unavailable through the existing anonymous policy');
reset role;
set local role service_role;

select is(
  (select outcome from public.set_marina_publication_state(
    'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
    (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, false
  )),
  'not_ready',
  'missing integration readiness blocks publishing'
);
select is((select blockers from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, false
)), array['integrations']::text[], 'the server receives a clear integration blocker');
select is((select is_public from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), false, 'blocked publishing leaves the page unpublished');

update public.marinas set public_description = null where id = 'd1000000-0000-4000-8000-000000000001';
select is((select blockers from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, true
)), array['profile']::text[], 'missing core public profile content blocks publishing');
update public.marinas set public_description = 'Restored public description' where id = 'd1000000-0000-4000-8000-000000000001';

delete from public.pricing_season_meter_rates where season_id = 'd6000000-0000-4000-8000-000000000001';
select is((select blockers from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, true
)), array['pricing']::text[], 'an incomplete existing pricing-engine catalog blocks publishing');
insert into public.pricing_season_meter_rates(season_id, marina_id, nightly_rate_per_meter_minor)
values ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 200);

select is(
  (select outcome from public.set_marina_publication_state(
    'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
    (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, true
  )),
  'updated',
  'admin can publish a ready marina'
);
select is((select is_public from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, 'ready publish makes the page public');
select is((select event_type from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.published' order by id desc limit 1), 'marina.published', 'publish is audited');
select is((select actor_email from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'marina.published' order by id desc limit 1), 'publishing-admin@example.test', 'publish audit resolves the admin email');

select is((select outcome from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000001',
  '2000-01-01 00:00:00+00', false, true
)), 'conflict', 'stale publication versions fail optimistically');
select is((select is_public from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), true, 'a stale mutation does not change publication state');

select throws_ok($$select * from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000002',
  (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), false, true
)$$, '42501', 'Marina admin access is required.', 'marina staff cannot publish or unpublish');
select throws_ok($$select * from public.set_marina_publication_state(
  'd1000000-0000-4000-8000-000000000001', 'c8100000-0000-4000-8000-000000000003',
  (select updated_at from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), false, true
)$$, '42501', 'Marina admin access is required.', 'another tenant admin cannot change publication');
select is((select is_public from public.marinas where id = 'e1000000-0000-4000-8000-000000000002'), false, 'other tenant publication state is untouched');

reset role;
set local role anon;
select is((select count(*) from public.marinas where slug = 'marina-a'), 1::bigint, 'published slug is visible anonymously through the existing policy');
reset role;

set local role service_role;
select is((select count(*) from (
  (select * from phase6_booking_baseline except select id, price_total_minor, price_currency, price_snapshot, status from public.bookings where marina_id = 'd1000000-0000-4000-8000-000000000001')
  union all
  (select id, price_total_minor, price_currency, price_snapshot, status from public.bookings where marina_id = 'd1000000-0000-4000-8000-000000000001' except select * from phase6_booking_baseline)
) differences), 0::bigint, 'publication changes preserve existing bookings and immutable price snapshots');
select is((select count(*) from (
  (select * from phase6_payment_baseline except select id, status, amount_total_minor, currency, price_snapshot from public.booking_payments where marina_id = 'd1000000-0000-4000-8000-000000000001')
  union all
  (select id, status, amount_total_minor, currency, price_snapshot from public.booking_payments where marina_id = 'd1000000-0000-4000-8000-000000000001' except select * from phase6_payment_baseline)
) differences), 0::bigint, 'publication changes preserve payment and financial history');
select is((select count(*) from public.audit_events where marina_id = 'e1000000-0000-4000-8000-000000000002' and event_type in ('marina.published', 'marina.unpublished')), 0::bigint, 'publication audit remains tenant-scoped');
select is((select count(*) from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and actor_id = 'c8100000-0000-4000-8000-000000000001' and event_type = 'marina.published'), 1::bigint, 'one publish transition creates one audit event');
select is((select count(*) from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and actor_id = 'c8100000-0000-4000-8000-000000000001' and event_type = 'marina.unpublished'), 1::bigint, 'one unpublish transition creates one audit event');

select * from finish();
rollback;
