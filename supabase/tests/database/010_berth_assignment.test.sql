begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

select has_table('public','booking_berth_assignments','assignment history table exists');
select ok((select relrowsecurity from pg_class where oid='public.booking_berth_assignments'::regclass),'assignment history enforces RLS');
select ok(not has_table_privilege('anon','public.booking_berth_assignments','select'),'anonymous users cannot read assignments');
select ok(not has_function_privilege('anon','public.assign_booking_berth(uuid,uuid)','execute'),'anonymous users cannot assign berths');
select ok(not has_table_privilege('authenticated','public.booking_berth_assignments','insert'),'authenticated clients cannot bypass assignment validation');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000001','authenticated','authenticated','assignment-admin-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','81000000-0000-4000-8000-000000000002','authenticated','authenticated','assignment-staff-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','82000000-0000-4000-8000-000000000001','authenticated','authenticated','assignment-admin-b@example.test','',now(),'{}','{}',now(),now());

insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000001','marina_admin'),
  ('d0000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','marina_admin');

insert into public.bookings (
  id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,
  vessel_length_m,vessel_beam_m,vessel_draft_m,status
) values
  ('8a200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2028-06-01','2028-06-05','14:00','10:00','Assignment One','one@example.test','+37120000001','One',9,3,1.5,'confirmed'),
  ('8a200000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','2028-06-03','2028-06-06','14:00','10:00','Assignment Two','two@example.test','+37120000002','Two',8.5,2.9,1.5,'confirmed'),
  ('8a200000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','2028-06-05','2028-06-08','14:00','10:00','Back to Back','three@example.test','+37120000003','Three',9,3,1.5,'confirmed'),
  ('8a200000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','2028-07-01','2028-07-03','14:00','10:00','Staff Assignment','four@example.test','+37120000004','Four',10,3.2,1.7,'confirmed'),
  ('8a200000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','2028-08-01','2028-08-03','14:00','10:00','Cancelled Assignment','five@example.test','+37120000005','Five',9,3,1.5,'cancelled');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002')),'assigned','a suitable operational berth can be assigned');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='8a200000-0000-4000-8000-000000000001' and ended_at is null),1,'booking has one active assignment');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')),'incompatible','an undersized berth is rejected');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000006')),'berth_unavailable','a blocked berth is rejected');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000011')),'berth_unavailable','an out-of-service berth is rejected');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002')),'conflict','an overlapping assignment is rejected');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000003')),'reassigned','a booking can be reassigned safely');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='8a200000-0000-4000-8000-000000000001'),2,'reassignment preserves both history rows');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='8a200000-0000-4000-8000-000000000001' and ended_at is null),1,'reassignment leaves exactly one active row');
select is((select ended_reason from public.booking_berth_assignments where booking_id='8a200000-0000-4000-8000-000000000001' and ended_at is not null),'reassigned','prior assignment records the reassignment reason');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002')),'assigned','the prior berth is free after atomic reassignment');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000003')),'existing','assigning the current berth is idempotent');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002')),'berth_not_found','a cross-tenant berth id cannot be forced');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000005','d5000000-0000-4000-8000-000000000003')),'booking_not_assignable','a cancelled booking cannot be assigned');
select throws_ok(
  $$insert into public.booking_berth_assignments(marina_id,booking_id,berth_id,arrival_date,departure_date)
    values('d1000000-0000-4000-8000-000000000001','8a200000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000004','2028-06-05','2028-06-08')$$,
  '42501',null,'direct assignment insertion is denied');
select throws_ok(
  $$update public.bookings set vessel_length_m=9.5 where id='8a200000-0000-4000-8000-000000000001'$$,
  '23514','An assigned booking stay or vessel cannot change before reassignment support is implemented.','active assignment snapshot cannot be invalidated');
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000003')),'assigned','back-to-back stays do not conflict');

select set_config('request.jwt.claims','{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000004','d5000000-0000-4000-8000-000000000004')),'assigned','marina staff can assign a suitable berth');

select set_config('request.jwt.claims','{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('8a200000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002')),'not_found','another tenant cannot assign the booking');
select is((select count(*)::integer from public.booking_berth_assignments where marina_id='d1000000-0000-4000-8000-000000000001'),0,'another tenant cannot read assignment history');

reset role;
select * from finish();
rollback;
