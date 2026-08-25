begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

select has_table('public','booking_payments','payment ledger exists');
select has_table('public','stripe_webhook_events','webhook event ledger exists');
select ok((select relrowsecurity from pg_class where oid='public.booking_payments'::regclass),'payment ledger has RLS');
select ok((select relrowsecurity from pg_class where oid='public.stripe_webhook_events'::regclass),'event ledger has RLS');
select ok(not has_table_privilege('anon','public.booking_payments','select'),'anonymous clients cannot inspect payments');
select ok(not has_function_privilege('anon','public.prepare_booking_checkout(uuid)','execute'),'anonymous clients cannot prepare checkout');
select is(enum_range(null::public.booking_payment_status)::text,'{pending,paid,failed,expired}','payment states are limited');

create temporary table phase6_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',
  '2026-12-20','2026-12-22','14:00','10:00','Stripe Test',19,5.8,3.1,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-12-20","departureDate":"2026-12-22","vesselLengthM":19}'::jsonb
);
create temporary table prepared as select * from public.prepare_booking_checkout((select hold_token from phase6_hold));
select is((select outcome from prepared),'ready','valid active hold prepares checkout');
select is((select amount_total_minor from prepared),10000::bigint,'checkout amount comes from immutable hold snapshot');
select is((select currency from prepared),'EUR','checkout currency comes from hold snapshot');
select is((select stripe_account_id from prepared),'acct_testmarinaa','checkout is scoped to marina connected account');
select ok(public.attach_booking_checkout_session((select payment_id from prepared),'cs_test_phase6'),'Stripe session attaches once');
select ok(public.attach_booking_checkout_session((select payment_id from prepared),'cs_test_phase6'),'same session attachment is idempotent');
select is(public.process_stripe_checkout_event(
  'evt_phase6_paid','checkout.session.completed','acct_testmarinaa','cs_test_phase6','pi_phase6','paid',10000,'eur',(select hold_token from phase6_hold),
  'Phase Six Customer','phase6@example.test','+37120000000'
),'confirmed','verified matching payment confirms the booking');
select is((select status::text from public.booking_payments where id=(select payment_id from prepared)),'paid','payment ledger is paid');
select ok((select payment_confirmed_at is not null from public.booking_holds where public_token=(select hold_token from phase6_hold)),'hold records webhook confirmation');
select is((select status::text from public.booking_holds where public_token=(select hold_token from phase6_hold)),'consumed','paid hold is consumed');
select is((select source::text from public.bookings where booking_payment_id=(select payment_id from prepared)),'online','confirmed booking is online');
select is((select count(*)::integer from public.bookings where booking_payment_id=(select payment_id from prepared)),1,'one booking is created');
select is(public.process_stripe_checkout_event(
  'evt_phase6_paid','checkout.session.completed','acct_testmarinaa','cs_test_phase6','pi_phase6','paid',10000,'eur',(select hold_token from phase6_hold),
  'Phase Six Customer','phase6@example.test','+37120000000'
),'duplicate','duplicate webhook delivery is safe');
select is((select count(*)::integer from public.stripe_webhook_events where stripe_event_id='evt_phase6_paid'),1,'webhook event is recorded once');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000099',
  '2026-12-20','2026-12-22','12:00','10:00','Second Customer',19,5.8,3.1,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2026-12-20","departureDate":"2026-12-22","vesselLengthM":19}'::jsonb
)),'unavailable','confirmed online booking affects public availability');

create temporary table failed_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002',
  '2026-12-24','2026-12-26','14:00','10:00','Failure Test',12,3.8,2.1,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2026-12-24","departureDate":"2026-12-26","vesselLengthM":12}'::jsonb
);
create temporary table failed_prepared as select * from public.prepare_booking_checkout((select hold_token from failed_hold));
select ok(public.fail_booking_checkout_creation((select payment_id from failed_prepared)),'checkout creation failure is recorded');
select is((select status::text from public.booking_holds where public_token=(select hold_token from failed_hold)),'released','checkout creation failure releases capacity');

create temporary table abandoned_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003',
  '2027-01-10','2027-01-12','14:00','10:00','Abandoned Test',12,3.8,2.1,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2027-01-10","departureDate":"2027-01-12","vesselLengthM":12}'::jsonb
);
create temporary table abandoned_prepared as select * from public.prepare_booking_checkout((select hold_token from abandoned_hold));
select ok(public.attach_booking_checkout_session((select payment_id from abandoned_prepared),'cs_test_abandoned'),'abandoned Checkout Session attaches');
select is(public.process_stripe_checkout_event(
  'evt_phase6_expired','checkout.session.expired','acct_testmarinaa','cs_test_abandoned',null,'unpaid',5000,'eur',(select hold_token from abandoned_hold)
),'expired','Stripe expiry reconciles an abandoned checkout');
select is((select status::text from public.booking_payments where id=(select payment_id from abandoned_prepared)),'expired','abandoned payment is expired');
select is((select status::text from public.booking_holds where public_token=(select hold_token from abandoned_hold)),'released','abandoned checkout releases its active hold');
select is((select release_reason from public.booking_holds where public_token=(select hold_token from abandoned_hold)),'checkout_session_expired','abandonment records the release reason');

select * from finish();
rollback;
