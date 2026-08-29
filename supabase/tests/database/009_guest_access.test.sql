begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

select has_table('public','guest_booking_access_grants','guest access grants exist');
select ok((select relrowsecurity from pg_class where oid='public.guest_booking_access_grants'::regclass),'guest grants enforce RLS');
select ok(not has_table_privilege('anon','public.guest_booking_access_grants','select'),'anonymous clients cannot read grants');
select ok(not has_function_privilege('anon','public.get_guest_booking(uuid)','execute'),'anonymous clients cannot call guest reads directly');
select ok(not has_function_privilege('authenticated','public.update_guest_booking_times(uuid,time without time zone,time without time zone)','execute'),'authenticated clients cannot bypass signed-link validation');

create temporary table guest_hold_one as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',
  '2027-03-01','2027-03-04','14:00','10:00','Guest One',12,3.7,2.1,'EUR',12000,
  '{"version":1,"currency":"EUR","totalMinor":12000,"arrivalDate":"2027-03-01","departureDate":"2027-03-04","vesselLengthM":12}'::jsonb
);
create temporary table guest_payment_one as select * from public.prepare_booking_checkout((select hold_token from guest_hold_one));
select ok(public.attach_booking_checkout_session((select payment_id from guest_payment_one),'cs_test_guest_one'),'first guest checkout attaches');
select is(public.process_stripe_checkout_event(
  'evt_guest_one','checkout.session.completed','acct_testmarinaa','cs_test_guest_one','pi_guest_one','paid',12000,'eur',(select hold_token from guest_hold_one),
  'Guest One','guest-one@example.test','+37120000001'
),'confirmed','first guest booking confirms');

create temporary table guest_hold_two as select * from public.create_booking_hold(
  'd1000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',
  '2027-03-10','2027-03-12','15:00','09:00','Guest Two',11,3.5,2,'EUR',8000,
  '{"version":1,"currency":"EUR","totalMinor":8000,"arrivalDate":"2027-03-10","departureDate":"2027-03-12","vesselLengthM":11}'::jsonb
);
create temporary table guest_payment_two as select * from public.prepare_booking_checkout((select hold_token from guest_hold_two));
select ok(public.attach_booking_checkout_session((select payment_id from guest_payment_two),'cs_test_guest_two'),'second guest checkout attaches');
select is(public.process_stripe_checkout_event(
  'evt_guest_two','checkout.session.completed','acct_testmarinaa','cs_test_guest_two','pi_guest_two','paid',8000,'eur',(select hold_token from guest_hold_two),
  'Guest Two','guest-two@example.test','+37120000002'
),'confirmed','second guest booking confirms');

create temporary table guest_grant_one as select * from public.ensure_guest_booking_access(
  (select id from public.bookings where booking_payment_id=(select payment_id from guest_payment_one))
);
create temporary table guest_grant_one_again as select * from public.ensure_guest_booking_access(
  (select id from public.bookings where booking_payment_id=(select payment_id from guest_payment_one))
);
create temporary table guest_grant_two as select * from public.ensure_guest_booking_access(
  (select id from public.bookings where booking_payment_id=(select payment_id from guest_payment_two))
);

select is((select grant_id from guest_grant_one_again),(select grant_id from guest_grant_one),'link issuance reuses the active grant');
select is((select count(*)::integer from public.get_guest_booking((select grant_id from guest_grant_one))),1,'active grant opens one booking');
select is((select booking_reference from public.get_guest_booking((select grant_id from guest_grant_one))),
  (select reference from public.bookings where booking_payment_id=(select payment_id from guest_payment_one)),
  'first grant resolves only its booking');
select isnt((select booking_reference from public.get_guest_booking((select grant_id from guest_grant_one))),
  (select booking_reference from public.get_guest_booking((select grant_id from guest_grant_two))),
  'different grants remain isolated');
select is((select price_total_minor from public.get_guest_booking((select grant_id from guest_grant_one))),12000::bigint,'guest view exposes the paid summary');

select ok(public.update_guest_booking_times((select grant_id from guest_grant_one),'16:15','08:45'),'confirmed guest can update ETA and ETD');
select is((select eta::text from public.bookings where booking_payment_id=(select payment_id from guest_payment_one)),'16:15:00','ETA update is stored');
select is((select etd::text from public.bookings where booking_payment_id=(select payment_id from guest_payment_one)),'08:45:00','ETD update is stored');
select is((select customer_email from public.bookings where booking_payment_id=(select payment_id from guest_payment_one)),'guest-one@example.test','guest update does not alter customer data');

update public.bookings set status='checked_in' where booking_payment_id=(select payment_id from guest_payment_one);
select ok(not public.update_guest_booking_times((select grant_id from guest_grant_one),'17:00','09:00'),'checked-in booking is read-only to guests');

create temporary table rotated_grant as select * from public.rotate_guest_booking_access(
  (select id from public.bookings where booking_payment_id=(select payment_id from guest_payment_one))
);
select isnt((select grant_id from rotated_grant),(select grant_id from guest_grant_one),'rotation creates a new random grant');
select is((select count(*)::integer from public.get_guest_booking((select grant_id from guest_grant_one))),0,'rotation revokes the prior grant immediately');
select is((select count(*)::integer from public.get_guest_booking((select grant_id from rotated_grant))),1,'rotated grant remains usable');
select ok(public.revoke_guest_booking_access((select grant_id from rotated_grant)),'active grant can be revoked');
select is((select count(*)::integer from public.get_guest_booking((select grant_id from rotated_grant))),0,'revoked grant cannot view a booking');

update public.guest_booking_access_grants
set issued_at=statement_timestamp()-interval '2 hours', expires_at=statement_timestamp()-interval '1 second'
where id=(select grant_id from guest_grant_two);
select is((select count(*)::integer from public.get_guest_booking((select grant_id from guest_grant_two))),0,'expired grant cannot view a booking');
select ok(not public.update_guest_booking_times((select grant_id from guest_grant_two),'17:00','09:00'),'expired grant cannot edit a booking');

select * from finish();
rollback;
