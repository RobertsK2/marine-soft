begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

select has_function('public', 'get_marina_integration_health', array['uuid'], 'tenant integration health RPC exists');
select function_privs_are('public', 'get_marina_integration_health', array['uuid'], 'authenticated', array['EXECUTE'], 'authenticated users can call the guarded health RPC');
select ok(not has_function_privilege('anon', 'public.get_marina_integration_health(uuid)', 'execute'), 'anonymous clients cannot call integration health');
select has_trigger('public', 'marinas', 'marinas_capture_stripe_account_audit', 'persisted Stripe account configuration has audit coverage');

update public.marinas set stripe_account_id = 'acct_statusaudita'
where id = 'd1000000-0000-4000-8000-000000000001';
select ok(exists(select 1 from public.audit_events where event_type = 'integration.stripe_account_changed' and marina_id = 'd1000000-0000-4000-8000-000000000001'), 'Stripe account configuration change is audited');
select is((select actor_type from public.audit_events where event_type = 'integration.stripe_account_changed' order by id desc limit 1), 'system', 'server-side configuration change records the system actor');
select ok((select before_data::text not like '%acct_%' from public.audit_events where event_type = 'integration.stripe_account_changed' order by id desc limit 1), 'audit before state contains no provider account identifier');
select ok((select after_data::text not like '%acct_%' from public.audit_events where event_type = 'integration.stripe_account_changed' order by id desc limit 1), 'audit after state contains no provider account identifier');
select is((select metadata ->> 'configuration_change' from public.audit_events where event_type = 'integration.stripe_account_changed' order by id desc limit 1), 'replaced', 'redacted audit identifies the configuration transition');

insert into auth.users(instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'c7100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'integration-admin@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c7100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'integration-staff@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c7100000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'integration-other@example.test', '', now(), '{}', '{}', now(), now());
insert into public.organization_members(organization_id, user_id, role) values
  ('d0000000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000001', 'marina_admin'),
  ('d0000000-0000-4000-8000-000000000001', 'c7100000-0000-4000-8000-000000000002', 'marina_staff'),
  ('e0000000-0000-4000-8000-000000000002', 'c7100000-0000-4000-8000-000000000003', 'marina_admin');

update public.marinas set stripe_account_id = 'acct_statusauditb'
where id = 'e1000000-0000-4000-8000-000000000002';

insert into public.booking_holds(
  id, public_token, marina_id, idempotency_key, arrival_date, departure_date, eta, etd,
  vessel_length_m, vessel_beam_m, vessel_draft_m, expires_at, price_currency,
  price_total_minor, price_snapshot, created_at
) values
  ('c7200000-0000-4000-8000-000000000001', 'c7210000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'c7220000-0000-4000-8000-000000000001', '2027-06-01', '2027-06-02', '14:00', '10:00', 10, 3, 1.5, '2026-09-04 12:15:00+00', 'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-06-01","departureDate":"2027-06-02","vesselLengthM":10}', '2026-09-04 12:00:00+00'),
  ('c7200000-0000-4000-8000-000000000002', 'c7210000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'c7220000-0000-4000-8000-000000000002', '2027-06-01', '2027-06-02', '14:00', '10:00', 10, 3, 1.5, '2026-09-04 12:15:00+00', 'EUR', 10000, '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-06-01","departureDate":"2027-06-02","vesselLengthM":10}', '2026-09-04 12:00:00+00');
insert into public.booking_payments(id, hold_id, marina_id, stripe_account_id, stripe_checkout_session_id, status, amount_total_minor, currency, price_snapshot)
values
  ('c7300000-0000-4000-8000-000000000001', 'c7200000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'acct_statusaudita', 'cs_status_a', 'pending', 10000, 'EUR', '{"version":1,"totalMinor":10000}'),
  ('c7300000-0000-4000-8000-000000000002', 'c7200000-0000-4000-8000-000000000002', 'e1000000-0000-4000-8000-000000000002', 'acct_statusauditb', 'cs_status_b', 'pending', 10000, 'EUR', '{"version":1,"totalMinor":10000}');
insert into public.stripe_webhook_events(stripe_event_id, event_type, stripe_account_id, stripe_checkout_session_id, outcome, processed_at)
values
  ('evt_status_a', 'checkout.session.completed', 'acct_statusaudita', 'cs_status_a', 'paid', '2026-09-04 12:30:00+00'),
  ('evt_status_b', 'checkout.session.async_payment_failed', 'acct_statusauditb', 'cs_status_b', 'failed', '2026-09-04 12:31:00+00');
insert into public.notification_outbox(marina_id, event_type, dedupe_key, recipient_email, subject, text_body)
values ('d1000000-0000-4000-8000-000000000001', 'arrival_reminder', 'integration-status-a', 'status@example.test', 'Status', 'Status body');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"c7100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is((select count(*)::integer from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 1, 'owned marina admin receives one health row');
select is((select stripe_webhook_event_count from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 1::bigint, 'health includes only matched tenant webhook activity');
select is((select latest_stripe_webhook_outcome from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 'paid', 'latest matched webhook outcome is reported');
select is((select pending_payment_count from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 1::bigint, 'tenant pending payment count is reported');
select is((select failed_payment_count from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 0::bigint, 'tenant failed payment count is reported');
select is((select pending_notification_count from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 1::bigint, 'tenant pending notification count is reported');
select is((select sent_notification_count from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), 7::bigint, 'tenant sent notification count includes deterministic pilot history');
select is((select latest_notification_attempt_at from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')), null::timestamptz, 'no notification attempt is reported when none exists');

select set_config('request.jwt.claims', '{"sub":"c7100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$select * from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')$$, '42501', 'Marina admin access is required.', 'marina staff cannot read integration health');
select set_config('request.jwt.claims', '{"sub":"c7100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$select * from public.get_marina_integration_health('d1000000-0000-4000-8000-000000000001')$$, '42501', 'Marina admin access is required.', 'another tenant admin cannot read integration health');
select is((select stripe_webhook_event_count from public.get_marina_integration_health('e1000000-0000-4000-8000-000000000002')), 1::bigint, 'other admin sees only its own matched webhook activity');
select is((select pending_notification_count from public.get_marina_integration_health('e1000000-0000-4000-8000-000000000002')), 0::bigint, 'other admin does not see first tenant notification queue');

reset role;
select is((select count(*)::integer from public.booking_payments where id in ('c7300000-0000-4000-8000-000000000001', 'c7300000-0000-4000-8000-000000000002')), 2, 'health reads do not mutate payment records');
select is((select count(*)::integer from public.stripe_webhook_events where stripe_event_id in ('evt_status_a', 'evt_status_b')), 2, 'health reads do not mutate webhook history');
select is((select count(*)::integer from public.notification_outbox where dedupe_key = 'integration-status-a'), 1, 'health reads do not invoke the notification worker');

select * from finish();
rollback;
