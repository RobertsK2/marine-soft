begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.bookings'::regclass),
  'bookings has RLS enabled'
);
select has_pk('public', 'bookings', 'bookings has a primary key');
select is(
  enum_range(null::public.booking_status)::text,
  '{confirmed,cancelled,checked_in,checked_out}',
  'booking status contains only Phase 4 values'
);
select is(
  enum_range(null::public.booking_source)::text,
  '{manual,online}',
  'booking source includes Phase 7 online intake'
);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'booking-admin-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '41000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'booking-staff-a@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '42000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'booking-admin-b@example.test', '', now(), '{}', '{}', now(), now());

insert into public.organizations (id, name)
values
  ('4a000000-0000-4000-8000-000000000001', 'Booking Test Organization A'),
  ('4b000000-0000-4000-8000-000000000002', 'Booking Test Organization B');

insert into public.marinas (id, organization_id, name, slug, timezone)
values
  ('4a100000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', 'Booking Test Marina A', 'booking-test-marina-a', 'Europe/Riga'),
  ('4b100000-0000-4000-8000-000000000002', '4b000000-0000-4000-8000-000000000002', 'Booking Test Marina B', 'booking-test-marina-b', 'Europe/Riga');

insert into public.organization_members (organization_id, user_id, role)
values
  ('4a000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000001', 'marina_admin'),
  ('4a000000-0000-4000-8000-000000000001', '41000000-0000-4000-8000-000000000002', 'marina_staff'),
  ('4b000000-0000-4000-8000-000000000002', '42000000-0000-4000-8000-000000000001', 'marina_admin');

insert into public.bookings (
  id, marina_id, arrival_date, departure_date, eta, etd,
  customer_name, customer_email, customer_phone,
  vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m
)
values
  ('4a200000-0000-4000-8000-000000000001', '4a100000-0000-4000-8000-000000000001', '2026-09-10', '2026-09-12', '14:30', '10:00', 'Customer A', 'a@example.test', '+37120000001', 'Aurora', 12, 4, 2),
  ('4b200000-0000-4000-8000-000000000002', '4b100000-0000-4000-8000-000000000002', '2026-09-11', '2026-09-14', '16:00', '09:00', 'Customer B', 'b@example.test', '+37120000002', 'Borealis', 15, 5, 3);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  'select customer_name from public.bookings order by customer_name',
  array['Customer A'::text],
  'Marina A can read its own booking snapshot'
);
select is(
  (select count(*) from public.bookings where id = '4b200000-0000-4000-8000-000000000002'),
  0::bigint,
  'Marina A cannot read Marina B bookings'
);
select results_eq(
  $$update public.bookings set status = 'cancelled'
    where id = '4b200000-0000-4000-8000-000000000002' returning id$$,
  array[]::uuid[],
  'Marina A cannot update Marina B bookings'
);
select throws_ok(
  $$delete from public.bookings
    where id = '4b200000-0000-4000-8000-000000000002'$$,
  '42501', null,
  'authenticated users cannot delete cross-tenant bookings'
);
select throws_ok(
  $$insert into public.bookings (
      marina_id, arrival_date, departure_date, eta, etd,
      customer_name, customer_email, customer_phone,
      vessel_length_m, vessel_beam_m, vessel_draft_m
    ) values (
      '4b100000-0000-4000-8000-000000000002', '2026-10-01', '2026-10-03', '12:00', '10:00',
      'Injected', 'injected@example.test', '+37120000003', 10, 3, 2
    )$$,
  '42501', null,
  'Marina A cannot create a Marina B booking'
);
select throws_ok(
  $$update public.bookings set marina_id = '4b100000-0000-4000-8000-000000000002'
    where id = '4a200000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'authenticated users cannot reassign booking ownership'
);
select matches(
  (select reference from public.bookings where id = '4a200000-0000-4000-8000-000000000001'),
  '^BK-[A-Z0-9]{10}$',
  'booking receives a human-readable reference'
);
select is(
  (select source::text from public.bookings where id = '4a200000-0000-4000-8000-000000000001'),
  'manual',
  'manual source persists by default'
);
select is(
  (select status::text from public.bookings where id = '4a200000-0000-4000-8000-000000000001'),
  'confirmed',
  'confirmed status persists by default'
);
select is(
  (select vessel_name || ':' || vessel_length_m::text || ':' || customer_email
    from public.bookings where id = '4a200000-0000-4000-8000-000000000001'),
  'Aurora:12.00:a@example.test',
  'customer and vessel snapshots persist independently'
);
select throws_ok(
  $$insert into public.bookings (
      marina_id, arrival_date, departure_date, eta, etd,
      customer_name, customer_email, customer_phone,
      vessel_length_m, vessel_beam_m, vessel_draft_m
    ) values (
      '4a100000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-01', '12:00', '10:00',
      'Same Date', 'same@example.test', '+37120000004', 10, 3, 2
    )$$,
  '23514', null,
  'departure must be after arrival'
);
select throws_ok(
  $$insert into public.bookings (
      marina_id, arrival_date, departure_date, eta, etd,
      customer_name, customer_email, customer_phone,
      vessel_length_m, vessel_beam_m, vessel_draft_m
    ) values (
      '4a100000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-03', '12:00', '10:00',
      'Invalid Vessel', 'invalid@example.test', '+37120000005', -1, 3, 2
    )$$,
  '23514', null,
  'negative vessel dimensions are rejected'
);
select throws_ok(
  $$update public.bookings set status = 'checked_in'
    where id = '4a200000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'status-only writes cannot forge check-in'
);
select throws_ok(
  $$update public.bookings set status = 'checked_out'
    where id = '4a200000-0000-4000-8000-000000000001'$$,
  '23514', null,
  'confirmed bookings cannot jump directly to checked out'
);
select results_eq(
  $$update public.bookings set status = 'cancelled'
    where id = '4a200000-0000-4000-8000-000000000001' returning status::text$$,
  array['cancelled'::text],
  'the pre-existing confirmed cancellation remains available'
);

select set_config('request.jwt.claims', '{"sub":"41000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$insert into public.bookings (
      marina_id, arrival_date, departure_date, eta, etd,
      customer_name, customer_email, customer_phone,
      vessel_length_m, vessel_beam_m, vessel_draft_m
    ) values (
      '4a100000-0000-4000-8000-000000000001', '2026-11-01', '2026-11-04', '13:00', '09:30',
      'Staff Booking', 'staff@example.test', '+37120000006', 9, 3, 1.5
    ) returning customer_name$$,
  array['Staff Booking'::text],
  'Marina staff can create a manual booking for their marina'
);

reset role;
select * from finish();
rollback;
