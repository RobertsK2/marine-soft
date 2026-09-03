begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

select has_column('public', 'marinas', 'contact_email', 'marinas have a public contact email');
select has_column('public', 'marinas', 'contact_phone', 'marinas have a public contact phone');
select has_column('public', 'marinas', 'website_url', 'marinas have a public website URL');
select has_trigger('public', 'marinas', 'marinas_validate_timezone', 'marina timezone has database validation');
select has_trigger('public', 'marinas', 'marinas_capture_profile_audit', 'marina profile changes are audited');
select ok(has_column_privilege('anon', 'public.marinas', 'contact_email', 'select'), 'anonymous users can read published contact columns');

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', 'a1100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'profile-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'profile-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a1100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'profile-other@example.test', '', now(), '{}', '{}', now(), now());

insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'a1100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'a1100000-0000-4000-8000-000000000003', 'marina_admin');

insert into public.bookings(
  id, marina_id, arrival_date, departure_date, eta, etd,
  customer_name, customer_email, customer_phone, vessel_name,
  vessel_length_m, vessel_beam_m, vessel_draft_m, status
) values (
  'a1200000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  '2038-06-10', '2038-06-13', '14:00', '10:00',
  'Timezone Snapshot', 'timezone@example.test', '+37120000001', 'UTC Record',
  8, 2.8, 1.4, 'confirmed'
);
create temporary table booking_before as
select to_jsonb(bookings) as snapshot
from public.bookings
where id = 'a1200000-0000-4000-8000-000000000001';
grant select on booking_before to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select results_eq(
  $$update public.marinas set
      name = 'Marina A Profile',
      timezone = 'America/New_York',
      public_description = 'Visitor harbour profile.',
      public_description_local = 'Vietējais ostas profils.',
      local_language = 'Latviešu',
      contact_email = 'harbour@example.test',
      contact_phone = '+371 20 000 001',
      website_url = 'https://marina.example/'
    where id = 'd1000000-0000-4000-8000-000000000001'
    returning timezone$$,
  array['America/New_York'::text],
  'admin can update the owned marina with a valid IANA timezone'
);
select is((select name from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), 'Marina A Profile', 'marina name is persisted');
select is((select timezone from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), 'America/New_York', 'IANA timezone is persisted');
select is((select contact_email from public.marinas where id = 'd1000000-0000-4000-8000-000000000001'), 'harbour@example.test', 'public contact is persisted');
select ok(exists(
  select 1 from public.audit_events
  where entity_type = 'marina'
    and entity_id = 'd1000000-0000-4000-8000-000000000001'
    and event_type = 'marina.profile_updated'
    and actor_id = 'a1100000-0000-4000-8000-000000000001'
), 'profile update creates a marina audit event with actor');
select is((select actor_email from public.audit_events where event_type = 'marina.profile_updated' order by id desc limit 1), 'profile-admin@example.test', 'audit snapshots actor email');
select is((select before_data ->> 'timezone' from public.audit_events where event_type = 'marina.profile_updated' order by id desc limit 1), 'Europe/Riga', 'audit captures the prior timezone');
select is((select after_data ->> 'timezone' from public.audit_events where event_type = 'marina.profile_updated' order by id desc limit 1), 'America/New_York', 'audit captures the new timezone');
select ok((select not (before_data ? 'stripe_account_id') and not (after_data ? 'is_public') from public.audit_events where event_type = 'marina.profile_updated' order by id desc limit 1), 'audit context excludes unrelated configuration');

update public.marinas set timezone = 'America/New_York'
where id = 'd1000000-0000-4000-8000-000000000001';
select is((
  select count(*)::integer
  from public.audit_events
  where event_type = 'marina.profile_updated'
    and actor_id = 'a1100000-0000-4000-8000-000000000001'
), 1, 'no-op profile updates do not create audit noise');
select is(
  (select to_jsonb(bookings) from public.bookings where id = 'a1200000-0000-4000-8000-000000000001'),
  (select snapshot from booking_before),
  'timezone changes do not mutate existing booking data or timestamps'
);
select throws_ok(
  $$update public.marinas set timezone = 'CET' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514', 'Unsupported IANA timezone.', 'non-IANA timezone aliases are rejected in the database'
);
select throws_ok(
  $$update public.marinas set website_url = 'javascript:alert(1)' where id = 'd1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'unsafe public website URLs are rejected in the database'
);

select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select results_eq(
  $$update public.marinas set name = 'Staff changed' where id = 'd1000000-0000-4000-8000-000000000001' returning name$$,
  array[]::text[],
  'marina staff cannot update profile configuration'
);

select set_config('request.jwt.claims', '{"sub":"a1100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select results_eq(
  $$update public.marinas set name = 'Cross-tenant changed' where id = 'd1000000-0000-4000-8000-000000000001' returning name$$,
  array[]::text[],
  'another tenant admin cannot update the marina'
);

set local role anon;
select results_eq(
  $$select contact_email from public.marinas where slug = 'marina-a'$$,
  array['harbour@example.test'::text],
  'anonymous users can read contact details for a published marina'
);
select is((select count(*)::integer from public.marinas where slug = 'marina-b'), 0, 'unpublished marina contact details remain hidden');

select * from finish();
rollback;
