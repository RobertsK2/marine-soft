begin;

create extension if not exists pgtap with schema extensions;
select plan(31);

select is(
  enum_range(null::public.pricing_model)::text,
  '{length_interval,per_meter}',
  'pricing model contains only the two Phase 4 models'
);
select is(
  enum_range(null::public.tax_behavior)::text,
  '{exclusive,inclusive}',
  'tax behavior supports added and included tax'
);
select is(
  enum_range(null::public.mandatory_fee_type)::text,
  '{per_booking,per_night,per_vessel,percentage}',
  'mandatory fee types contain only the Phase 4 values'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.marina_pricing_configs'::regclass),
  'pricing configs have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pricing_seasons'::regclass),
  'pricing seasons have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pricing_season_length_rates'::regclass),
  'length rates have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pricing_season_meter_rates'::regclass),
  'meter rates have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.marina_mandatory_fees'::regclass),
  'mandatory fees have RLS enabled'
);
select has_column('public', 'bookings', 'price_snapshot', 'bookings support a price snapshot');
select ok(
  not has_table_privilege('anon', 'public.marina_pricing_configs', 'select'),
  'anonymous users cannot read pricing configs'
);
select ok(
  not has_table_privilege('anon', 'public.pricing_seasons', 'select'),
  'anonymous users cannot read pricing seasons'
);
select ok(
  not has_table_privilege('anon', 'public.pricing_season_length_rates', 'select'),
  'anonymous users cannot read length rates'
);
select ok(
  not has_table_privilege('anon', 'public.pricing_season_meter_rates', 'select'),
  'anonymous users cannot read meter rates'
);
select ok(
  not has_table_privilege('anon', 'public.marina_mandatory_fees', 'select'),
  'anonymous users cannot read mandatory fees'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '51000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pricing-admin-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-8000-000000000000', '51000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'pricing-staff-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '52000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'pricing-admin-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.organizations (id, name)
values
  ('5a000000-0000-4000-8000-000000000001', 'Pricing Test Organization A'),
  ('5b000000-0000-4000-8000-000000000002', 'Pricing Test Organization B');

insert into public.marinas (id, organization_id, name, slug, timezone)
values
  ('5a100000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', 'Pricing Test Marina A', 'pricing-test-marina-a', 'Europe/Riga'),
  ('5b100000-0000-4000-8000-000000000002', '5b000000-0000-4000-8000-000000000002', 'Pricing Test Marina B', 'pricing-test-marina-b', 'Europe/Riga');

insert into public.organization_members (organization_id, user_id, role)
values
  ('5a000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000001', 'marina_admin'),
  ('5a000000-0000-4000-8000-000000000001', '51000000-0000-4000-8000-000000000002', 'marina_staff'),
  ('5b000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000001', 'marina_admin');

insert into public.marina_pricing_configs (
  marina_id, currency, model, tax_behavior, tax_rate_bps
)
values
  ('5a100000-0000-4000-8000-000000000001', 'EUR', 'per_meter', 'exclusive', 2100),
  ('5b100000-0000-4000-8000-000000000002', 'USD', 'length_interval', 'inclusive', 1000);

insert into public.pricing_seasons (id, marina_id, name, starts_on, ends_on)
values
  ('5a600000-0000-4000-8000-000000000001', '5a100000-0000-4000-8000-000000000001', 'A season', '2026-01-01', '2027-01-01'),
  ('5b600000-0000-4000-8000-000000000002', '5b100000-0000-4000-8000-000000000002', 'B season', '2026-01-01', '2027-01-01');

insert into public.pricing_season_meter_rates (
  season_id, marina_id, nightly_rate_per_meter_minor
)
values ('5a600000-0000-4000-8000-000000000001', '5a100000-0000-4000-8000-000000000001', 300);

insert into public.pricing_season_length_rates (
  season_id, marina_id, min_length_m, max_length_m, nightly_rate_minor
)
values
  ('5b600000-0000-4000-8000-000000000002', '5b100000-0000-4000-8000-000000000002', 0, 10, 2500),
  ('5b600000-0000-4000-8000-000000000002', '5b100000-0000-4000-8000-000000000002', 10, 20, 4000);

insert into public.marina_mandatory_fees (
  marina_id, name, fee_type, amount_minor, sort_order
)
values ('5a100000-0000-4000-8000-000000000001', 'Admin fee', 'per_booking', 500, 10);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  'select currency from public.marina_pricing_configs order by currency',
  array['EUR'::text],
  'Marina A admin reads only its own pricing config'
);
select results_eq(
  $$update public.marina_pricing_configs set tax_rate_bps = 2200
    where marina_id = '5a100000-0000-4000-8000-000000000001'
    returning tax_rate_bps$$,
  array[2200],
  'Marina A admin can configure its tax behavior'
);
select results_eq(
  $$update public.marina_pricing_configs set tax_rate_bps = 2200
    where marina_id = '5b100000-0000-4000-8000-000000000002'
    returning tax_rate_bps$$,
  array[]::integer[],
  'Marina A admin cannot mutate Marina B pricing'
);

