begin;

create extension if not exists pgtap with schema extensions;
select plan(27);

select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname='create_booking_hold' and pronargs=15),1,'legacy hold RPC remains available');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname='create_booking_hold' and pronargs=16),1,'arrival-window hold RPC is available');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname='confirm_pay_at_marina_booking' and pronargs=18),1,'legacy pay-at-marina RPC remains available');
select is((select count(*)::integer from pg_proc where pronamespace='public'::regnamespace and proname='confirm_pay_at_marina_booking' and pronargs=19),1,'arrival-window pay-at-marina RPC is available');
select ok(not has_function_privilege('anon',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='create_booking_hold' and pronargs=16),'execute'),'anon cannot create an arrival-window hold');
select ok(not has_function_privilege('authenticated',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='create_booking_hold' and pronargs=16),'execute'),'authenticated cannot create an arrival-window hold');
select ok(has_function_privilege('service_role',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='create_booking_hold' and pronargs=16),'execute'),'service role can create an arrival-window hold');
select ok(not has_function_privilege('anon',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='confirm_pay_at_marina_booking' and pronargs=19),'execute'),'anon cannot confirm an arrival-window booking');
select ok(not has_function_privilege('authenticated',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='confirm_pay_at_marina_booking' and pronargs=19),'execute'),'authenticated cannot confirm an arrival-window booking');
select ok(has_function_privilege('service_role',(select oid from pg_proc where pronamespace='public'::regnamespace and proname='confirm_pay_at_marina_booking' and pronargs=19),'execute'),'service role can confirm an arrival-window booking');

create temporary table selected_window_holds as
select request.eta_window, request.idempotency_key, hold.outcome, hold.hold_token
from (values
  ('morning', '79000000-0000-4000-8000-000000000011'::uuid, '2027-10-01'::date),
  ('afternoon', '79000000-0000-4000-8000-000000000012'::uuid, '2027-10-11'::date),
  ('evening', '79000000-0000-4000-8000-000000000013'::uuid, '2027-10-21'::date)
) request(eta_window,idempotency_key,arrival_date)
cross join lateral public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001',request.idempotency_key,
  request.arrival_date,request.arrival_date+2,null::time,null::time,'Window Guest',9.5,3.1,1.7,
  'EUR',10000,jsonb_build_object('version',1,'currency','EUR','totalMinor',10000,
    'arrivalDate',request.arrival_date,'departureDate',request.arrival_date+2,'vesselLengthM',9.5),
  md5(request.eta_window)||md5(request.eta_window),
  md5(request.idempotency_key::text)||md5(request.idempotency_key::text),request.eta_window
) hold;
select is((select count(*)::integer from selected_window_holds where outcome='created'),3,'all three arrival windows create holds');
select is((select holds.eta_window from public.booking_holds holds join selected_window_holds selected on holds.public_token=selected.hold_token where selected.eta_window='morning'),'morning','morning window persists without exact time');
select is((select holds.eta_window from public.booking_holds holds join selected_window_holds selected on holds.public_token=selected.hold_token where selected.eta_window='afternoon'),'afternoon','afternoon window persists without exact time');
select is((select holds.eta_window from public.booking_holds holds join selected_window_holds selected on holds.public_token=selected.hold_token where selected.eta_window='evening'),'evening','evening window persists without exact time');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000011',
  '2027-10-01','2027-10-03',null::time,null::time,'Window Guest',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-10-01","departureDate":"2027-10-03","vesselLengthM":9.5}'::jsonb,
  md5('morning')||md5('morning'),md5('79000000-0000-4000-8000-000000000011')||md5('79000000-0000-4000-8000-000000000011'),'evening')),
  'idempotency_conflict','changing only the arrival window conflicts with the original hold');
select is((select count(*)::integer from public.booking_holds holds join selected_window_holds selected on holds.public_token=selected.hold_token where holds.eta is null and holds.etd is null),3,'arrival windows do not invent exact times');

update public.marinas set accepts_pay_at_marina=true where id='d1000000-0000-4000-8000-000000000001';
create temporary table window_booking as select * from public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000014',
  '2027-11-10','2027-11-12',null::time,null::time,'Window Booking',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-11-10","departureDate":"2027-11-12","vesselLengthM":9.5}'::jsonb,
  repeat('a',64),repeat('b',64),'Window Guest','window@example.test','+37120000002','morning');
select is((select outcome from window_booking),'confirmed','new pay-at-marina RPC confirms a window booking');
select results_eq(
  $$select eta::text,etd::text,eta_window from public.bookings where id=(select booking_id from window_booking)$$,
  $$values (null::text,null::text,'morning'::text)$$,
  'confirmed booking retains its window without invented exact times');

create temporary table optional_times_booking as select * from public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001','79000000-0000-4000-8000-000000000001',
  '2027-07-10','2027-07-12',null::time,null::time,'Optional ETA',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-07-10","departureDate":"2027-07-12","vesselLengthM":9.5}'::jsonb,
  repeat('8',64),repeat('9',64),'Guest Person','guest@example.test','+37120000000',null::text);
select is((select outcome from optional_times_booking),'confirmed','online booking confirms without exact times');
select results_eq(
  $$select eta::text,etd::text,eta_window from public.bookings where id=(select booking_id from optional_times_booking)$$,
  $$values (null::text,null::text,null::text)$$,
  'no exact times or arrival window are invented');
select is((select due_at from public.booking_payment_balances where booking_id=(select booking_id from optional_times_booking)),null::timestamptz,'unknown exact ETA leaves on-site due date unset');
select throws_ok(
  $$update public.bookings set eta_window='invalid' where id=(select booking_id from optional_times_booking)$$,
  '23514',null,'invalid arrival window is rejected');

-- The existing notification key uses updated_at rounded to seconds.
select pg_sleep(1.1);
update public.bookings set eta='14:30' where id=(select booking_id from optional_times_booking);
select is((select etd from public.bookings where id=(select booking_id from optional_times_booking)),null::time,'later ETA does not invent ETD');
select is((select due_at from public.booking_payment_balances where booking_id=(select booking_id from optional_times_booking)),
  ('2027-07-10 14:30'::timestamp at time zone 'Europe/Riga'),'later exact ETA establishes marina-local due date');
select is((select count(*)::integer from public.notification_outbox where booking_id=(select booking_id from optional_times_booking) and event_type='payment_balance_reminder'),2,'later due date queues a new balance reminder');

insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m)
values('79000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',
  '2027-08-10','2027-08-12','14:00','10:00','Manual Guest','manual@example.test','+37120000001',
  'Manual Boat',8,2.8,1.4);
select is((select source::text from public.bookings where id='79000000-0000-4000-8000-000000000002'),'manual','existing exact-time manual booking remains valid');
select throws_ok(
  $$update public.bookings set eta=null where id='79000000-0000-4000-8000-000000000002'$$,
  '23514',null,'manual booking cannot lose its exact ETA');

select * from finish();
rollback;
