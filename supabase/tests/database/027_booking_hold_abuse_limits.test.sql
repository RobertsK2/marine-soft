begin;
select plan(8);
set local role service_role;

insert into public.booking_holds(
  id,marina_id,idempotency_key,requester_session_hash,requester_network_hash,
  arrival_date,departure_date,eta,etd,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
  status,created_at,expires_at,price_currency,price_total_minor,price_snapshot
)
select gen_random_uuid(),'d1000000-0000-4000-8000-000000000001',gen_random_uuid(),
  lpad(n::text,64,'1'),repeat('b',64),'2031-01-01'::date+n*3,'2031-01-03'::date+n*3,
  '14:00','10:00','Network Limit '||n,8,2.5,1.2,'active',statement_timestamp(),statement_timestamp()+interval '15 minutes',
  'EUR',5000,jsonb_build_object('version',1,'currency','EUR','totalMinor',5000,'arrivalDate',('2031-01-01'::date+n*3)::text,'departureDate',('2031-01-03'::date+n*3)::text,'vesselLengthM',8)
from generate_series(1,4) n;

select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001',
  '2031-02-01','2031-02-03','14:00','10:00','Network Limited',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-02-01","departureDate":"2031-02-03","vesselLengthM":8}',repeat('c',64),repeat('b',64)
)),'rate_limited','rotating browser sessions cannot exceed the active network limit');
select is((select count(*)::integer from public.booking_holds where idempotency_key='77000000-0000-4000-8000-000000000001'),0,'network-limited request creates no row');

insert into public.booking_holds(
  id,marina_id,idempotency_key,requester_session_hash,requester_network_hash,
  arrival_date,departure_date,eta,etd,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
  status,created_at,expires_at,released_at,release_reason,price_currency,price_total_minor,price_snapshot
)
select gen_random_uuid(),'d1000000-0000-4000-8000-000000000001',gen_random_uuid(),repeat('d',64),lpad(n::text,64,'e'),
  '2031-03-01'::date+n*3,'2031-03-03'::date+n*3,'14:00','10:00','Hourly Limit '||n,8,2.5,1.2,
  'released',statement_timestamp()-interval '10 minutes',statement_timestamp()+interval '5 minutes',
  statement_timestamp()-interval '9 minutes','checkout_session_creation_failed','EUR',5000,
  jsonb_build_object('version',1,'currency','EUR','totalMinor',5000,'arrivalDate',('2031-03-01'::date+n*3)::text,'departureDate',('2031-03-03'::date+n*3)::text,'vesselLengthM',8)
from generate_series(1,5) n;

select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000002',
  '2031-04-01','2031-04-03','14:00','10:00','Hourly Limited',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-04-01","departureDate":"2031-04-03","vesselLengthM":8}',repeat('d',64),repeat('f',64)
)),'rate_limited','released-key churn cannot exceed the hourly session limit');
select is((select count(*)::integer from public.booking_holds where idempotency_key='77000000-0000-4000-8000-000000000002'),0,'hourly-limited request creates no row');

insert into public.booking_holds(
  id,marina_id,idempotency_key,requester_session_hash,requester_network_hash,
  arrival_date,departure_date,eta,etd,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
  status,created_at,expires_at,price_currency,price_total_minor,price_snapshot
) values
  ('77000000-0000-4000-8000-000000000010','d1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000011',repeat('1',64),repeat('2',64),
   '2031-05-01','2031-05-03','14:00','10:00','Expired One',8,2.5,1.2,'expired',statement_timestamp()-interval '20 minutes',statement_timestamp()-interval '5 minutes','EUR',5000,
   '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-05-01","departureDate":"2031-05-03","vesselLengthM":8}'),
  ('77000000-0000-4000-8000-000000000012','d1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000013',repeat('1',64),repeat('2',64),
   '2031-05-04','2031-05-06','14:00','10:00','Expired Two',8,2.5,1.2,'expired',statement_timestamp()-interval '20 minutes',statement_timestamp()-interval '5 minutes','EUR',5000,
   '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-05-04","departureDate":"2031-05-06","vesselLengthM":8}');
select is((select outcome from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000014',
  '2031-05-07','2031-05-09','14:00','10:00','After Expiry',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-05-07","departureDate":"2031-05-09","vesselLengthM":8}',repeat('1',64),repeat('2',64)
)),'created','expired holds free the active quota');

select throws_ok($$select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000020','2031-06-01','2031-06-03','14:00','10:00','Bad Hash',8,2.5,1.2,'EUR',5000,
  '{"version":1,"currency":"EUR","totalMinor":5000,"arrivalDate":"2031-06-01","departureDate":"2031-06-03","vesselLengthM":8}','raw-client-token',repeat('2',64))$$,
  '22023','Invalid anonymous requester fingerprint.','raw requester identifiers are rejected at the RPC boundary');
select throws_ok($$update public.booking_holds set requester_session_hash=repeat('9',64) where id='77000000-0000-4000-8000-000000000010'$$,
  'P0001','Booking hold request, expiry, and price snapshot are immutable.','requester fingerprints are immutable');
select ok(not has_function_privilege('authenticated','public.create_booking_hold(uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text)','execute'),'authenticated browser clients cannot call the privileged hold RPC directly');

select * from finish();
rollback;
