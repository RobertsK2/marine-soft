begin;
set local timezone = 'UTC';
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data) values
  ('a9300000-0000-4000-8000-000000000001','authenticated','authenticated','simple-admin@example.test','{}','{}'),
  ('a9300000-0000-4000-8000-000000000002','authenticated','authenticated','simple-staff@example.test','{}','{}'),
  ('a9300000-0000-4000-8000-000000000003','authenticated','authenticated','simple-other@example.test','{}','{}');
insert into public.organization_members(organization_id,user_id,role) values
  ('d0000000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000001','marina_admin'),
  ('d0000000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000002','marina_staff'),
  ('e0000000-0000-4000-8000-000000000002','a9300000-0000-4000-8000-000000000003','marina_admin');

create function pg_temp.create_manual(request_id uuid, total bigint, guest text default 'Simple booking')
returns table(outcome text, booking_id uuid) language sql as $$
  select * from public.create_manual_booking_with_balance(
    'd1000000-0000-4000-8000-000000000001','a9300000-0000-4000-8000-000000000002',request_id,
    jsonb_build_object('arrival_date','2088-06-12','departure_date','2088-06-14','eta','14:00','etd','10:00',
      'customer_name',guest,'customer_email','simple-guest@example.test','customer_phone','+37120000000',
      'vessel_length_m',8,'vessel_beam_m',2.8,'vessel_draft_m',1.4), total);
$$;

-- Fail after the booking insert to exercise rollback of the booking, audit, and outbox.
create function pg_temp.reject_test_balance() returns trigger language plpgsql as $$
begin
  if new.total_due_minor = 77777 then raise exception 'test balance write failed'; end if;
  return new;
end;
$$;
create trigger reject_test_balance before insert on public.booking_payment_balances
for each row execute function pg_temp.reject_test_balance();

select ok(not has_function_privilege('authenticated','public.create_manual_booking_with_balance(uuid,uuid,uuid,jsonb,bigint)','execute'), 'manual creation RPC is server-only');
select ok(not has_function_privilege('authenticated','public.initialize_manual_booking_balance(uuid,uuid,uuid,bigint)','execute'), 'legacy setup RPC is server-only');
select ok(not has_function_privilege('authenticated','public.update_booking_payment_settings(uuid,uuid,uuid,text,timestamp without time zone)','execute'), 'payment settings RPC is server-only');
select ok(not has_function_privilege('authenticated','public.set_booking_payment_state(uuid,uuid,uuid,booking_payment_state,booking_collection_method,text,bigint,bigint,timestamp with time zone,text,text)','execute'), 'the old RPC remains unavailable to signed-in clients');

set local role service_role;
select throws_ok($$select * from pg_temp.create_manual('a9400000-0000-4000-8000-000000000009',77777,'Rollback guest')$$,
  'P0001','test balance write failed','a failed balance insert aborts the creation RPC');
select is((select count(*) from public.bookings where customer_name='Rollback guest'),0::bigint,'failed creation leaves no booking row');
select is((select count(*) from public.audit_events where after_data->>'customer_name'='Rollback guest'),0::bigint,'failed creation leaves no booking audit event');
select is((select count(*) from public.notification_outbox where recipient_email='simple-guest@example.test'),0::bigint,'failed creation leaves no notification');
select is((select outcome from pg_temp.create_manual('a9400000-0000-4000-8000-000000000009',0)),'invalid_input','missing positive total cannot create an unpaid booking');

reset role;
create temp table simple_booking_result(outcome text, booking_id uuid);
grant select,insert on simple_booking_result to service_role;
set local role service_role;
insert into simple_booking_result select * from pg_temp.create_manual('a9400000-0000-4000-8000-000000000009',4576);
select is((select outcome from simple_booking_result),'created','the key can be retried after an aborted creation');
select is((select booking_id from pg_temp.create_manual('a9400000-0000-4000-8000-000000000009',4576)),
  (select booking_id from simple_booking_result),'identical retry returns the original booking');
select is((select outcome from pg_temp.create_manual('a9400000-0000-4000-8000-000000000009',5000)),
  'idempotency_conflict','a changed amount cannot reuse a committed key');
select is((select count(*) from public.bookings where customer_name='Simple booking'),1::bigint,'replays create one manual booking');
select results_eq(
  $$select currency, state::text, collection_method::text, total_due_minor, paid_minor, balance_due_minor
      from public.booking_payment_balances where booking_id=(select booking_id from simple_booking_result)$$,
  $$values ('EUR','balance_due','on_site',4576::bigint,0::bigint,4576::bigint)$$,'manual booking has exactly one unpaid EUR balance');
select is((select due_at from public.booking_payment_balances where booking_id=(select booking_id from simple_booking_result)),
  '2088-06-12 14:00'::timestamp at time zone 'Europe/Riga','default due date is arrival in the marina timezone');
