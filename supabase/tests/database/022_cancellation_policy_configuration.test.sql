begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

select has_table('public', 'marina_cancellation_policies', 'marina cancellation policies exist');
select has_table('public', 'marina_cancellation_policy_tiers', 'marina cancellation policy tiers exist');
select has_function('public', 'replace_marina_cancellation_policy', array['uuid', 'timestamp with time zone', 'jsonb'], 'atomic cancellation policy RPC exists');
select function_privs_are('public', 'replace_marina_cancellation_policy', array['uuid', 'timestamp with time zone', 'jsonb'], 'authenticated', array['EXECUTE'], 'authenticated users can call the guarded policy RPC');
select ok(not has_function_privilege('anon', 'public.replace_marina_cancellation_policy(uuid,timestamp with time zone,jsonb)', 'execute'), 'anonymous users cannot call policy RPC');
select ok((select relrowsecurity from pg_class where oid = 'public.marina_cancellation_policies'::regclass), 'cancellation policies enforce RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.marina_cancellation_policy_tiers'::regclass), 'cancellation tiers enforce RLS');
select ok(not has_table_privilege('authenticated', 'public.marina_cancellation_policies', 'insert'), 'admins cannot bypass atomic policy writes');
select ok(not has_table_privilege('authenticated', 'public.marina_cancellation_policy_tiers', 'insert'), 'admins cannot insert tiers directly');
select is((select evaluation_rule from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), 'active_at_evaluation', 'existing marina receives explicit evaluation rule');
select is((select count(*)::integer from public.marina_cancellation_policy_tiers where marina_id = 'd1000000-0000-4000-8000-000000000001'), 3, 'existing hard-coded behavior is backfilled as three tiers');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c6100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'policy-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c6100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'policy-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c6100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'policy-other@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'c6100000-0000-4000-8000-000000000003', 'marina_admin');
insert into public.bookings(
  id, marina_id, arrival_date, departure_date, eta, etd, customer_name, customer_email,
  customer_phone, vessel_length_m, vessel_beam_m, vessel_draft_m, status,
  price_currency, price_total_minor, price_snapshot
) values (
  'c6200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  current_date + 10, current_date + 12, '14:00', '10:00', 'Policy Preview', 'policy-preview@example.test',
  '+37120000620', 12, 4, 2, 'confirmed', 'EUR', 10000,
  '{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb
);

create temporary table cancellation_config_booking_before as
select jsonb_agg(to_jsonb(bookings) order by id) snapshot from public.bookings;
create temporary table cancellation_config_payment_before as
select coalesce(jsonb_agg(to_jsonb(payments) order by id), '[]'::jsonb) snapshot from public.booking_payments payments;
create temporary table cancellation_config_history_before as
select coalesce(jsonb_agg(to_jsonb(events) order by id), '[]'::jsonb) snapshot from public.booking_cancellation_events events;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c6100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is((select count(*)::integer from public.marina_cancellation_policies), 1, 'admin reads only the owned marina policy');
select results_eq(
  $$select outcome from public.replace_marina_cancellation_policy(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"none","minDaysBeforeArrival":null,"maxDaysBeforeArrival":1,"refundPercent":0},{"policyCode":"partial","minDaysBeforeArrival":2,"maxDaysBeforeArrival":6,"refundPercent":40},{"policyCode":"custom_full","minDaysBeforeArrival":7,"maxDaysBeforeArrival":null,"refundPercent":80}]}'::jsonb
  )$$,
  array['updated'::text], 'admin atomically replaces owned cancellation policy'
);
select is((select refund_percent from public.marina_cancellation_policy_tiers where policy_code = 'custom_full'), 80::smallint, 'valid refund percentage is saved');
select ok(exists(select 1 from public.audit_events where event_type = 'cancellation_policy.configuration_updated' and entity_type = 'cancellation_policy' and actor_id = 'c6100000-0000-4000-8000-000000000001'), 'policy update is audited with actor');
select is((select after_data #>> '{tiers,2,policyCode}' from public.audit_events where event_type = 'cancellation_policy.configuration_updated' order by id desc limit 1), 'custom_full', 'audit contains the applied policy tiers');
select results_eq(
  $$select outcome from public.replace_marina_cancellation_policy(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"none","minDaysBeforeArrival":null,"maxDaysBeforeArrival":1,"refundPercent":0},{"policyCode":"partial","minDaysBeforeArrival":2,"maxDaysBeforeArrival":6,"refundPercent":40},{"policyCode":"custom_full","minDaysBeforeArrival":7,"maxDaysBeforeArrival":null,"refundPercent":80}]}'::jsonb
  )$$,
  array['unchanged'::text], 'unchanged policy is a successful no-op'
);
select results_eq(
  $$select outcome from public.replace_marina_cancellation_policy(
    'd1000000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z',
    '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"all","minDaysBeforeArrival":null,"maxDaysBeforeArrival":null,"refundPercent":10}]}'::jsonb
  )$$,
  array['conflict'::text], 'stale policy update is rejected'
);
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"bad","minDaysBeforeArrival":null,"maxDaysBeforeArrival":null,"refundPercent":101}]}'::jsonb)$$,
  '22023', 'Cancellation tier 1 has an invalid code or refund percentage.', 'refund percentages above 100 are rejected'
);
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"one","minDaysBeforeArrival":null,"maxDaysBeforeArrival":2,"refundPercent":0},{"policyCode":"two","minDaysBeforeArrival":2,"maxDaysBeforeArrival":null,"refundPercent":50}]}'::jsonb)$$,
  '22023', 'Cancellation tiers must be ordered, contiguous, and non-overlapping.', 'overlapping tiers are rejected'
);
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"one","minDaysBeforeArrival":null,"maxDaysBeforeArrival":1,"refundPercent":0},{"policyCode":"two","minDaysBeforeArrival":3,"maxDaysBeforeArrival":null,"refundPercent":50}]}'::jsonb)$$,
  '22023', 'Cancellation tiers must be ordered, contiguous, and non-overlapping.', 'gapped tiers are rejected'
);
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', (select updated_at from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), '{"evaluationRule":"active_at_evaluation","tiers":[{"policyCode":"same","minDaysBeforeArrival":null,"maxDaysBeforeArrival":1,"refundPercent":0},{"policyCode":"same","minDaysBeforeArrival":2,"maxDaysBeforeArrival":null,"refundPercent":50}]}'::jsonb)$$,
  '22023', 'Cancellation policy codes must be unique.', 'duplicate tier codes are rejected'
);

