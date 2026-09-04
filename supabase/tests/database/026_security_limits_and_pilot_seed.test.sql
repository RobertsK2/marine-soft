begin;
select plan(25);
set local role service_role;

select has_column('public','booking_holds','requester_session_hash','holds retain a pseudonymous session bucket');
select has_column('public','booking_holds','requester_network_hash','holds retain a pseudonymous network bucket');
select ok(not has_function_privilege('anon','public.create_booking_hold(uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text)','execute'),'anonymous clients cannot bypass the server hold boundary');

create temporary table limited_hold_one as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001',
  '2029-01-01','2029-01-03','14:00','10:00','Limit One',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-01-01","departureDate":"2029-01-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64));
create temporary table limited_hold_two as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000002',
  '2029-02-01','2029-02-03','14:00','10:00','Limit Two',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-02-01","departureDate":"2029-02-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64));
select is((select outcome from limited_hold_one),'created','first hold in a session is created');
select is((select outcome from limited_hold_two),'created','second hold in a session is created');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000003',
  '2029-03-01','2029-03-03','14:00','10:00','Limit Three',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-03-01","departureDate":"2029-03-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64)
)),'rate_limited','a rotated idempotency key cannot exceed the active session limit');
select is((select count(*)::integer from public.booking_holds where idempotency_key='76000000-0000-4000-8000-000000000003'),0,'a limited request creates no hold row');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000001',
  '2029-01-01','2029-01-03','14:00','10:00','Limit One',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-01-01","departureDate":"2029-01-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64)
)),'existing','same-key replay remains idempotent even at the limit');
select ok(public.release_booking_hold_after_checkout_failure((select hold_token from limited_hold_one)),'released holds immediately free the active quota');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','76000000-0000-4000-8000-000000000004',
  '2029-03-01','2029-03-03','14:00','10:00','After Release',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-03-01","departureDate":"2029-03-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64)
)),'created','a legitimate new hold succeeds after release');
select is((select outcome from public.create_booking_hold(
  'e1000000-0000-4000-8000-000000000002','76000000-0000-4000-8000-000000000005',
  '2029-03-01','2029-03-03','14:00','10:00','Other Tenant',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2029-03-01","departureDate":"2029-03-03","vesselLengthM":8}'::jsonb,repeat('a',64),repeat('b',64)
)),'not_found','limits never reveal or open an unpublished tenant');

insert into public.bookings(marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m)
select 'e1000000-0000-4000-8000-000000000002','2030-01-01','2030-01-03','14:00','10:00',
  'Budget Customer '||n,'budget-'||n||'@example.test','+3712000'||lpad(n::text,4,'0'),'Budget Vessel '||n,8,2.5,1.2
from generate_series(1,64) n;
select throws_ok(
  $$select private.capacity_is_available('e1000000-0000-4000-8000-000000000002','2030-01-01','2030-01-03',8,2.5,1.2)$$,
  '54000','BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED','capacity search raises a distinct fail-safe at the demand budget');
select throws_ok(
  $$select private.extension_capacity_is_available_on_berth('e1000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','2030-01-01','2030-01-03',8,2.5,1.2,null)$$,
  '54000','BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED','extension allocation uses the same fail-safe budget');
select is((select count(*)::integer from public.bookings where marina_id='e1000000-0000-4000-8000-000000000002' and arrival_date='2030-01-01'),64,'a failed allocation check mutates no booking state');

insert into public.bookings(marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m)
select 'd1000000-0000-4000-8000-000000000001','2040-01-01','2040-01-03','14:00','10:00',
  'Node Customer '||n,'node-'||n||'@example.test','+3712100'||lpad(n::text,4,'0'),'Node Vessel '||n,8,2.5,1.2
from generate_series(1,9) n;
select throws_ok(
  $$select private.capacity_is_available('d1000000-0000-4000-8000-000000000001','2040-01-01','2040-01-03',8,2.5,1.2)$$,
  '54000','BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED','general allocation fails safely after its SQL node budget');
select throws_ok(
  $$select private.extension_capacity_is_available_on_berth('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','2040-01-01','2040-01-03',8,2.5,1.2,null)$$,
  '54000','BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED','forced-berth allocation inherits the SQL node fail-safe');

select is((select count(*)::integer from public.bookings where id::text like 'da000000-%'),5,'reusable pilot seed contains five stable booking scenarios');
select is((select count(*)::integer from public.booking_berth_assignments where id::text like 'db000000-%'),2,'reusable pilot seed contains stable berth assignments');
select is((select count(distinct status)::integer from public.bookings where id::text like 'da000000-%'),3,'pilot scenarios include confirmed, checked-in, and cancelled lifecycle states');
select is((select count(*)::integer from public.bookings where id::text like 'da000000-%' and price_snapshot ?& array['pricingModel','taxBehavior','nights','mandatoryFees','subtotalMinor','taxMinor']),5,'pilot scenarios include complete immutable price snapshots');
select is((select count(*)::integer from public.bookings where id::text like 'da000000-%' and marina_id<>'d1000000-0000-4000-8000-000000000001'),0,'pilot records stay within their intended tenant');
select is((select count(*)::integer from public.booking_payment_balances where id='dd000000-0000-4000-8000-000000000001'),1,'pilot seed includes a representative outstanding balance');
select is((select count(*)::integer from public.booking_cancellation_events where id='dc000000-0000-4000-8000-000000000001'),1,'pilot seed includes immutable cancellation history');
select is((select count(*)::integer from public.notification_outbox where booking_id::text like 'da000000-%' and status='sent'),7,'pilot notifications are deterministic delivered history');
select ok(exists(select 1 from public.bookings where id='da000000-0000-4000-8000-000000000005' and vessel_length_m>(select max(max_length_m) from public.berths where marina_id='d1000000-0000-4000-8000-000000000001')),'pilot seed includes an explicit unassignable berth conflict');

select * from finish();
rollback;
