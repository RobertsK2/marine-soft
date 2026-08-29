begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_table('public','booking_price_adjustments','price adjustment history exists');
select ok((select relrowsecurity from pg_class where oid='public.booking_price_adjustments'::regclass),'price history enforces RLS');
select has_function('public','update_booking_details',array[
  'uuid','uuid','uuid','timestamp with time zone','date','date','time without time zone',
  'time without time zone','text','text','text','text','numeric','numeric','numeric','jsonb'
],'booking change RPC exists');
select ok(not has_function_privilege('authenticated','public.update_booking_details(uuid,uuid,uuid,timestamp with time zone,date,date,time without time zone,time without time zone,text,text,text,text,numeric,numeric,numeric,jsonb)','execute'),'browser-authenticated clients cannot bypass server repricing');
select ok(not has_table_privilege('authenticated','public.booking_price_adjustments','insert'),'authenticated clients cannot forge price history');
select ok(not has_column_privilege('authenticated','public.bookings','arrival_date','update'),'authenticated clients cannot bypass server-side stay revalidation');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','a1300000-0000-4000-8000-000000000001','authenticated','authenticated','changes-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-8000-000000000000','a2300000-0000-4000-8000-000000000002','authenticated','authenticated','changes-b@example.test','',now(),'{}','{}',now(),now());

insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','a2300000-0000-4000-8000-000000000002','marina_admin');

insert into public.bookings (
  id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,
  vessel_length_m,vessel_beam_m,vessel_draft_m,status,
  price_currency,price_total_minor,price_snapshot
) values
  ('a3200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2031-06-01','2031-06-04','14:00','10:00','Price Guest','price@example.test','+37120000201','Price One',8,2.8,1.4,'confirmed','EUR',10000,
   '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2031-06-01","departureDate":"2031-06-04","vesselLengthM":8}'::jsonb),
  ('a3200000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','2031-07-01','2031-07-04','14:00','10:00','Assigned Guest','assigned-change@example.test','+37120000202','Assigned',8,2.8,1.4,'confirmed',null,null,null),
  ('a3200000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','2031-08-01','2031-08-04','14:00','10:00','Capacity Guest','capacity-change@example.test','+37120000203','Capacity',8,2.8,1.4,'confirmed',null,null,null),
  ('a3200000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000002','2031-09-01','2031-09-04','14:00','10:00','Tenant B','tenant-b-change@example.test','+37120000204','Tenant B',8,2.8,1.4,'confirmed',null,null,null);

