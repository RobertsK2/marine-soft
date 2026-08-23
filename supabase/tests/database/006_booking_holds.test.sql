begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'booking_holds', 'booking holds table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.booking_holds'::regclass), 'booking holds use RLS');
select is(enum_range(null::public.booking_hold_status)::text, '{active,released,expired}', 'hold lifecycle is limited');
select ok(not has_table_privilege('anon', 'public.booking_holds', 'select'), 'anonymous users cannot inspect holds');
select ok(not has_function_privilege('anon', 'public.create_booking_hold(uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb)', 'execute'), 'anonymous users cannot create holds');

create temporary table first_hold as
select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
  '2026-09-10', '2026-09-12', '14:00', '10:00', 'Last Fit', 19, 5.8, 3.1,
  'EUR', 10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-09-10","departureDate":"2026-09-12","vesselLengthM":19}'::jsonb
);

select is((select outcome from first_hold), 'created', 'first customer holds the last fitting berth');
select is(
  (select round(extract(epoch from (expires_at - created_at)))::integer from public.booking_holds where public_token = (select hold_token from first_hold)),
  900,
  'hold lifetime is exactly 15 minutes'
);
select is(
  (select outcome from public.create_booking_hold(
    'd1000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001',
    '2026-09-10', '2026-09-12', '14:00', '10:00', 'Last Fit', 19, 5.8, 3.1,
    'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-09-10","departureDate":"2026-09-12","vesselLengthM":19}'::jsonb
  )), 'existing', 'duplicate idempotency key returns the existing hold'
);
select is(
  (select outcome from public.create_booking_hold(
    'd1000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002',
    '2026-09-10', '2026-09-12', '14:00', '10:00', 'Racer', 19, 5.8, 3.1,
    'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-09-10","departureDate":"2026-09-12","vesselLengthM":19}'::jsonb
  )), 'unavailable', 'a different customer cannot double-hold the last capacity'
);
select throws_ok(
  $$update public.booking_holds set price_total_minor = 1 where public_token = (select hold_token from first_hold)$$,
  'P0001', 'Booking hold request, expiry, and price snapshot are immutable.',
  'price snapshot is immutable'
);
select throws_ok(
  $$insert into public.bookings (marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_length_m,vessel_beam_m,vessel_draft_m) values ('d1000000-0000-4000-8000-000000000001','2026-09-10','2026-09-12','12:00','10:00','Staff','staff@example.test','+37120000000',19,5.8,3.1)$$,
  'P0001', 'Active public hold has priority over this booking change.',
  'active public hold takes priority over a conflicting staff booking'
);
select ok(public.release_booking_hold_after_checkout_failure((select hold_token from first_hold)), 'checkout failure release succeeds');
select is((select status::text from public.booking_holds where public_token = (select hold_token from first_hold)), 'released', 'released hold stops consuming capacity');
select is((select release_reason from public.booking_holds where public_token = (select hold_token from first_hold)), 'checkout_session_creation_failed', 'release records its safe reason');
select is(
  (select outcome from public.create_booking_hold(
    'd1000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003',
    '2026-09-10', '2026-09-12', '14:00', '10:00', 'After Release', 19, 5.8, 3.1,
    'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-09-10","departureDate":"2026-09-12","vesselLengthM":19}'::jsonb
  )), 'created', 'released capacity can be held again'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'hold-member-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '63000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'hold-member-b@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members (organization_id, user_id, role)
values
  ('d0000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', '63000000-0000-4000-8000-000000000002', 'marina_staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok((select count(*) > 0 from public.booking_holds), 'a marina member can inspect holds for operations');
select set_config('request.jwt.claims', '{"sub":"63000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.booking_holds), 0, 'another tenant cannot inspect Marina A holds');

select * from finish();
rollback;