select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  'select currency from public.marina_pricing_configs',
  array['EUR'::text],
  'Marina A staff can read marina pricing'
);
select results_eq(
  $$update public.marina_pricing_configs set tax_rate_bps = 2300
    where marina_id = '5a100000-0000-4000-8000-000000000001'
    returning tax_rate_bps$$,
  array[]::integer[],
  'Marina staff cannot configure pricing'
);

reset role;

select throws_ok(
  $$insert into public.pricing_seasons (marina_id, name, starts_on, ends_on)
    values ('5a100000-0000-4000-8000-000000000001', 'Overlap', '2026-06-01', '2026-08-01')$$,
  '23P01', null,
  'overlapping seasons are rejected'
);
select throws_ok(
  $$insert into public.pricing_season_length_rates (
      season_id, marina_id, min_length_m, max_length_m, nightly_rate_minor
    ) values (
      '5b600000-0000-4000-8000-000000000002',
      '5b100000-0000-4000-8000-000000000002', 9, 12, 3000
    )$$,
  '23P01', null,
  'overlapping vessel-length bands are rejected'
);
select throws_ok(
  $$insert into public.marina_mandatory_fees (
      marina_id, name, fee_type, amount_minor, percentage_bps
    ) values (
      '5a100000-0000-4000-8000-000000000001', 'Broken percentage',
      'percentage', 100, 500
    )$$,
  '23514', null,
  'fee values must match the mandatory fee type'
);
select throws_ok(
  $$insert into public.marina_mandatory_fees (
      marina_id, name, fee_type
    ) values (
      '5a100000-0000-4000-8000-000000000001', 'Missing percentage',
      'percentage'
    )$$,
  '23514', null,
  'percentage fees require a percentage value'
);
select throws_ok(
  $$insert into public.marina_mandatory_fees (
      marina_id, name, fee_type
    ) values (
      '5a100000-0000-4000-8000-000000000001', 'Missing amount',
      'per_booking'
    )$$,
  '23514', null,
  'fixed mandatory fees require an amount'
);
select throws_ok(
  $$insert into public.bookings (
      marina_id, arrival_date, departure_date, eta, etd,
      customer_name, customer_email, customer_phone,
      vessel_length_m, vessel_beam_m, vessel_draft_m,
      price_currency
    ) values (
      '5a100000-0000-4000-8000-000000000001', '2026-09-10', '2026-09-12', '14:00', '10:00',
      'Partial price', 'partial@example.test', '+37120000001', 12, 4, 2, 'EUR'
    )$$,
  '23514', null,
  'partial booking price snapshots are rejected'
);

insert into public.bookings (
  id, marina_id, arrival_date, departure_date, eta, etd,
  customer_name, customer_email, customer_phone,
  vessel_length_m, vessel_beam_m, vessel_draft_m,
  price_currency, price_total_minor, price_snapshot
)
values (
  '5a200000-0000-4000-8000-000000000001',
  '5a100000-0000-4000-8000-000000000001',
  '2026-09-10', '2026-09-12', '14:00', '10:00',
  'Snapshotted price', 'snapshot@example.test', '+37120000002', 12, 4, 2,
  'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb
);

select is(
  (select price_currency || ':' || price_total_minor::text
    from public.bookings where id = '5a200000-0000-4000-8000-000000000001'),
  'EUR:10000',
  'booking stores the server price snapshot total and currency'
);

update public.pricing_season_meter_rates
set nightly_rate_per_meter_minor = 999
where season_id = '5a600000-0000-4000-8000-000000000001';

select is(
  (select (price_snapshot ->> 'totalMinor')::integer
    from public.bookings where id = '5a200000-0000-4000-8000-000000000001'),
  10000,
  'later pricing changes do not mutate a booking snapshot'
);
select throws_ok(
  $$update public.bookings
    set price_total_minor = 11000,
        price_snapshot = '{"version":1,"currency":"EUR","totalMinor":11000}'::jsonb
    where id = '5a200000-0000-4000-8000-000000000001'$$,
  '23514', 'A booking price snapshot is immutable once set.',
  'a stored booking price snapshot cannot be changed'
);
select results_eq(
  $$update public.bookings set status = 'cancelled'
    where id = '5a200000-0000-4000-8000-000000000001'
    returning status::text$$,
  array['cancelled'::text],
  'immutable pricing does not block unrelated booking status changes'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$update public.bookings set price_total_minor = 1
    where id = '5a200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'authenticated marina users cannot write server-authoritative price columns'
);
select is(
  (select count(*) from public.marina_mandatory_fees
    where marina_id = '5b100000-0000-4000-8000-000000000002'),
  0::bigint,
  'tenant RLS hides another marina mandatory fees'
);

reset role;
select * from finish();
rollback;
