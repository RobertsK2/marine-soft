begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'notification_outbox', 'notification outbox exists');
select has_table('public', 'notification_delivery_attempts', 'notification attempt log exists');
select has_trigger('public', 'notification_delivery_attempts', 'notification_delivery_attempts_immutable', 'attempt history is immutable');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_outbox'::regclass), 'outbox enforces RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.notification_delivery_attempts'::regclass), 'attempts enforce RLS');
select ok(not has_table_privilege('authenticated', 'public.notification_outbox', 'insert'), 'members cannot enqueue directly');
select ok(not has_table_privilege('authenticated', 'public.notification_outbox', 'update'), 'members cannot forge delivery state');
select ok(not has_table_privilege('authenticated', 'public.notification_delivery_attempts', 'insert'), 'members cannot forge attempts');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'notify-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a9100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'notify-other@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'a9100000-0000-4000-8000-000000000001', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'a9100000-0000-4000-8000-000000000002', 'marina_staff');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
reset role;
insert into public.bookings(
  id, marina_id, arrival_date, departure_date, eta, etd, customer_name, customer_email,
  customer_phone, vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m, status
) values (
  'a9200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  current_date + 1, current_date + 3, '13:00', '10:00', 'Notify Guest',
  'notify-guest@example.test', '+37125000009', 'Messenger', 8, 2.8, 1.4, 'confirmed'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'booking_confirmation'), 1, 'booking confirmation is queued transactionally');
select is((select recipient_email from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'booking_confirmation'), 'notify-guest@example.test', 'recipient snapshot is stored');
reset role;
update public.bookings set eta = '13:30' where id = 'a9200000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'booking_confirmation'), 1, 'booking updates do not duplicate confirmation');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(public.queue_upcoming_arrival_reminders(), 1, 'upcoming arrival reminder is queued');
select is(public.queue_upcoming_arrival_reminders(), 0, 'arrival reminder retry is deduplicated');

select is((select outcome from public.set_booking_payment_state(
  'd1000000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001',
  'a9100000-0000-4000-8000-000000000001', 'balance_due', 'on_site', 'EUR', 10000, 2000,
  now() - interval '1 day', null, 'Collect at arrival'
)), 'updated', 'payment state succeeds independently of email delivery');
select is((select status::text from public.bookings where id = 'a9200000-0000-4000-8000-000000000001'), 'confirmed', 'overdue notification never cancels booking');
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'payment_balance_reminder'), 1, 'balance reminder is queued');

insert into public.berths(id, marina_id, code, zone, max_length_m, max_beam_m, max_draft_m, priority, status)
values ('a9300000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'NOT-1', 'Notify', 12, 4, 2.5, 991, 'available');
update public.berths set status = 'blocked' where id = 'a9300000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001'), 3, 'berth outage does not notify the customer before staff resolves it');
update public.berths set status = 'available' where id = 'a9300000-0000-4000-8000-000000000001';
insert into public.booking_berth_assignments(
  id, marina_id, booking_id, berth_id, arrival_date, departure_date, assigned_by, assignment_kind
) values (
  'a9400000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001',
  'a9200000-0000-4000-8000-000000000001', 'a9300000-0000-4000-8000-000000000001',
  current_date + 2, current_date + 3, 'a9100000-0000-4000-8000-000000000001', 'planned_move'
);
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'berth_move_confirmation'), 1, 'confirmed berth move is queued');

update public.bookings set status = 'cancelled' where id = 'a9200000-0000-4000-8000-000000000001';
insert into public.booking_cancellation_events(
  marina_id, booking_id, cancelled_by, reason, policy_code, refund_percent
) values (
  'd1000000-0000-4000-8000-000000000001', 'a9200000-0000-4000-8000-000000000001',
  'a9100000-0000-4000-8000-000000000001', 'Test cancellation', 'standard_before_arrival', 0
);
select is((select count(*)::integer from public.notification_outbox where booking_id = 'a9200000-0000-4000-8000-000000000001' and event_type = 'cancellation_confirmation'), 1, 'cancellation confirmation is queued');

create temporary table claimed_notifications as
select * from public.claim_notification_deliveries(1, 120);
select is((select count(*)::integer from claimed_notifications), 1, 'worker atomically claims one notification');
select is((select status::text from claimed_notifications), 'processing', 'claim marks notification processing');
select is((select attempt_count from claimed_notifications), 1, 'claim increments attempt count');
select is((select public.complete_notification_delivery(id, lease_token, false, null, 'provider unavailable') from claimed_notifications), 'failed', 'failed delivery is recorded for retry');
select is((select count(*)::integer from public.notification_delivery_attempts where outcome = 'failed'), 1, 'failed attempt is logged');
select is((select status::text from public.notification_outbox where id = (select id from claimed_notifications)), 'failed', 'failed outbox item remains retryable');
select is((select status::text from public.bookings where id = 'a9200000-0000-4000-8000-000000000001'), 'cancelled', 'email failure does not roll back or alter committed booking state');

reset role;
update public.notification_outbox set next_attempt_at = statement_timestamp() - interval '1 second'
where id = (select id from claimed_notifications);
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
create temporary table retried_notifications as
select * from public.claim_notification_deliveries(1, 120);
select is((select attempt_count from retried_notifications), 2, 'retry receives a new attempt number');
select is((select public.complete_notification_delivery(id, lease_token, true, 'postmark-message-1', null) from retried_notifications), 'sent', 'successful retry is finalized');
select is((select count(*)::integer from public.notification_delivery_attempts where notification_id = (select id from retried_notifications)), 2, 'both delivery results are retained');
select is((select count(*)::integer from public.notification_outbox where status = 'sent' and id = (select id from retried_notifications)), 1, 'sent notification is stored once');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a9100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::integer from public.notification_outbox where marina_id = 'd1000000-0000-4000-8000-000000000001'), 0, 'cross-tenant outbox access is denied');

reset role;
select throws_ok(
  $$update public.notification_delivery_attempts set error_message = 'tampered' where outcome = 'failed'$$,
  '23514', 'Notification delivery history is append-only.', 'attempt history cannot be rewritten'
);
select throws_ok(
  $$delete from public.notification_delivery_attempts$$,
  '23514', 'Notification delivery history is append-only.', 'attempt history cannot be deleted'
);

select * from finish();
rollback;
