begin;

create extension if not exists pgtap with schema extensions;
select plan(21);

select ok((select accepts_online_payment and not accepts_pay_at_marina from public.marinas where id='d1000000-0000-4000-8000-000000000001'), 'existing marina defaults to online only');
select throws_ok(
  $$update public.marinas set accepts_online_payment=false,accepts_pay_at_marina=false where id='d1000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'at least one payment method remains enabled');
select ok(not has_function_privilege('anon', 'public.confirm_pay_at_marina_booking(uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text)', 'execute'), 'anonymous role cannot call pay-at-marina confirmation RPC');
select ok(not has_function_privilege('authenticated', 'public.confirm_pay_at_marina_booking(uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text)', 'execute'), 'authenticated role cannot call pay-at-marina confirmation RPC');

update public.marinas set accepts_online_payment=true,accepts_pay_at_marina=true where id='d1000000-0000-4000-8000-000000000001';
create temporary table pay_later_result as select * from public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001',
  '2027-01-10','2027-01-12','14:00','10:00','Pay Later',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-01-10","departureDate":"2027-01-12","vesselLengthM":9.5}'::jsonb,
  repeat('8',64),repeat('9',64),'Guest Person','guest@example.test','+37120000000');
select is((select outcome from pay_later_result),'confirmed','pay-at-marina confirms atomically');
select is((select source::text from public.bookings where id=(select booking_id from pay_later_result)),'online','public booking retains online intake source');
select is((select customer_snapshot->>'source' from public.bookings where id=(select booking_id from pay_later_result)),'public_pay_at_marina','booking records immutable collection origin');
select is((select booking_payment_id from public.bookings where id=(select booking_id from pay_later_result)),null::uuid,'no Stripe payment record is linked');
select is((select count(*)::integer from public.booking_payments where hold_id=(select booking_hold_id from public.bookings where id=(select booking_id from pay_later_result))),0,'no Stripe ledger row is created');
select is((select status::text from public.booking_holds where id=(select booking_hold_id from public.bookings where id=(select booking_id from pay_later_result))),'consumed','protected hold is consumed');
select results_eq(
  $$select state::text,collection_method::text,total_due_minor,paid_minor,balance_due_minor from public.booking_payment_balances where booking_id=(select booking_id from pay_later_result)$$,
  $$values ('balance_due','on_site',10000::bigint,0::bigint,10000::bigint)$$,
  'full amount remains due on site');
select is((select count(*)::integer from public.notification_outbox where booking_id=(select booking_id from pay_later_result) and event_type='booking_confirmation'),1,'normal confirmation notification is queued');
select matches((select text_body from public.notification_outbox where booking_id=(select booking_id from pay_later_result) and event_type='booking_confirmation'),'Payment due at the marina','confirmation notification explains payment due');
select is((select outcome from public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000001',
  '2027-01-10','2027-01-12','14:00','10:00','Pay Later',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-01-10","departureDate":"2027-01-12","vesselLengthM":9.5}'::jsonb,
  repeat('8',64),repeat('9',64),'Guest Person','guest@example.test','+37120000000')),'existing','identical retry reuses booking');
select is((select count(*)::integer from public.bookings where booking_hold_id=(select booking_hold_id from public.bookings where id=(select booking_id from pay_later_result))),1,'retry creates no duplicate booking');

update public.marinas set accepts_online_payment=false,accepts_pay_at_marina=true where id='d1000000-0000-4000-8000-000000000001';
create temporary table online_disabled_hold as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000002',
  '2027-02-10','2027-02-12','14:00','10:00','No Stripe',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-02-10","departureDate":"2027-02-12","vesselLengthM":9.5}'::jsonb,
  repeat('a',64),repeat('b',64));
select is((select outcome from public.prepare_booking_checkout((select hold_token from online_disabled_hold))),'not_configured','pay-at-marina-only marina cannot start Stripe Checkout');
select is((select count(*)::integer from public.booking_payments where hold_id=(select id from public.booking_holds where public_token=(select hold_token from online_disabled_hold))),0,'disabled online flow creates no payment row');

update public.marinas set accepts_pay_at_marina=false,accepts_online_payment=true where id='d1000000-0000-4000-8000-000000000001';
select is((select outcome from public.confirm_pay_at_marina_booking(
  'd1000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000003',
  '2027-03-10','2027-03-12','14:00','10:00','Disabled Later',9.5,3.1,1.7,'EUR',10000,
  '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2027-03-10","departureDate":"2027-03-12","vesselLengthM":9.5}'::jsonb,
  repeat('c',64),repeat('d',64),'Guest Person','guest@example.test','+37120000000')),'method_disabled','online-only marina rejects pay-at-marina');
select is((select count(*)::integer from public.booking_holds where idempotency_key='78000000-0000-4000-8000-000000000003'),0,'disabled method allocates no inventory');

insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','78000000-0000-4000-8000-000000000010','authenticated','authenticated','payment-admin-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','78000000-0000-4000-8000-000000000011','authenticated','authenticated','payment-admin-b@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members (organization_id,user_id,role)
values
  ('d0000000-0000-4000-8000-000000000001','78000000-0000-4000-8000-000000000010','marina_admin'),
  ('e0000000-0000-4000-8000-000000000002','78000000-0000-4000-8000-000000000011','marina_admin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000010","role":"authenticated","aal":"aal2"}',true);
select results_eq(
  $$update public.marinas set accepts_pay_at_marina=true where id='d1000000-0000-4000-8000-000000000001' returning accepts_pay_at_marina$$,
  $$values (true)$$,
  'marina admin can configure accepted payment methods');
select set_config('request.jwt.claims','{"sub":"78000000-0000-4000-8000-000000000011","role":"authenticated","aal":"aal2"}',true);
select results_eq(
  $$update public.marinas set accepts_online_payment=false where id='d1000000-0000-4000-8000-000000000001' returning accepts_online_payment$$,
  $$select false where false$$,
  'another tenant cannot change payment methods');

select * from finish();
rollback;
