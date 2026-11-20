begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','d1600000-0000-4000-8000-000000000001','authenticated','authenticated','payment-admin@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000002','e2600000-0000-4000-8000-000000000002','authenticated','authenticated','payment-other@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000001','marina_admin'),
  ('e0000000-0000-4000-8000-000000000002','e2600000-0000-4000-8000-000000000002','marina_admin');
insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status,price_currency,price_total_minor,price_snapshot) values
  ('f4200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Paid Full','paid-full@example.test','+37124000001','Full',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4200000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Deposit','deposit@example.test','+37124000002','Deposit',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4200000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Overdue','overdue@example.test','+37124000003','Overdue',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4200000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Outside','outside@example.test','+37124000004','Outside',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('f4200000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000002',current_date + 10,current_date + 12,'14:00','10:00','Other','other@example.test','+37124000005','Other',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb);


insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('d1600000-0000-4000-8000-000000000003','authenticated','authenticated','receipt-staff@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role) values
('d0000000-0000-4000-8000-000000000001','d1600000-0000-4000-8000-000000000003','marina_staff');
-- Independent receipt fixtures, with one legacy opening paid amount.
insert into public.booking_payment_balances(marina_id,booking_id,state,collection_method,currency,total_due_minor,paid_minor,balance_due_minor)
select marina_id,id,'balance_due','on_site','EUR',10000,case when id::text like '%0003' then 2000 else 0 end,
  case when id::text like '%0003' then 8000 else 10000 end
from public.bookings where id::text like 'f4200000%';
create function pg_temp.collect(amount bigint, request text, paid bigint default 0, booking text default 'f4200000-0000-4000-8000-000000000001', actor text default 'd1600000-0000-4000-8000-000000000001', currency text default 'EUR') returns text
language sql as $$
select outcome from public.record_booking_offline_payment('d1000000-0000-4000-8000-000000000001',booking::uuid,actor::uuid,'Verified test actor',request::uuid,currency,amount,'cash','Receipt test',paid);
$$;
select ok((select relrowsecurity from pg_class where oid='public.booking_offline_payments'::regclass),'receipts use RLS');
select ok(not has_table_privilege('authenticated','public.booking_offline_payments','insert'),'staff cannot insert receipts directly');
select ok(not has_table_privilege('service_role','public.booking_offline_payments','update'),'service role cannot edit receipts');
select ok(not has_function_privilege('authenticated','public.record_booking_offline_payment(uuid,uuid,uuid,text,uuid,text,bigint,text,text,bigint)','execute'),'record RPC is server only');
set local role service_role;
select is(pg_temp.collect(1976,'10000000-0000-4000-8000-000000000001'),'recorded','partial payment');
select is(pg_temp.collect(1976,'10000000-0000-4000-8000-000000000001'),'already_recorded','identical retry');
select is(pg_temp.collect(2000,'10000000-0000-4000-8000-000000000001'),'idempotency_conflict','changed payload cannot reuse key');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000002'),'stale','second staff submission with old balance rejected');
select is(pg_temp.collect(24,'10000000-0000-4000-8000-000000000002',1976),'recorded','second partial payment');
select is((select paid_minor from public.booking_payment_balances where booking_id='f4200000-0000-4000-8000-000000000001'),2000::bigint,'partial payments accumulate exactly');
select is((select state::text from public.booking_payment_balances where booking_id='f4200000-0000-4000-8000-000000000001'),'deposit_paid','derived partial state');
select is(pg_temp.collect(8001,'10000000-0000-4000-8000-000000000003',2000),'excessive_amount','cannot overpay');
select is(pg_temp.collect(0,'10000000-0000-4000-8000-000000000003',2000),'invalid_payment','zero rejected');
select is(pg_temp.collect(-1,'10000000-0000-4000-8000-000000000003',2000),'invalid_payment','negative rejected');
select is(pg_temp.collect(8000,'10000000-0000-4000-8000-000000000003',2000),'recorded','pay remaining balance');
select is((select state::text from public.booking_payment_balances where booking_id='f4200000-0000-4000-8000-000000000001'),'paid_in_full','derived fully paid state');
select is(pg_temp.collect(1,'10000000-0000-4000-8000-000000000008',10000),'excessive_amount','fully paid booking rejects a fresh collection');
select is((select count(*)::integer from public.booking_offline_payments where booking_id='f4200000-0000-4000-8000-000000000001'),3,'three real receipts only');
select is((select status::text from public.bookings where id='f4200000-0000-4000-8000-000000000001'),'confirmed','collection never changes booking status');
select is(pg_temp.collect(10000,'10000000-0000-4000-8000-000000000004',0,'f4200000-0000-4000-8000-000000000002'),'recorded','single full payment');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000005',2000,'f4200000-0000-4000-8000-000000000003'),'recorded','legacy opening amount preserved');
select is((select paid_before_minor from public.booking_offline_payments where booking_id='f4200000-0000-4000-8000-000000000003'),2000::bigint,'does not fabricate historic receipts');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000006',0,'f4200000-0000-4000-8000-000000000005'),'not_found','cross-marina booking rejected');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000006',0,'f4200000-0000-4000-8000-000000000004','e2600000-0000-4000-8000-000000000002'),'unauthorized','other marina actor rejected');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000006',0,'f4200000-0000-4000-8000-000000000004','d1600000-0000-4000-8000-000000000001','USD'),'invalid_payment','wrong currency rejected');
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000007',0,'f4200000-0000-4000-8000-000000000004','d1600000-0000-4000-8000-000000000003'),'recorded','marina staff may register receipts');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000004','d1600000-0000-4000-8000-000000000003','deposit_paid','on_site','EUR',10000,1000,null,null,null)),'unauthorized','staff cannot call advanced editor');
select is((select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000003','d1600000-0000-4000-8000-000000000001','deposit_paid','on_site','EUR',10000,4000,null,null,null)),'history_locked','advanced editor cannot overwrite receipt history');
select is((select paid_total_minor from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000003','d1600000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='f4200000-0000-4000-8000-000000000003'))),3000::bigint,'refund preview uses actual money received');
select is((select outcome from public.audited_confirm_booking_cancellation('d1000000-0000-4000-8000-000000000001','f4200000-0000-4000-8000-000000000003','d1600000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='f4200000-0000-4000-8000-000000000003'),'Receipt cancellation test')),'cancelled','actual cancellation succeeds after partial collection');
select is((select paid_total_minor from public.booking_cancellation_events where booking_id='f4200000-0000-4000-8000-000000000003'),3000::bigint,'immutable cancellation snapshots actual paid amount');
select is((select paid_minor from public.booking_payment_balances where booking_id='f4200000-0000-4000-8000-000000000003'),3000::bigint,'cancellation does not pretend to issue a refund');
select is((select count(*)::integer from public.booking_offline_payments where booking_id='f4200000-0000-4000-8000-000000000003'),1,'cancellation preserves receipts');
reset role;
select throws_ok($$update public.booking_offline_payments set amount_minor=1 where booking_id='f4200000-0000-4000-8000-000000000003'$$,'23514','Offline payment history is immutable.','receipts cannot be edited even by owner');
select throws_ok($$delete from public.booking_offline_payments where booking_id='f4200000-0000-4000-8000-000000000003'$$,'23514','Offline payment history is immutable.','receipts cannot be deleted');
set constraints all immediate;
select lives_ok($$select 1$$,'receipt and balance deferred checks succeed');
select throws_ok($$update public.booking_payment_balances set paid_minor=4000,balance_due_minor=6000 where booking_id='f4200000-0000-4000-8000-000000000003'$$,'23514','Booking balance must match immutable offline receipts.','direct cumulative overwrite rejected');
update public.bookings set status='cancelled' where id='f4200000-0000-4000-8000-000000000004';
select is(pg_temp.collect(1000,'10000000-0000-4000-8000-000000000006',0,'f4200000-0000-4000-8000-000000000004'),'cancelled','cancelled booking cannot receive a new collection');
select set_config('request.jwt.claims','{"sub":"e2600000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.booking_offline_payments),0,'RLS hides other marina receipts');
reset role;
select set_config('request.jwt.claims','{"sub":"d1600000-0000-4000-8000-000000000003","role":"authenticated"}',true);
set local role authenticated;
select is((select count(*)::integer from public.booking_offline_payments),6,'own marina staff can read receipt history');
reset role;
select * from finish();
rollback;
