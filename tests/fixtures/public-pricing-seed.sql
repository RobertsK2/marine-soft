-- Public quote checks share this read-only fixture across browser projects.
-- The integration runner generates the season boundary once before seeding.
insert into public.organizations (id, name)
values ('c0000000-0000-4000-8000-000000000001', 'E2E Pricing Organization');

insert into public.marinas (id, organization_id, name, slug, timezone, is_public)
values ('c1000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
  'E2E Pricing Marina', 'e2e-pricing-marina', 'Europe/Riga', true);

insert into public.berths (marina_id, code, zone, max_length_m, max_beam_m, max_draft_m)
values ('c1000000-0000-4000-8000-000000000001', 'P-01', 'Visitor Quay', 14.00, 4.20, 2.40);

insert into public.marina_pricing_configs (marina_id, currency, model, tax_behavior, tax_rate_bps)
values ('c1000000-0000-4000-8000-000000000001', 'EUR', 'per_meter', 'exclusive', 2100);

insert into public.pricing_seasons (id, marina_id, name, starts_on, ends_on)
values
  ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
    'Baltic high season', date '__PRICING_BOUNDARY__' - 30, date '__PRICING_BOUNDARY__'),
  ('c6000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001',
    'Baltic autumn season', date '__PRICING_BOUNDARY__', date '__PRICING_BOUNDARY__' + 30);

insert into public.pricing_season_meter_rates (season_id, marina_id, nightly_rate_per_meter_minor)
values
  ('c6000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001', 300),
  ('c6000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', 220);

insert into public.marina_mandatory_fees (marina_id, name, fee_type, amount_minor, percentage_bps, sort_order)
values
  ('c1000000-0000-4000-8000-000000000001', 'Harbour administration', 'per_booking', 500, null, 10),
  ('c1000000-0000-4000-8000-000000000001', 'Environmental fee', 'per_night', 150, null, 20),
  ('c1000000-0000-4000-8000-000000000001', 'Vessel registration', 'per_vessel', 200, null, 30),
  ('c1000000-0000-4000-8000-000000000001', 'Infrastructure levy', 'percentage', null, 250, 40);
