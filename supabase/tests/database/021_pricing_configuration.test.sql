begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_function('public', 'replace_marina_pricing_configuration', array['uuid', 'timestamp with time zone', 'jsonb'], 'atomic pricing configuration RPC exists');
select function_privs_are('public', 'replace_marina_pricing_configuration', array['uuid', 'timestamp with time zone', 'jsonb'], 'authenticated', array['EXECUTE'], 'authenticated users can call the guarded pricing RPC');
select ok(has_table_privilege('authenticated', 'public.pricing_seasons', 'insert'), 'existing authenticated pricing table grants are preserved');
select ok(has_table_privilege('authenticated', 'public.marina_mandatory_fees', 'delete'), 'existing mandatory-fee table grants are preserved');
select has_trigger('public', 'marina_pricing_configs', 'marina_pricing_configs_capture_audit', 'base pricing changes have audit coverage');
select has_trigger('public', 'pricing_seasons', 'pricing_seasons_capture_audit', 'season changes have audit coverage');
select has_trigger('public', 'pricing_season_length_rates', 'pricing_length_rates_capture_audit', 'length-rate changes have audit coverage');
select has_trigger('public', 'pricing_season_meter_rates', 'pricing_meter_rates_capture_audit', 'meter-rate changes have audit coverage');
select has_trigger('public', 'marina_mandatory_fees', 'marina_mandatory_fees_capture_audit', 'mandatory-fee changes have audit coverage');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'b1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'price-config-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'price-config-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b1100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'price-config-other@example.test', '', now(), '{}', '{}', now(), now());

insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'b1100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'b1100000-0000-4000-8000-000000000003', 'marina_admin');

