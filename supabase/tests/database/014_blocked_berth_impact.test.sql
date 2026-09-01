begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

select has_function('public','preview_berth_block_impact',array['uuid','uuid','uuid','text'],'blocked berth impact preview exists');
select ok(not has_function_privilege('authenticated','public.preview_berth_block_impact(uuid,uuid,uuid,text)','execute'),'impact preview is not callable from browser roles');

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  ('00000000-0000-0000-0000-000000000000','b1500000-0000-4000-8000-000000000001','authenticated','authenticated','impact-admin@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','b2500000-0000-4000-8000-000000000002','authenticated','authenticated','impact-other@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','b1500000-0000-4000-8000-000000000001','marina_admin'),
  ('e0000000-0000-4000-8000-000000000002','b2500000-0000-4000-8000-000000000002','marina_admin');

insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status) values
  ('b4100000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2033-05-01','2033-05-03','14:00','10:00','Affected One','affected-one@example.test','+37122000001','One',9,3,1.5,'confirmed'),
  ('b4100000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','2033-05-03','2033-05-05','14:00','10:00','Affected Two','affected-two@example.test','+37122000002','Two',9,3,1.5,'confirmed'),
  ('b4100000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','2033-05-01','2033-05-03','14:00','10:00','Alternative Blocker','alternative@example.test','+37122000003','Blocker',8.5,2.9,1.5,'confirmed'),
  ('b4100000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','2033-06-01','2033-06-03','14:00','10:00','No Alternative','none@example.test','+37122000004','Large',19,5.8,3.1,'confirmed'),
  ('b4100000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000002','2033-05-01','2033-05-03','14:00','10:00','Other Tenant','other@example.test','+37122000005','Other',9,3,1.5,'confirmed');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"b1500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.assign_booking_berth('b4100000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007')),'assigned','first booking is assigned to A-03');
select is((select outcome from public.assign_booking_berth('b4100000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000007')),'assigned','second booking is assigned to A-03');
select is((select outcome from public.transition_booking_stay('b4100000-0000-4000-8000-000000000002','checked_in',false)),'checked_in','second affected booking can be operationally checked in');
select is((select outcome from public.assign_booking_berth('b4100000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000002')),'assigned','A-02 blocks one possible alternative');
select is((select outcome from public.assign_booking_berth('b4100000-0000-4000-8000-000000000004','d5000000-0000-4000-8000-000000000009')),'assigned','large booking is assigned to C-03');
reset role;
set local role service_role;

select is((select outcome from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),'conflicts','blocking A-03 reports conflicts');
select is((select affected_count from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),2,'both current and upcoming assignments are listed');
select ok((select affected_bookings @> '[{"bookingId":"b4100000-0000-4000-8000-000000000001"}]'::jsonb from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),'first affected booking is surfaced');
select ok((select affected_bookings @> '[{"bookingId":"b4100000-0000-4000-8000-000000000002"}]'::jsonb from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','out_of_service')),'out-of-service status uses the same impact detection');
select ok((select affected_bookings @> '[{"bookingId":"b4100000-0000-4000-8000-000000000001","berthOptions":[{"berthId":"d5000000-0000-4000-8000-000000000003"}]}]'::jsonb from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),'only a capacity-safe unoccupied alternative is suggested');
select ok(not (select affected_bookings @> '[{"bookingId":"b4100000-0000-4000-8000-000000000001","berthOptions":[{"berthId":"d5000000-0000-4000-8000-000000000002"}]}]'::jsonb from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),'occupied alternatives are excluded');
select is((select jsonb_array_length((affected_bookings->0)->'berthOptions') from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000009','b1500000-0000-4000-8000-000000000001','blocked')),0,'a vessel with no valid alternative is unresolved');
select is((select outcome from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','b1500000-0000-4000-8000-000000000001','blocked')),'safe','an unassigned berth has no affected bookings');
select is((select status::text from public.berths where id='d5000000-0000-4000-8000-000000000007'),'available','read-only preview does not change berth status');
select is((select count(*)::integer from public.booking_berth_assignments where berth_id='d5000000-0000-4000-8000-000000000007' and ended_at is null),2,'read-only preview does not reassign bookings');

select is((select outcome from public.preview_berth_block_impact('e1000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','b1500000-0000-4000-8000-000000000001','blocked')),'unauthorized','another tenant cannot preview impact');
select is((select outcome from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','b1500000-0000-4000-8000-000000000001','blocked')),'not_found','cross-tenant berth is not exposed');
select is((select outcome from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','available')),'safe','returning a berth to available is always safe');
select is((select affected_count from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','blocked')),2,'preview remains deterministic across calls');
select is((select outcome from public.preview_berth_block_impact('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000007','b1500000-0000-4000-8000-000000000001','invalid')),'invalid_status','invalid status is rejected');

reset role;
select * from finish();
rollback;