select set_config('request.jwt.claims', '{"sub":"c6100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.marina_cancellation_policies), 0, 'marina staff cannot read admin cancellation policy');
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'marina staff cannot configure cancellation policy'
);
select set_config('request.jwt.claims', '{"sub":"c6100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.marina_cancellation_policies where marina_id = 'd1000000-0000-4000-8000-000000000001'), 0, 'another tenant cannot read cancellation policy');
select throws_ok(
  $$select * from public.replace_marina_cancellation_policy('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'another tenant admin cannot configure cancellation policy'
);

reset role;
set local role service_role;
select is((select outcome from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001', 'c6200000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', (select updated_at from public.bookings where id = 'c6200000-0000-4000-8000-000000000001'))), 'ready', 'existing cancellation preview uses configured policy');
select is((select policy_code from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001', 'c6200000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', (select updated_at from public.bookings where id = 'c6200000-0000-4000-8000-000000000001'))), 'custom_full', 'preview resolves active custom tier');
select is((select refund_percent from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001', 'c6200000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', (select updated_at from public.bookings where id = 'c6200000-0000-4000-8000-000000000001'))), 80::smallint, 'preview uses configured refund percentage');
select is((select refund_recommendation_minor from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001', 'c6200000-0000-4000-8000-000000000001', 'c6100000-0000-4000-8000-000000000001', (select updated_at from public.bookings where id = 'c6200000-0000-4000-8000-000000000001'))), 8000::bigint, 'existing recommendation calculation remains the source of the amount');

reset role;
select is((select jsonb_agg(to_jsonb(bookings) order by id) from public.bookings), (select snapshot from cancellation_config_booking_before), 'policy configuration and preview do not mutate existing bookings or price snapshots');
select is((select coalesce(jsonb_agg(to_jsonb(payments) order by id), '[]'::jsonb) from public.booking_payments payments), (select snapshot from cancellation_config_payment_before), 'policy configuration and preview do not mutate payment history or issue refunds');
select is((select coalesce(jsonb_agg(to_jsonb(events) order by id), '[]'::jsonb) from public.booking_cancellation_events events), (select snapshot from cancellation_config_history_before), 'policy configuration does not rewrite cancellation history');
select is((select count(*)::integer from public.audit_events where event_type = 'cancellation_policy.configuration_updated' and actor_id = 'c6100000-0000-4000-8000-000000000001'), 1, 'failed, stale, and unchanged writes create no audit noise');

select * from finish();
rollback;
