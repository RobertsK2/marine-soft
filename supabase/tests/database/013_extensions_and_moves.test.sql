begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_column('public', 'booking_berth_assignments', 'assignment_kind', 'assignment segments record stay or planned move');
select has_function('public', 'preview_booking_extension', array['uuid','uuid','uuid','timestamp with time zone','date'], 'extension preview RPC exists');
select has_function('public', 'confirm_booking_extension', array['uuid','uuid','uuid','timestamp with time zone','date','uuid','jsonb'], 'extension confirmation RPC exists');
select ok(not has_function_privilege('authenticated', 'public.preview_booking_extension(uuid,uuid,uuid,timestamp with time zone,date)', 'execute'), 'browser clients cannot forge actor identity in extension previews');
select ok(not has_function_privilege('authenticated', 'public.confirm_booking_extension(uuid,uuid,uuid,timestamp with time zone,date,uuid,jsonb)', 'execute'), 'browser clients cannot bypass server repricing during confirmation');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','a1400000-0000-4000-8000-000000000001','authenticated','authenticated','extension-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','a2400000-0000-4000-8000-000000000002','authenticated','authenticated','extension-b@example.test','',now(),'{}','{}',now(),now());

insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','a2400000-0000-4000-8000-000000000002','marina_admin');

insert into public.bookings (
  id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,
  vessel_length_m,vessel_beam_m,vessel_draft_m,status,
  price_currency,price_total_minor,price_snapshot
) values
  ('a4100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2032-01-01','2032-01-03','14:00','10:00','Same Berth','same@example.test','+37121000001','Same',8,2.8,1.4,'confirmed',null,null,null),
  ('a4100000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','2032-02-01','2032-02-03','14:00','10:00','Move Required','move@example.test','+37121000002','Move',8.5,2.9,1.5,'confirmed',null,null,null),
  ('a4100000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','2032-02-03','2032-02-06','14:00','10:00','A02 Blocker','blocker@example.test','+37121000003','Blocker',8.5,2.9,1.5,'confirmed',null,null,null),
  ('a4100000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','2032-03-01','2032-03-03','14:00','10:00','Impossible','impossible@example.test','+37121000004','Large',19,5.8,3.1,'confirmed',null,null,null),
  ('a4100000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','2032-03-03','2032-03-07','14:00','10:00','C03 Blocker','c03@example.test','+37121000005','Large Blocker',19,5.8,3.1,'confirmed',null,null,null),
  ('a4100000-0000-4000-8000-000000000006','d1000000-0000-4000-8000-000000000001','2032-04-01','2032-04-03','14:00','10:00','Priced','priced@example.test','+37121000006','Priced',8,2.8,1.4,'confirmed','EUR',10000,
    '{"version":1,"currency":"EUR","totalMinor":10000,"arrivalDate":"2032-04-01","departureDate":"2032-04-03","vesselLengthM":8}'::jsonb),
  ('a4100000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000002','2032-05-01','2032-05-03','14:00','10:00','Tenant B','tenant-b@example.test','+37121000007','Tenant B',8,2.8,1.4,'confirmed',null,null,null);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a1400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('a4100000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001')),'assigned','same-berth fixture is assigned');
select is((select outcome from public.assign_booking_berth('a4100000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002')),'assigned','move fixture starts at A-02');
select is((select outcome from public.assign_booking_berth('a4100000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000002')),'assigned','A-02 extension interval is occupied by another booking');
select is((select outcome from public.assign_booking_berth('a4100000-0000-4000-8000-000000000004','d5000000-0000-4000-8000-000000000009')),'assigned','impossible fixture starts at C-03');
select is((select outcome from public.assign_booking_berth('a4100000-0000-4000-8000-000000000005','d5000000-0000-4000-8000-000000000009')),'assigned','C-03 extension interval is occupied by another booking');
reset role;
set local role service_role;

