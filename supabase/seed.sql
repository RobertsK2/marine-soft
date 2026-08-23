-- Phase 2 local-only tenant fixtures.
--
-- Auth users and organization_members are intentionally not inserted with SQL.
-- Run `npm run test-users:setup` after `npm run supabase:reset`; the setup script
-- uses Supabase's local Admin Auth API and a password supplied at runtime.

insert into public.organizations (id, name)
values
  ('d0000000-0000-4000-8000-000000000001', 'Marina A Organization'),
  ('e0000000-0000-4000-8000-000000000002', 'Marina B Organization');

insert into public.marinas (
  id,
  organization_id,
  name,
  slug,
  timezone,
  is_public,
  primary_color,
  public_description,
  public_description_local,
  local_language,
  map_image_url
)
values
  (
    'd1000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000001',
    'Marina A',
    'marina-a',
    'Europe/Riga',
    true,
    '#0A4D68',
    'A sheltered Baltic harbour with visitor berths, shore access, and deep-water approaches managed from Riga local time.',
    'Aizsargāta Baltijas osta ar viesu piestātnēm, piekļuvi krastam un dziļūdens pieeju.',
    'Latviešu',
    '/mockup/marine-map-reference.jpeg'
  ),
  (
    'e1000000-0000-4000-8000-000000000002',
    'e0000000-0000-4000-8000-000000000002',
    'Marina B',
    'marina-b',
    'Europe/Riga',
    false,
    '#0A192F',
    null,
    null,
    null,
    null
  );

-- Phase 3 local-only physical inventory for the Marina A pilot. Lower priority
-- numbers are considered first; varied dimensions intentionally create several
-- possible fits for later availability-matching tests.
insert into public.berths (
  id,
  marina_id,
  code,
  zone,
  max_length_m,
  max_beam_m,
  max_draft_m,
  priority,
  status,
  allow_smaller_vessels
)
values
  ('d5000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'A-01', 'North Pier', 8.00, 2.80, 1.40, 10, 'available', true),
  ('d5000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'A-02', 'North Pier', 9.00, 3.00, 1.60, 20, 'available', true),
  ('d5000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'A-03', 'North Pier', 10.00, 3.30, 1.80, 30, 'available', true),
  ('d5000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'B-01', 'South Pier', 12.00, 3.80, 2.10, 40, 'available', true),
  ('d5000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'B-02', 'South Pier', 14.00, 4.20, 2.40, 50, 'available', true),
  ('d5000000-0000-4000-8000-000000000006', 'd1000000-0000-4000-8000-000000000001', 'B-03', 'South Pier', 15.00, 4.50, 2.60, 60, 'blocked', true),
  ('d5000000-0000-4000-8000-000000000007', 'd1000000-0000-4000-8000-000000000001', 'C-01', 'Outer Basin', 16.00, 5.00, 2.80, 70, 'available', true),
  ('d5000000-0000-4000-8000-000000000008', 'd1000000-0000-4000-8000-000000000001', 'C-02', 'Outer Basin', 18.00, 5.50, 3.00, 80, 'available', true),
  ('d5000000-0000-4000-8000-000000000009', 'd1000000-0000-4000-8000-000000000001', 'C-03', 'Outer Basin', 20.00, 6.00, 3.20, 90, 'available', true),
  ('d5000000-0000-4000-8000-000000000010', 'd1000000-0000-4000-8000-000000000001', 'D-01', 'Deep Water', 24.00, 6.80, 3.80, 100, 'available', false),
  ('d5000000-0000-4000-8000-000000000011', 'd1000000-0000-4000-8000-000000000001', 'D-02', 'Deep Water', 28.00, 7.50, 4.20, 110, 'out_of_service', false),
  ('d5000000-0000-4000-8000-000000000012', 'd1000000-0000-4000-8000-000000000001', 'V-01', 'Visitor Quay', 13.00, 4.00, 2.20, 15, 'available', true),
  ('e5000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'E-01', 'East Pier', 10.00, 3.20, 1.80, 10, 'available', true),
  ('e5000000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'E-02', 'East Pier', 16.00, 5.00, 2.80, 20, 'available', true);

-- Milestone 2 Phase 4 pricing fixtures. Monetary amounts use minor currency
-- units. Seasonal date ranges use [starts_on, ends_on) semantics.
insert into public.marina_pricing_configs (
  marina_id,
  currency,
  model,
  tax_behavior,
  tax_rate_bps
)
values
  ('d1000000-0000-4000-8000-000000000001', 'EUR', 'per_meter', 'exclusive', 2100),
  ('e1000000-0000-4000-8000-000000000002', 'EUR', 'length_interval', 'inclusive', 2100);

insert into public.pricing_seasons (
  id,
  marina_id,
  name,
  starts_on,
  ends_on
)
values
  ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Baltic low season', '2026-01-01', '2026-06-01'),
  ('d6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'Baltic high season', '2026-06-01', '2026-10-01'),
  ('d6000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'Baltic autumn season', '2026-10-01', '2027-01-01'),
  ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'Standard season', '2026-01-01', '2027-01-01');

insert into public.pricing_season_meter_rates (
  season_id,
  marina_id,
  nightly_rate_per_meter_minor
)
values
  ('d6000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 200),
  ('d6000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 300),
  ('d6000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 220);

insert into public.pricing_season_length_rates (
  season_id,
  marina_id,
  min_length_m,
  max_length_m,
  nightly_rate_minor
)
values
  ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 0, 10, 2500),
  ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 10, 20, 4000),
  ('e6000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 20, 10000, 6000);

insert into public.marina_mandatory_fees (
  id,
  marina_id,
  name,
  fee_type,
  amount_minor,
  percentage_bps,
  sort_order
)
values
  ('d7000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Harbour administration', 'per_booking', 500, null, 10),
  ('d7000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'Environmental fee', 'per_night', 150, null, 20),
  ('d7000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'Vessel registration', 'per_vessel', 200, null, 30),
  ('d7000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'Infrastructure levy', 'percentage', null, 250, 40);
