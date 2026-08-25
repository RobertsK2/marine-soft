begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

select is(enum_range(null::public.booking_source)::text,'{manual,online}','online source is constrained');
select is(enum_range(null::public.booking_hold_status)::text,'{active,released,expired,consumed}','holds have a terminal consumed state');
select has_column('public','bookings','customer_snapshot','booking stores customer snapshot');
select has_column('public','bookings','vessel_snapshot','booking stores vessel snapshot');
select has_column('public','bookings','booking_payment_id','booking links to exactly one payment');
select ok(not has_function_privilege('anon','public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid,text,text,text)','execute'),'anonymous clients cannot confirm bookings');

create temporary table phase7_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001',
  '2027-02-01','2027-02-03','15:00','09:30','Snapshot Vessel',14.25,4.1,2.4,'EUR',12345,
  '{"version":1,"currency":"EUR","totalMinor":12345,"arrivalDate":"2027-02-01","departureDate":"2027-02-03","vesselLengthM":14.25}'::jsonb
);
create temporary table phase7_payment as select * from public.prepare_booking_checkout((select hold_token from phase7_hold));
select ok(public.attach_booking_checkout_session((select payment_id from phase7_payment),'cs_test_phase7'),'Phase 7 Checkout Session attaches');
select is(public.process_stripe_checkout_event(
  'evt_phase7_paid','checkout.session.completed','acct_testmarinaa','cs_test_phase7','pi_phase7','paid',12345,'eur',(select hold_token from phase7_hold),
  '  Grace Hopper  ','GRACE@EXAMPLE.TEST',' +371 2000 0000 '
),'confirmed','paid webhook confirms an online booking');
select is((select count(*)::integer from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),1,'exactly one booking exists for the payment');
select is((select source::text from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'online','booking source is online');
select is((select status::text from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'confirmed','booking starts confirmed');
select is((select customer_name from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'Grace Hopper','customer name is normalized and snapshotted');
select is((select customer_email from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'grace@example.test','customer email is normalized and snapshotted');
select is((select customer_snapshot->>'phone' from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'+371 2000 0000','customer snapshot contains Stripe phone');
select is((select vessel_snapshot->>'name' from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'Snapshot Vessel','vessel snapshot comes from the hold');
select is((select price_snapshot->>'totalMinor' from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),'12345','price snapshot comes from the payment ledger');
select is((select status::text from public.booking_holds where public_token=(select hold_token from phase7_hold)),'consumed','confirmed hold is consumed');
select is(public.process_stripe_checkout_event(
  'evt_phase7_paid','checkout.session.completed','acct_testmarinaa','cs_test_phase7','pi_phase7','paid',12345,'eur',(select hold_token from phase7_hold),
  'Grace Hopper','grace@example.test','+371 2000 0000'
),'duplicate','same event delivery is idempotent');
select is((select outcome from public.stripe_webhook_events where stripe_event_id='evt_phase7_paid'),'confirmed','duplicate delivery preserves the original confirmation audit outcome');
select is(public.process_stripe_checkout_event(
  'evt_phase7_paid_again','checkout.session.async_payment_succeeded','acct_testmarinaa','cs_test_phase7','pi_phase7','paid',12345,'eur',(select hold_token from phase7_hold),
  'Grace Hopper','grace@example.test','+371 2000 0000'
),'already_confirmed','different paid event cannot create a second booking');
select is((select count(*)::integer from public.bookings where booking_payment_id=(select payment_id from phase7_payment)),1,'duplicate paid events still leave exactly one booking');

create temporary table critical_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000002',
  '2027-02-10','2027-02-12','15:00','09:30','Critical Vessel',10,3.2,1.8,'EUR',6000,
  '{"version":1,"currency":"EUR","totalMinor":6000,"arrivalDate":"2027-02-10","departureDate":"2027-02-12","vesselLengthM":10}'::jsonb
);
create temporary table critical_payment as select * from public.prepare_booking_checkout((select hold_token from critical_hold));
select ok(public.attach_booking_checkout_session((select payment_id from critical_payment),'cs_test_phase7_critical'),'critical-path Session attaches');
select is(public.process_stripe_checkout_event(
  'evt_phase7_critical','checkout.session.completed','acct_testmarinaa','cs_test_phase7_critical','pi_phase7_critical','paid',6000,'eur',(select hold_token from critical_hold),
  null,'critical@example.test',null
),'critical_paid_without_booking','missing customer snapshot is recorded as critical');
select ok((select status='paid' and not exists(select 1 from public.bookings where booking_payment_id=(select payment_id from critical_payment)) from public.booking_payments where id=(select payment_id from critical_payment)),'paid-without-booking is directly detectable');
select is((select outcome from public.stripe_webhook_events where stripe_event_id='evt_phase7_critical'),'critical_paid_without_booking','critical event remains visible in the webhook ledger');
select is(public.process_stripe_checkout_event(
  'evt_phase7_critical','checkout.session.completed','acct_testmarinaa','cs_test_phase7_critical','pi_phase7_critical','paid',6000,'eur',(select hold_token from critical_hold),
  'Retry Customer','retry@example.test','+37121111111'
),'confirmed','duplicate retry heals paid-without-booking when complete details arrive');
select is((select count(*)::integer from public.bookings where booking_payment_id=(select payment_id from critical_payment)),1,'healed retry creates exactly one booking');

select throws_ok(
  $$update public.bookings set customer_name='Changed' where booking_payment_id=(select payment_id from phase7_payment)$$,
  '23514','Online booking customer, vessel, hold, and payment snapshots are immutable.','online customer and vessel snapshots are immutable');

select * from finish();
rollback;
