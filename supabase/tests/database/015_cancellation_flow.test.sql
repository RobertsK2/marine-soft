begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

select has_table('public','booking_cancellation_events','cancellation decision history exists');
select has_function('public','preview_booking_cancellation',array['uuid','uuid','uuid','timestamp with time zone'],'cancellation preview RPC exists');
select has_function('public','confirm_booking_cancellation',array['uuid','uuid','uuid','timestamp with time zone','text'],'cancellation confirmation RPC exists');
select ok(not has_function_privilege('authenticated','public.confirm_booking_cancellation(uuid,uuid,uuid,timestamp with time zone,text)','execute'),'browser clients cannot execute cancellation confirmation');
select ok(not has_table_privilege('authenticated','public.booking_cancellation_events','insert'),'staff cannot forge cancellation history');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','c1500000-0000-4000-8000-000000000001','authenticated','authenticated','cancel-admin@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','c2500000-0000-4000-8000-000000000002','authenticated','authenticated','cancel-other@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','c2500000-0000-4000-8000-000000000002','marina_admin');

insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status,price_currency,price_total_minor,price_snapshot) values
  ('c4100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 13,'14:00','10:00','Full Refund','full@example.test','+37123000001','Full',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('c4100000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001',current_date + 5,current_date + 8,'14:00','10:00','Partial Refund','partial@example.test','+37123000002','Partial',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('c4100000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001',current_date + 1,current_date + 4,'14:00','10:00','No Refund','none@example.test','+37123000003','None',8,2.8,1.4,'confirmed','EUR',10000,'{"version":1,"currency":"EUR","totalMinor":10000}'::jsonb),
  ('c4100000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Already Cancelled','already@example.test','+37123000004','Already',8,2.8,1.4,'cancelled',null,null,null),
  ('c4100000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001',current_date + 10,current_date + 12,'14:00','10:00','Checked Out','out@example.test','+37123000005','Out',8,2.8,1.4,'confirmed',null,null,null),
  ('c4100000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000002',current_date + 10,current_date + 12,'14:00','10:00','Other Tenant','other@example.test','+37123000006','Other',8,2.8,1.4,'confirmed',null,null,null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"c1500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('c4100000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')),'assigned','full-refund booking gets an assignment');
select is((select outcome from public.assign_booking_berth('c4100000-0000-4000-8000-000000000005','d5000000-0000-4000-8000-000000000002')),'assigned','checked-out fixture gets an assignment');
select is((select outcome from public.transition_booking_stay('c4100000-0000-4000-8000-000000000005','checked_in',false)),'checked_in','fixture checks in');
select is((select outcome from public.transition_booking_stay('c4100000-0000-4000-8000-000000000005','checked_out',false)),'checked_out','fixture checks out');
reset role;
set local role service_role;

select is((select outcome from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000001'))),'ready','normal cancellation preview is ready');
select is((select policy_code from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000001'))),'full_refund_7_days','seven-day policy recommends full refund');
select is((select refund_recommendation_minor from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000001'))),10000::bigint,'full refund recommendation equals paid total');
select is((select refund_percent from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000002','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000002'))),50::smallint,'two-to-six-day policy recommends half refund');
select is((select refund_percent from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000003','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000003'))),0::smallint,'under-two-day policy recommends no refund');
select is((select outcome from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000004','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000004'))),'already_cancelled','already-cancelled booking is not reprocessed');
select is((select outcome from public.preview_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000005','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000005'))),'not_cancellable','checked-out booking cannot be cancelled');
select is((select outcome from public.confirm_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000001'),'Customer requested cancellation')),'cancelled','staff confirmation cancels booking atomically');
select is((select status::text from public.bookings where id='c4100000-0000-4000-8000-000000000001'),'cancelled','booking status is cancelled');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='c4100000-0000-4000-8000-000000000001' and ended_at is null),0,'future berth capacity is released');
select is((select ended_reason from public.booking_berth_assignments where booking_id='c4100000-0000-4000-8000-000000000001'),'cancelled','assignment history records cancellation');
select is((select refund_recommendation_minor from public.booking_cancellation_events where booking_id='c4100000-0000-4000-8000-000000000001'),10000::bigint,'cancellation history preserves refund recommendation');
select is((select price_total_minor from public.bookings where id='c4100000-0000-4000-8000-000000000001'),10000::bigint,'payment snapshot remains unchanged');
select is((select count(*)::integer from public.booking_cancellation_events where booking_id='c4100000-0000-4000-8000-000000000001'),1,'one immutable cancellation event is recorded');
select is((select outcome from public.confirm_booking_cancellation('d1000000-0000-4000-8000-000000000001','c4100000-0000-4000-8000-000000000001','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000001'),'Duplicate')),'already_cancelled','duplicate confirmation does not mutate history');
select is((select outcome from public.preview_booking_cancellation('e1000000-0000-4000-8000-000000000002','c4100000-0000-4000-8000-000000000006','c1500000-0000-4000-8000-000000000001',(select updated_at from public.bookings where id='c4100000-0000-4000-8000-000000000006'))),'unauthorized','cross-tenant cancellation preview is denied');
select is((select status::text from public.bookings where id='c4100000-0000-4000-8000-000000000006'),'confirmed','cross-tenant booking remains unchanged');
select throws_ok($$update public.booking_cancellation_events set reason='forged'$$,'23514','Booking cancellation history is immutable.','cancellation history cannot be rewritten');

reset role;
select * from finish();
rollback;
