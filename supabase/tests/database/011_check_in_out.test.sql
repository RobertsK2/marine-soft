begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

select has_column('public','bookings','actual_check_in_at','bookings record actual check-in');
select has_column('public','bookings','actual_check_out_at','bookings record actual check-out');
select has_column('public','bookings','check_in_without_assignment','bookings record the missing-assignment exception');
select has_column('public','bookings','check_in_assignment_exception_by','bookings record who accepted the exception');
select has_function('public','transition_booking_stay',array['uuid','booking_status','boolean'],'operational transition RPC exists');
select ok((select relrowsecurity from pg_class where oid='public.bookings'::regclass),'booking RLS remains enabled');
select ok(not has_function_privilege('anon','public.transition_booking_stay(uuid,booking_status,boolean)','execute'),'anonymous clients cannot transition stays');
select ok(not has_column_privilege('authenticated','public.bookings','actual_check_in_at','update'),'authenticated clients cannot forge actual timestamps');

insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('00000000-0000-0000-0000-000000000000','91000000-0000-4000-8000-000000000001','authenticated','authenticated','operations-a@example.test','',now(),'{}','{}',now(),now()),
  ('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000001','authenticated','authenticated','operations-b@example.test','',now(),'{}','{}',now(),now());

insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','marina_admin');

insert into public.bookings (
  id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,
  vessel_length_m,vessel_beam_m,vessel_draft_m,status
) values
  ('9a200000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','2028-09-01','2028-09-04','14:00','10:00','Unassigned Arrival','arrival@example.test','+37120000101','Arrival',8,2.8,1.4,'confirmed'),
  ('9a200000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','2028-10-01','2028-10-04','14:00','10:00','Assigned Arrival','assigned@example.test','+37120000102','Assigned',9,3,1.5,'confirmed'),
  ('9a200000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','2028-11-01','2028-11-04','14:00','10:00','Direct Write','direct@example.test','+37120000103','Direct',8,2.8,1.4,'confirmed');

select throws_ok(
  $$insert into public.bookings (
      id,marina_id,arrival_date,departure_date,eta,etd,
      customer_name,customer_email,customer_phone,vessel_name,
      vessel_length_m,vessel_beam_m,vessel_draft_m,status,
      actual_check_in_at,check_in_without_assignment,check_in_assignment_exception_by
    ) values (
      '9a200000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',
      '2028-12-01','2028-12-04','14:00','10:00','Forged Insert','forged@example.test',
      '+37120000104','Forged',8,2.8,1.4,'confirmed',statement_timestamp(),true,
      '91000000-0000-4000-8000-000000000001'
    )$$,
  '23514',null,'new confirmed bookings cannot contain forged operational data'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000001','checked_in',false)),'assignment_required','normal check-in requires an assignment');
select is((select status::text from public.bookings where id='9a200000-0000-4000-8000-000000000001'),'confirmed','rejected check-in leaves the booking confirmed');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000001','checked_in',true)),'checked_in','staff can explicitly accept the missing-assignment exception');
select ok((select actual_check_in_at is not null from public.bookings where id='9a200000-0000-4000-8000-000000000001'),'exceptional check-in records a real timestamptz instant');
select ok((select check_in_without_assignment and check_in_assignment_exception_by='91000000-0000-4000-8000-000000000001' from public.bookings where id='9a200000-0000-4000-8000-000000000001'),'exception acknowledgement and actor are persisted');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000001','checked_in',true)),'invalid_transition','checked-in booking cannot be checked in twice');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000001','checked_out',false)),'checked_out','checked-in booking can check out');
select ok((select actual_check_out_at >= actual_check_in_at from public.bookings where id='9a200000-0000-4000-8000-000000000001'),'actual check-out follows actual check-in');
select is((select status::text from public.bookings where id='9a200000-0000-4000-8000-000000000001'),'checked_out','check-out status persists');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000001','checked_out',false)),'invalid_transition','checked-out booking cannot be checked out twice');

select throws_ok(
  $$update public.bookings set status='checked_in' where id='9a200000-0000-4000-8000-000000000003'$$,
  '23514',null,'direct status-only check-in is rejected'
);
reset role;
select throws_ok(
  $$update public.bookings
    set status='cancelled', actual_check_in_at=statement_timestamp(),
        check_in_without_assignment=true,
        check_in_assignment_exception_by='91000000-0000-4000-8000-000000000001'
    where id='9a200000-0000-4000-8000-000000000003'$$,
  '23514',null,'cancellation cannot smuggle operational metadata'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select results_eq(
  $$update public.bookings set status='cancelled' where id='9a200000-0000-4000-8000-000000000003' returning status::text$$,
  array['cancelled'::text],'confirmed cancellation behavior is preserved'
);

select is((select outcome from public.assign_booking_berth('9a200000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000002')),'assigned','confirmed booking receives a real berth');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000002','checked_in',false)),'checked_in','assigned booking checks in normally');
select ok((select not check_in_without_assignment and check_in_assignment_exception_by is null from public.bookings where id='9a200000-0000-4000-8000-000000000002'),'normal check-in records no exception');
select is((select count(*)::integer from public.booking_berth_assignments assignments join public.bookings bookings on bookings.id=assignments.booking_id where assignments.berth_id='d5000000-0000-4000-8000-000000000002' and assignments.ended_at is null and bookings.status='checked_in'),1,'real assigned checked-in booking makes the berth occupied');
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000002','checked_out',false)),'checked_out','assigned booking checks out normally');
select is((select count(*)::integer from public.booking_berth_assignments assignments join public.bookings bookings on bookings.id=assignments.booking_id where assignments.berth_id='d5000000-0000-4000-8000-000000000002' and assignments.ended_at is null and bookings.status='checked_in'),0,'checked-out berth is no longer occupied');

reset role;
select throws_ok(
  $$update public.bookings set check_in_without_assignment=true
    where id='9a200000-0000-4000-8000-000000000002'$$,
  '23514',null,'check-in assignment metadata remains immutable after check-out'
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select outcome from public.transition_booking_stay('9a200000-0000-4000-8000-000000000002','checked_out',false)),'not_found','another tenant cannot transition the booking');
select is((select count(*)::integer from public.bookings where id='9a200000-0000-4000-8000-000000000002'),0,'booking RLS still hides another tenant row');

reset role;
select * from finish();
rollback;