select is((select outcome from public.preview_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000001'),'2032-01-05'
)),'same_berth','same berth extension is identified before confirmation');

select is((select outcome from public.confirm_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000001'),'2032-01-05',null,null
)),'extended_same_berth','same berth extension confirms atomically');
select is((select departure_date::text from public.bookings where id='a4100000-0000-4000-8000-000000000001'),'2032-01-05','same berth extension updates booking departure');
select is((select departure_date::text from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000001' and ended_at is null),'2032-01-05','same berth assignment covers the extended stay');
select is((select ended_reason from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000001' and ended_at is not null),'booking_extended','prior assignment snapshot remains in history');

select is((select outcome from public.preview_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000002'),'2032-02-05'
)),'move_required','a conflicting current berth produces an explicit move requirement');
select ok((select berth_options @> '[{"berthId":"d5000000-0000-4000-8000-000000000003"}]'::jsonb from public.preview_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000002'),'2032-02-05'
)),'a capacity-safe alternative is shown');
select is((select outcome from public.confirm_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000002'),'2032-02-05','d5000000-0000-4000-8000-000000000001',null
)),'move_invalid','an incompatible or conflicting move selection is rejected at confirmation');
select is((select departure_date::text from public.bookings where id='a4100000-0000-4000-8000-000000000002'),'2032-02-03','rejected move leaves the booking unchanged');

select is((select outcome from public.confirm_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000002','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000002'),'2032-02-05','d5000000-0000-4000-8000-000000000003',null
)),'extended_with_move','staff can confirm the shown berth move');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000002' and ended_at is null),2,'move extension creates exactly two non-overlapping active segments');
select is((select assignment_kind from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000002' and ended_at is null order by arrival_date desc limit 1),'planned_move','the future segment is explicitly marked as a planned move');
select is((select berth_id::text from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000002' and assignment_kind='planned_move' and ended_at is null),'d5000000-0000-4000-8000-000000000003','planned move points to the staff-confirmed berth');
select is((select count(*)::integer from public.booking_berth_assignments where booking_id='a4100000-0000-4000-8000-000000000002'),3,'move confirmation preserves the original assignment snapshot');

select is((select outcome from public.preview_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000004','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000004'),'2032-03-05'
)),'impossible','an extension with no capacity-safe berth is rejected');

select is((select outcome from public.confirm_booking_extension(
  'd1000000-0000-4000-8000-000000000001','a4100000-0000-4000-8000-000000000006','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000006'),'2032-04-05',null,
  '{"version":1,"currency":"EUR","totalMinor":13000,"arrivalDate":"2032-04-01","departureDate":"2032-04-05","vesselLengthM":8}'::jsonb
)),'extended_unassigned','priced capacity-based booking can be extended after preview rules pass');
select is((select difference_from_paid_minor from public.booking_price_adjustments where booking_id='a4100000-0000-4000-8000-000000000006'),3000::bigint,'extension price increase is recorded as amount due');
select is((select price_total_minor from public.bookings where id='a4100000-0000-4000-8000-000000000006'),10000::bigint,'extension does not rewrite the original paid total');

select is((select outcome from public.preview_booking_extension(
  'e1000000-0000-4000-8000-000000000002','a4100000-0000-4000-8000-000000000007','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000007'),'2032-05-05'
)),'unauthorized','another tenant actor cannot preview an extension');
select is((select outcome from public.confirm_booking_extension(
  'e1000000-0000-4000-8000-000000000002','a4100000-0000-4000-8000-000000000007','a1400000-0000-4000-8000-000000000001',
  (select updated_at from public.bookings where id='a4100000-0000-4000-8000-000000000007'),'2032-05-05',null,null
)),'unauthorized','another tenant actor cannot confirm an extension');
select is((select departure_date::text from public.bookings where id='a4100000-0000-4000-8000-000000000007'),'2032-05-03','tenant isolation leaves the target booking unchanged');

reset role;
select * from finish();
rollback;