set local role service_role;

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000001'),
  '2031-06-01','2031-06-04','16:30','09:30','Updated Guest','updated@example.test','+37120000999','Renamed',8,2.8,1.4,null
)),'updated','ETA ETD and operational customer/vessel names can change');
select is((select eta::text from public.bookings where id='a3200000-0000-4000-8000-000000000001'),'16:30:00','ETA change persists');
select is((select etd::text from public.bookings where id='a3200000-0000-4000-8000-000000000001'),'09:30:00','ETD change persists');
select is((select customer_email from public.bookings where id='a3200000-0000-4000-8000-000000000001'),'updated@example.test','customer contact change persists');
select is((select vessel_name from public.bookings where id='a3200000-0000-4000-8000-000000000001'),'Renamed','vessel name change persists');

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000001'),
  '2031-06-01','2031-06-06','16:30','09:30','Updated Guest','updated@example.test','+37120000999','Renamed',8,2.8,1.4,
  '{"version":1,"currency":"EUR","totalMinor":12500,"arrivalDate":"2031-06-01","departureDate":"2031-06-06","vesselLengthM":8}'::jsonb
)),'updated','date extension is revalidated and saved');
select is((select difference_from_paid_minor from public.booking_price_adjustments where booking_id='a3200000-0000-4000-8000-000000000001'),2500::bigint,'price increase records amount due from original payment');
select is((select price_total_minor from public.bookings where id='a3200000-0000-4000-8000-000000000001'),10000::bigint,'original paid total remains immutable');
select is((select price_snapshot->>'totalMinor' from public.bookings where id='a3200000-0000-4000-8000-000000000001'),'10000','original financial snapshot remains immutable');

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000001'),
  '2031-06-01','2031-06-03','16:30','09:30','Updated Guest','updated@example.test','+37120000999','Renamed',8,2.8,1.4,
  '{"version":1,"currency":"EUR","totalMinor":8000,"arrivalDate":"2031-06-01","departureDate":"2031-06-03","vesselLengthM":8}'::jsonb
)),'updated','date reduction is revalidated and saved');
select is((select difference_from_paid_minor from public.booking_price_adjustments where booking_id='a3200000-0000-4000-8000-000000000001' order by changed_at desc,id desc limit 1),(-2000)::bigint,'price decrease records refundable difference without changing payment');
select is((select count(*)::integer from public.booking_price_adjustments where booking_id='a3200000-0000-4000-8000-000000000001'),2,'every changed server price remains in history');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('a3200000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002')),'assigned','fixture receives a current berth');
reset role;
set local role service_role;

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000002'),
  '2031-07-01','2031-07-05','14:00','10:00','Assigned Guest','assigned-change@example.test','+37120000202','Assigned',8,2.8,1.4,null
)),'updated','safe date change preserves a valid current assignment');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='a3200000-0000-4000-8000-000000000002'),2,'assignment snapshot replacement preserves history');
select is((select ended_reason from public.booking_berth_assignments where booking_id='a3200000-0000-4000-8000-000000000002' and ended_at is not null),'booking_changed','prior assignment records why it ended');
select is((select departure_date::text from public.booking_berth_assignments where booking_id='a3200000-0000-4000-8000-000000000002' and ended_at is null),'2031-07-05','current assignment receives the revised stay snapshot');

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000002','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000002'),
  '2031-07-01','2031-07-05','14:00','10:00','Assigned Guest','assigned-change@example.test','+37120000202','Assigned',10,3.2,1.7,null
)),'assignment_invalid','vessel size increase that invalidates the current berth is rejected');
select is((select vessel_length_m from public.bookings where id='a3200000-0000-4000-8000-000000000002'),8::numeric,'rejected assignment change leaves vessel data untouched');

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000003'),
  '2031-08-01','2031-08-04','14:00','10:00','Capacity Guest','capacity-change@example.test','+37120000203','Capacity',27,7,4,null
)),'unavailable','vessel change with no suitable available capacity is rejected');
select is((select vessel_length_m from public.bookings where id='a3200000-0000-4000-8000-000000000003'),8::numeric,'availability rejection is atomic');

select is((select outcome from public.update_booking_details(
  'e1000000-0000-4000-8000-000000000002','a3200000-0000-4000-8000-000000000004','a1300000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a3200000-0000-4000-8000-000000000004'),
  '2031-09-01','2031-09-04','15:00','10:00','Tenant B','tenant-b-change@example.test','+37120000204','Tenant B',8,2.8,1.4,null
)),'unauthorized','another tenant actor cannot edit the booking');
select is((select eta::text from public.bookings where id='a3200000-0000-4000-8000-000000000004'),'14:00:00','tenant isolation leaves the target untouched');

select is((select outcome from public.update_booking_details(
  'd1000000-0000-4000-8000-000000000001','a3200000-0000-4000-8000-000000000003','a1300000-0000-4000-8000-000000000001',
  '2000-01-01T00:00:00Z','2031-08-01','2031-08-04','15:00','10:00','Capacity Guest','capacity-change@example.test','+37120000203','Capacity',8,2.8,1.4,null
)),'stale','stale forms cannot overwrite a newer booking version');

select throws_ok(
  $$update public.booking_price_adjustments set revised_price_total_minor=1$$,
  '23514','Booking price adjustment history is immutable.','financial history cannot be rewritten'
);

reset role;
select * from finish();
rollback;