select is((select booking_payment_id from public.bookings where id=(select booking_id from simple_booking_result)),null::uuid,'no Stripe payment attached');
select is((select count(*) from public.booking_offline_payments where booking_id=(select booking_id from simple_booking_result)),0::bigint,'initialization creates no offline receipt');
select is((select actor_id from public.audit_events where booking_id=(select booking_id from simple_booking_result) and event_type='booking.created'),
  'a9300000-0000-4000-8000-000000000002'::uuid,'booking audit retains the creating staff actor');

select is(public.update_booking_payment_settings('d1000000-0000-4000-8000-000000000001',(select booking_id from simple_booking_result),
  'a9300000-0000-4000-8000-000000000002','https://example.test/pay',null),'unauthorized','staff cannot set payment metadata');
select is(public.update_booking_payment_settings('e1000000-0000-4000-8000-000000000002',(select booking_id from simple_booking_result),
  'a9300000-0000-4000-8000-000000000003','https://example.test/pay',null),'not_found','another marina admin cannot change settings');
select is(public.update_booking_payment_settings('d1000000-0000-4000-8000-000000000001',(select booking_id from simple_booking_result),
  'a9300000-0000-4000-8000-000000000001','http://example.test/pay',null),'invalid_link','new payment links must use HTTPS');

select is((select outcome from public.record_booking_offline_payment('d1000000-0000-4000-8000-000000000001',
  (select booking_id from simple_booking_result),'a9300000-0000-4000-8000-000000000002','Simple staff',
  'a9400000-0000-4000-8000-000000000001','EUR',1976,'cash',null,0)),'recorded','staff can record a partial payment immediately');
select is(public.update_booking_payment_settings('d1000000-0000-4000-8000-000000000001',(select booking_id from simple_booking_result),
  'a9300000-0000-4000-8000-000000000001','https://example.test/pay','2088-06-13 14:00'),'updated','admin can update payment settings after a receipt');
select results_eq(
  $$select currency, state::text, collection_method::text, total_due_minor, paid_minor, balance_due_minor
      from public.booking_payment_balances where booking_id=(select booking_id from simple_booking_result)$$,
  $$values ('EUR','deposit_paid','on_site',4576::bigint,1976::bigint,2600::bigint)$$,'settings preserve financial amounts, method, currency and state');
select is((select count(*) from public.booking_offline_payments where booking_id=(select booking_id from simple_booking_result)
  and amount_minor=1976),1::bigint,'settings leave the original receipt intact');
select ok(exists(select 1 from public.notification_outbox where booking_id=(select booking_id from simple_booking_result)
  and event_type='payment_balance_reminder' and text_body like '%https://example.test/pay%'
  and text_body like '%2088-06-13 11:00:00%'),'balance reminder includes the saved link and custom due date');
select ok(exists(select 1 from public.audit_events where booking_id=(select booking_id from simple_booking_result)
  and event_type='payment.balance_changed' and actor_id='a9300000-0000-4000-8000-000000000001'
  and after_data->>'payment_link_url'='https://example.test/pay'),'settings changes retain admin attribution');
select is(public.initialize_manual_booking_balance('d1000000-0000-4000-8000-000000000001',(select booking_id from simple_booking_result),
  'a9300000-0000-4000-8000-000000000001',9999),'already_initialized','one-time setup cannot replace a receipted balance');
select is((select outcome from public.record_booking_offline_payment('d1000000-0000-4000-8000-000000000001',
  (select booking_id from simple_booking_result),'a9300000-0000-4000-8000-000000000002','Simple staff',
  'a9400000-0000-4000-8000-000000000002','EUR',2600,'cash',null,1976)),'recorded','staff can collect the remaining balance');
select is((select state::text from public.booking_payment_balances where booking_id=(select booking_id from simple_booking_result)),
  'paid_in_full','final payment derives the paid state');

reset role;
insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_length_m,vessel_beam_m,vessel_draft_m)
values('a9500000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
  '2088-06-16','2088-06-18','14:00','10:00','Legacy booking','legacy@example.test','+37120000000',8,2.8,1.4);
set local role service_role;
select is(public.initialize_manual_booking_balance('d1000000-0000-4000-8000-000000000001','a9500000-0000-4000-8000-000000000001',
  'a9300000-0000-4000-8000-000000000002',3000),'unauthorized','staff cannot initialize a legacy booking');
select is(public.initialize_manual_booking_balance('d1000000-0000-4000-8000-000000000001','a9500000-0000-4000-8000-000000000001',
  'a9300000-0000-4000-8000-000000000001',3000),'initialized','admin can initialize a legacy manual booking');
select is(public.initialize_manual_booking_balance('d1000000-0000-4000-8000-000000000001','a9500000-0000-4000-8000-000000000001',
  'a9300000-0000-4000-8000-000000000001',4000),'already_initialized','repeat setup cannot revise the total');
select is((select total_due_minor from public.booking_payment_balances where booking_id='a9500000-0000-4000-8000-000000000001'),
  3000::bigint,'legacy booking retains the original setup amount');
reset role;
set constraints all immediate;
select * from finish();
rollback;
