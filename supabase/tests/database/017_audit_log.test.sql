begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

select has_table('public', 'audit_events', 'audit event table exists');
select has_trigger('public', 'audit_events', 'audit_events_immutable', 'audit events have an immutable trigger');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_events'::regclass), 'audit events enforce RLS');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'insert'), 'members cannot insert audit events directly');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'update'), 'members cannot update audit events');
select ok(not has_table_privilege('authenticated', 'public.audit_events', 'delete'), 'members cannot delete audit events');
select ok(not has_table_privilege('service_role', 'public.audit_events', 'update'), 'service role has no normal audit update path');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'audit-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'audit-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a8100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'audit-other@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'a8100000-0000-4000-8000-000000000003', 'marina_admin');

select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
insert into public.bookings(
  id, marina_id, arrival_date, departure_date, eta, etd, customer_name, customer_email,
  customer_phone, vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m, status
) values (
  'a8200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  current_date + 20, current_date + 22, '13:00', '10:00', 'Audit Guest',
  'audit-guest@example.test', '+37125000001', 'Logbook', 8, 2.8, 1.4, 'confirmed'
);
insert into public.berths(
  id, marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority, status
) values (
  'a8300000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'AUD-1', 'Audit quay', 12, 4, 2.5, 980, 'available'
);

select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and event_type = 'booking.created' and actor_id = 'a8100000-0000-4000-8000-000000000001'
), 'booking creation records its actor');
select is((select actor_email from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001' and event_type = 'booking.created'), 'audit-admin@example.test', 'actor email is snapshotted');
select ok((select before_data is null from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001' and event_type = 'booking.created'), 'create event has no before context');
select ok((select after_data is not null from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001' and event_type = 'booking.created'), 'create event preserves after context');
select ok(exists(
  select 1 from public.audit_events where berth_id = 'a8300000-0000-4000-8000-000000000001'
    and event_type = 'berth.created' and actor_id = 'a8100000-0000-4000-8000-000000000001'
), 'berth creation records its actor');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select outcome from public.audited_update_booking_details(
  'd1000000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000002',
  (select updated_at from public.bookings where id = 'a8200000-0000-4000-8000-000000000001'),
  current_date + 20, current_date + 22, '13:30', '10:00', 'Audit Guest Updated',
  'audit-guest@example.test', '+37125000001', 'Logbook', 8, 2.8, 1.4, null
)), 'updated', 'audited booking edit succeeds');
select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and event_type = 'booking.updated' and actor_id = 'a8100000-0000-4000-8000-000000000002'
), 'privileged booking edit retains the staff actor');
select is((select before_data ->> 'customer_name' from public.audit_events
  where booking_id = 'a8200000-0000-4000-8000-000000000001' and event_type = 'booking.updated'
  order by id desc limit 1), 'Audit Guest', 'booking edit preserves before context');
select is((select after_data ->> 'customer_name' from public.audit_events
  where booking_id = 'a8200000-0000-4000-8000-000000000001' and event_type = 'booking.updated'
  order by id desc limit 1), 'Audit Guest Updated', 'booking edit preserves after context');
select set_config('berthio.audit_actor_id', '', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.berths set status = 'blocked' where id = 'a8300000-0000-4000-8000-000000000001';
select ok(exists(
  select 1 from public.audit_events where berth_id = 'a8300000-0000-4000-8000-000000000001'
    and event_type = 'berth.status_changed' and actor_id = 'a8100000-0000-4000-8000-000000000001'
), 'berth status change is attributed');
update public.berths set status = 'available' where id = 'a8300000-0000-4000-8000-000000000001';

select is((select outcome from public.assign_booking_berth(
  'a8200000-0000-4000-8000-000000000001', 'a8300000-0000-4000-8000-000000000001'
)), 'assigned', 'assignment succeeds');
select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and berth_id = 'a8300000-0000-4000-8000-000000000001'
    and event_type = 'assignment.assigned' and actor_id = 'a8100000-0000-4000-8000-000000000001'
), 'assignment records booking, berth, and actor');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is((select outcome from public.set_booking_payment_state(
  'd1000000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000001',
  'a8100000-0000-4000-8000-000000000002', 'balance_due', 'on_site', 'EUR', 10000, 2000,
  now() + interval '2 days', null, 'Audit balance'
)), 'updated', 'payment balance change succeeds');
select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and event_type = 'payment.balance_changed' and actor_id = 'a8100000-0000-4000-8000-000000000002'
), 'payment balance event retains the staff actor');

update public.bookings set eta = '14:00', etd = '09:30'
where id = 'a8200000-0000-4000-8000-000000000001';
select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and event_type = 'booking.guest_times_updated' and actor_type = 'guest' and actor_id is null
), 'guest ETA or ETD change is identified without a staff actor');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok((select count(*) from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001') >= 8, 'admin can read full marina history');
select ok((select count(*) from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001') >= 5, 'admin can read booking entity history');

select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok((select count(*) from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001') >= 5, 'staff can read booking entity history');
select ok((select count(*) from public.audit_events where berth_id = 'a8300000-0000-4000-8000-000000000001') >= 3, 'staff can read berth entity history');

select set_config('request.jwt.claims', '{"sub":"a8100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*)::integer from public.audit_events where marina_id = 'd1000000-0000-4000-8000-000000000001'), 0, 'cross-tenant audit access is denied');

reset role;
select throws_ok(
  $$update public.audit_events set summary = 'tampered' where booking_id = 'a8200000-0000-4000-8000-000000000001'$$,
  '23514', 'Audit history is append-only.', 'audit events cannot be rewritten even by the table owner'
);
select throws_ok(
  $$delete from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'$$,
  '23514', 'Audit history is append-only.', 'audit events cannot be deleted even by the table owner'
);
select ok(exists(
  select 1 from public.audit_events where booking_id = 'a8200000-0000-4000-8000-000000000001'
    and event_type = 'booking.created'
), 'later changes preserve the original event');

select * from finish();
rollback;
