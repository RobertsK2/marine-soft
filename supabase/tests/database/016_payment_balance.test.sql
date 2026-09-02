begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

select has_table('public','booking_payment_balances','payment balance table exists');
select has_function('public','set_booking_payment_state',array['uuid','uuid','uuid','booking_payment_state','booking_collection_method','text','bigint','bigint','timestamp with time zone','text','text'],'payment state RPC exists');
select ok((select relrowsecurity from pg_class where oid='public.booking_payment_balances'::regclass),'payment balances enforce RLS');
select ok(not has_table_privilege('authenticated','public.booking_payment_balances','insert'),'clients cannot forge payment balances');
select ok(not has_function_privilege('authenticated','public.set_booking_payment_state(uuid,uuid,uuid,booking_payment_state,booking_collection_method,text,bigint,bigint,timestamp with time zone,text,text)','execute'),'clients cannot bypass payment state validation');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','d1500000-0000-4000-8000-000000000001','authenticated','authenticated','payment-admin@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000002','e2500000-0000-4000-8000-000000000002','authenticated','authenticated','payment-other@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','e2500000-0000-4000-8000-000000000002','marina_admin');
insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status,price_currency,price_total_minor,price_snapshot) values
  ('f4100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Paid Full','paid-full@example.test','+37124000001','Full',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4100000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Deposit','deposit@example.test','+37124000002','Deposit',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4100000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Overdue','overdue@example.test','+37124000003','Overdue',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4100000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Outside','outside@example.test','+37124000004','Outside',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4100000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000002',current_date + 10,current_date + 12,'14:00','10:00','Other','other@example.test','+37124000005','Other',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb);

set local role service_role;
select set_config('request.jwt.claims','{"sub":"d1500000-0000-4000-8000-000000000001","role":"service_role"}',true);
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','paid_in_full','berthio','EUR',10000,10000,null,null,'Stripe paid')),'updated','paid-in-full state saves');
select is((select balance_due_minor from public.booking_payment_balances where booking_id='f4100000-0000-4000-8000-000000000001'),0::bigint,'paid-in-full has no balance');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000001','deposit_paid','on_site','EUR',10000,3000,now() + interval '2 days',null,'Deposit received')),'updated','deposit state saves');
select is((select balance_due_minor from public.booking_payment_balances where booking_id='f4100000-0000-4000-8000-000000000002'),7000::bigint,'deposit leaves balance due');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000003','d1500000-0000-4000-8000-000000000001','balance_due','on_site','EUR',10000,4000,now() - interval '1 day',null,'Call customer')),'updated','balance-due state saves');
select ok((select overdue from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000003','d1500000-0000-4000-8000-000000000001','balance_due','on_site','EUR',10000,4000,now() - interval '1 day',null,'Call customer')),'past due balance is flagged overdue');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000004','d1500000-0000-4000-8000-000000000001','paid_outside_berthio','outside_berthio','EUR',10000,10000,null,null,'Cash at office')),'updated','outside-Berthio payment saves');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000002','d1500000-0000-4000-8000-000000000001','payment_link_required','payment_link','EUR',10000,3000,now() + interval '1 day','https://pay.example.test/abc','Send link')),'updated','payment-link state saves');
select is((select collection_method::text from public.booking_payment_balances where booking_id='f4100000-0000-4000-8000-000000000002'),'payment_link','payment-link handling is recorded');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','paid_in_full','berthio','EUR',10000,9000,null,null,null)),'invalid_state','paid-in-full requires zero balance');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','balance_due','on_site','EUR',10000,11000,null,null,null)),'invalid_amounts','paid amount cannot exceed total');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4100000-0000-4000-8000-000000000001','d1500000-0000-4000-8000-000000000001','payment_link_required','on_site','EUR',10000,3000,null,null,null)),'invalid_state','payment-link state requires link method');
select is((select status::text from public.bookings where id='f4100000-0000-4000-8000-000000000003'),'confirmed','overdue balance does not cancel booking');
select is((select outcome from public.set_booking_payment_state('e1000000-0000-4000-8000-000000000002','f4100000-0000-4000-8000-000000000005','d1500000-0000-4000-8000-000000000001','paid_in_full','berthio','EUR',10000,10000,null,null,null)),'unauthorized','cross-tenant state update is denied');
select is((select count(*)::integer from public.booking_payment_balances where marina_id='e1000000-0000-4000-8000-000000000002'),0,'cross-tenant balance remains untouched');

reset role;
select * from finish();
rollback;