insert into public.bookings(
  id, marina_id, arrival_date, departure_date, eta, etd, customer_name, customer_email,
  customer_phone, vessel_length_m, vessel_beam_m, vessel_draft_m,
  price_currency, price_total_minor, price_snapshot
) values (
  'b1200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  '2026-09-10', '2026-09-12', '14:00', '10:00', 'Snapshot', 'snapshot-config@example.test',
  '+37120000001', 12, 4, 2, 'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000}'
);
create temporary table pricing_booking_before as
select to_jsonb(bookings) snapshot from public.bookings where id = 'b1200000-0000-4000-8000-000000000001';
grant select on pricing_booking_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$select outcome from public.replace_marina_pricing_configuration(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_pricing_configs where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"currency":"EUR","model":"per_meter","taxBehavior":"inclusive","taxRateBps":2100,"seasons":[{"name":"Winter","startsOn":"2027-01-01","endsOn":"2027-06-01","meterRateMinor":240,"lengthRates":[]},{"name":"Summer","startsOn":"2027-06-01","endsOn":"2028-01-01","meterRateMinor":360,"lengthRates":[]}],"fees":[{"name":"Administration","type":"per_booking","amountMinor":700,"percentageBps":null}]}'::jsonb
  )$$,
  array['updated'::text], 'admin can atomically replace owned pricing'
);
select is((select tax_behavior::text from public.marina_pricing_configs where marina_id = 'd1000000-0000-4000-8000-000000000001'), 'inclusive', 'VAT/tax mode is saved');
select is((select count(*)::integer from public.pricing_seasons where marina_id = 'd1000000-0000-4000-8000-000000000001'), 2, 'season set is replaced');
select is((select nightly_rate_per_meter_minor from public.pricing_season_meter_rates where marina_id = 'd1000000-0000-4000-8000-000000000001' order by nightly_rate_per_meter_minor limit 1), 240::bigint, 'per-meter base price is saved in minor units');
select is((select amount_minor from public.marina_mandatory_fees where marina_id = 'd1000000-0000-4000-8000-000000000001'), 700::bigint, 'mandatory fee is saved');
select is((select to_jsonb(bookings) from public.bookings where id = 'b1200000-0000-4000-8000-000000000001'), (select snapshot from pricing_booking_before), 'pricing changes do not mutate existing booking snapshots');
select ok(exists(select 1 from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001' and event_type = 'pricing.configuration_updated' and entity_type = 'pricing' and actor_id = 'b1100000-0000-4000-8000-000000000001'), 'meaningful pricing update is audited with actor');
select is((select after_data ->> 'taxBehavior' from public.audit_events where event_type = 'pricing.configuration_updated' order by id desc limit 1), 'inclusive', 'audit captures pricing configuration after state');

prepare stale_update as select outcome from public.replace_marina_pricing_configuration(
  'd1000000-0000-4000-8000-000000000001', '2000-01-01T00:00:00Z',
  '{"currency":"EUR","model":"per_meter","taxBehavior":"exclusive","taxRateBps":0,"seasons":[{"name":"Base","startsOn":"2027-01-01","endsOn":"2028-01-01","meterRateMinor":1,"lengthRates":[]}],"fees":[]}'::jsonb
);
select results_eq('execute stale_update', array['conflict'::text], 'stale pricing update is rejected');

select throws_ok(
  $$select * from public.replace_marina_pricing_configuration(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_pricing_configs where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"currency":"EUR","model":"per_meter","taxBehavior":"exclusive","taxRateBps":0,"seasons":[{"name":"One","startsOn":"2027-01-01","endsOn":"2027-08-01","meterRateMinor":100,"lengthRates":[]},{"name":"Two","startsOn":"2027-07-01","endsOn":"2028-01-01","meterRateMinor":100,"lengthRates":[]}],"fees":[]}'::jsonb
  )$$, '23P01', null, 'overlapping seasons are rejected atomically'
);
select is((select count(*)::integer from public.pricing_seasons where marina_id = 'd1000000-0000-4000-8000-000000000001'), 2, 'failed overlap keeps prior season configuration');
select throws_ok(
  $$select * from public.replace_marina_pricing_configuration(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_pricing_configs where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"currency":"EUR","model":"per_meter","taxBehavior":"exclusive","taxRateBps":0,"seasons":[{"name":"Bad","startsOn":"2027-01-01","endsOn":"2028-01-01","meterRateMinor":-1,"lengthRates":[]}],"fees":[]}'::jsonb
  )$$, '22023', 'A per-meter rate has an invalid minor-unit value.', 'negative rates are rejected'
);
select throws_ok(
  $$select * from public.replace_marina_pricing_configuration(
    'd1000000-0000-4000-8000-000000000001',
    (select updated_at from public.marina_pricing_configs where marina_id = 'd1000000-0000-4000-8000-000000000001'),
    '{"currency":"EUR","model":"per_meter","taxBehavior":"exclusive","taxRateBps":0,"seasons":[{"name":"Base","startsOn":"2027-01-01","endsOn":"2028-01-01","meterRateMinor":1,"lengthRates":[]}],"fees":[{"name":"Bad","type":"per_booking","amountMinor":-1,"percentageBps":null}]}'::jsonb
  )$$, '22023', 'A mandatory fee has an invalid minor-unit amount.', 'negative mandatory fees are rejected'
);

select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.replace_marina_pricing_configuration('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'marina staff cannot configure pricing'
);
select set_config('request.jwt.claims', '{"sub":"b1100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.replace_marina_pricing_configuration('d1000000-0000-4000-8000-000000000001', null, '{}'::jsonb)$$,
  '42501', 'Marina admin access is required.', 'another tenant admin cannot configure pricing'
);
select is((select count(*)::integer from public.pricing_seasons where marina_id = 'd1000000-0000-4000-8000-000000000001'), 0, 'cross-tenant pricing rows remain hidden by RLS');

reset role;
select is((select count(*)::integer from public.audit_events where event_type = 'pricing.configuration_updated' and marina_id = 'd1000000-0000-4000-8000-000000000001' and actor_id = 'b1100000-0000-4000-8000-000000000001'), 1, 'failed pricing writes create no audit noise');
select ok((select price_snapshot = '{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb from public.bookings where id = 'b1200000-0000-4000-8000-000000000001'), 'booking price snapshot remains immutable after every pricing attempt');

select * from finish();
rollback;
