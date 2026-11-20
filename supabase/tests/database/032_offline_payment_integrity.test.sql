begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Snapshot protected pre-existing pilot cancellation/audit history. No updates
-- or fictitious receipt backfills are needed for legacy cumulative balances.
create temporary table protected_cancellation_history as
select coalesce(jsonb_agg(to_jsonb(e) order by id), '[]'::jsonb) snapshot
from public.booking_cancellation_events e;
create temporary table protected_audit_ids as select id from public.audit_events;
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('d1700000-0000-4000-8000-000000000001','authenticated','authenticated','integrity-admin@example.test','',now(),'{}','{}',now(),now());
insert into public.organization_members(organization_id,user_id,role)
values ('d0000000-0000-4000-8000-000000000001','d1700000-0000-4000-8000-000000000001','marina_admin');
insert into public.bookings(id,marina_id,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status)
select ('f4300000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'd1000000-0000-4000-8000-000000000001',current_date+5,current_date+7,'14:00','10:00',
  'Manual balance ' || n,'manual-balance@example.test','+37124000000','Manual',8,2.8,1.4,'confirmed'
from generate_series(1,5) n;
-- A real existing price snapshot can disagree with the denomination used by
-- legacy payment administration. Refund money must use the payment balance;
-- the original price evidence itself must not be rewritten.
update public.bookings set price_currency='USD',price_total_minor=90000,
 price_snapshot='{"version":1,"currency":"USD","totalMinor":90000}'::jsonb
where id='f4300000-0000-4000-8000-000000000003';
insert into public.booking_payment_balances(marina_id,booking_id,state,collection_method,currency,total_due_minor,paid_minor,balance_due_minor)
select marina_id,id,case when id::text like '%0004' then 'paid_in_full'::public.booking_payment_state else 'deposit_paid'::public.booking_payment_state end,
  case when id::text like '%0003' then 'payment_link'::public.booking_collection_method else 'on_site'::public.booking_collection_method end,
  'EUR',10000,case when id::text like '%0004' then 10000 else 2500 end,
  case when id::text like '%0004' then 0 else 7500 end
from public.bookings where id::text like 'f4300000%';

create function pg_temp.edit_offline(booking_number integer, paid bigint, method public.booking_collection_method, currency text default 'EUR') returns text
language sql as $$
select outcome from public.set_booking_payment_state('d1000000-0000-4000-8000-000000000001',
 ('f4300000-0000-4000-8000-' || lpad(booking_number::text,12,'0'))::uuid,
 'd1700000-0000-4000-8000-000000000001',case when paid=10000 then 'paid_in_full'::public.booking_payment_state else 'deposit_paid'::public.booking_payment_state end,
 method,currency,10000,paid,null,null,'Legacy administration');
$$;
create function pg_temp.preview_offline(booking_number integer) returns table(outcome text, paid bigint, currency text, refund bigint)
language sql as $$
select p.outcome,p.paid_total_minor,p.currency,p.refund_recommendation_minor
from public.bookings b cross join lateral public.preview_booking_cancellation(b.marina_id,b.id,
 'd1700000-0000-4000-8000-000000000001',b.updated_at) p
where b.id=('f4300000-0000-4000-8000-' || lpad(booking_number::text,12,'0'))::uuid;
$$;
create function pg_temp.cancel_offline(booking_number integer) returns text
language sql as $$
select p.outcome from public.bookings b cross join lateral public.audited_confirm_booking_cancellation(b.marina_id,b.id,
 'd1700000-0000-4000-8000-000000000001',b.updated_at,'Manual financial integrity test') p
where b.id=('f4300000-0000-4000-8000-' || lpad(booking_number::text,12,'0'))::uuid;
$$;

set local role service_role;
select is((select paid from pg_temp.preview_offline(1)),2500::bigint,'manual preview uses actual legacy paid amount');
select is((select currency from pg_temp.preview_offline(1)),'EUR','manual preview uses balance currency despite null booking currency');
select is((select refund from pg_temp.preview_offline(1)),1250::bigint,'partial refund calculated from legacy paid, not total');
select is(pg_temp.cancel_offline(1),'cancelled','manual booking without a price snapshot can be cancelled');
select ok((select price_snapshot is null and payment_balance_snapshot @> '{"paid_minor":2500,"currency":"EUR","total_due_minor":10000,"balance_due_minor":7500}'::jsonb
 from public.booking_cancellation_events where booking_id='f4300000-0000-4000-8000-000000000001'),'preserves missing price snapshot and stores real cancellation-time balance');
select is((select count(*)::integer from public.booking_offline_payments where booking_id='f4300000-0000-4000-8000-000000000001'),0,'no receipts fabricated for legacy paid amounts');

-- Two sequential method changes are allowed as administrative metadata edits,
-- but neither can unlock cumulative paid amounts or change their denomination.
select is(pg_temp.edit_offline(2,2500,'payment_link'),'updated','legacy method may change without rewriting paid');
select is(pg_temp.edit_offline(2,4000,'payment_link'),'history_locked','switching away from on-site cannot unlock paid amount');
select is(pg_temp.edit_offline(2,2500,'outside_berthio'),'updated','second metadata-only method change');
select is(pg_temp.edit_offline(2,5000,'on_site'),'history_locked','switching back cannot rewrite cumulative paid');
select is(pg_temp.edit_offline(2,2500,'outside_berthio','USD'),'history_locked','method switch cannot reinterpret recorded paid currency');
select is((select paid from pg_temp.preview_offline(2)),2500::bigint,'cancellation remains based on legacy paid after method switches');
select is((select refund from pg_temp.preview_offline(2)),1250::bigint,'method switches cannot inflate refund recommendation');
select is(pg_temp.cancel_offline(2),'cancelled','method-switched manual booking still cancels safely');
select is(pg_temp.edit_offline(3,3500,'on_site'),'history_locked','legacy balance starting on another method is also protected');
select is((select paid_minor from public.booking_payment_balances where booking_id='f4300000-0000-4000-8000-000000000003'),2500::bigint,'failed changes leave legacy cumulative paid untouched');
select is((select currency from pg_temp.preview_offline(3)),'EUR','balance currency wins over a differing historic price currency');
select is((select refund from pg_temp.preview_offline(3)),1250::bigint,'legacy non-site method never falls back to the larger historic price');
select is((select refund from pg_temp.preview_offline(4)),5000::bigint,'fully paid manual booking uses full actual paid amount');
select is(pg_temp.cancel_offline(4),'cancelled','fully paid manual booking without price snapshot cancels');

select is((select outcome from public.record_booking_offline_payment('d1000000-0000-4000-8000-000000000001',
 'f4300000-0000-4000-8000-000000000005','d1700000-0000-4000-8000-000000000001','Verified admin',
 '10000000-0000-4000-8000-000000000105','EUR',1000,'cash',null,2500)),'recorded','new partial receipt adds to legacy opening paid');
select is(pg_temp.edit_offline(5,3500,'payment_link'),'history_locked','receipted booking cannot switch collection identity');
select is(pg_temp.edit_offline(5,4500,'on_site'),'history_locked','receipted booking cannot rewrite paid');
select is((select refund from pg_temp.preview_offline(5)),1750::bigint,'refund includes legacy opening amount plus new receipt exactly once');
select is(pg_temp.cancel_offline(5),'cancelled','manual booking with new receipt and missing price snapshot cancels');
select is((select paid_total_minor from public.booking_cancellation_events where booking_id='f4300000-0000-4000-8000-000000000005'),3500::bigint,'cancellation history preserves actual paid with receipt');
select is((select count(*)::integer from public.booking_offline_payments where booking_id='f4300000-0000-4000-8000-000000000005'),1,'cancellation and rejected edits leave receipt history intact');

reset role;
select is((select coalesce(jsonb_agg(to_jsonb(e) order by id),'[]'::jsonb) from public.booking_cancellation_events e where booking_id::text not like 'f4300000%'),
 (select snapshot from protected_cancellation_history),'protected pre-existing cancellation history is unchanged');
select is((select count(*) from protected_audit_ids p left join public.audit_events a on a.id=p.id where a.id is null),0::bigint,'pre-existing audit history is retained');
select throws_ok($$update public.booking_cancellation_events set paid_total_minor=1 where booking_id='f4300000-0000-4000-8000-000000000001'$$,
 '23514','Booking cancellation history is immutable.','new balance-backed cancellation history is immutable');
select throws_ok($$insert into public.booking_cancellation_events(marina_id,booking_id,cancelled_by,reason,policy_code,refund_percent,refund_recommendation_minor,currency,paid_total_minor,payment_balance_snapshot)
 values('d1000000-0000-4000-8000-000000000001','f4300000-0000-4000-8000-000000000003','d1700000-0000-4000-8000-000000000001','Invalid evidence','test',50,1250,'EUR',2500,'{}')$$,
 '23514',null,'empty financial evidence cannot replace a missing price snapshot');
select throws_ok($$insert into public.booking_cancellation_events(marina_id,booking_id,cancelled_by,reason,policy_code,refund_percent,refund_recommendation_minor,currency,paid_total_minor,payment_balance_snapshot)
 values('d1000000-0000-4000-8000-000000000001','f4300000-0000-4000-8000-000000000003','d1700000-0000-4000-8000-000000000001','Invalid evidence','test',50,1250,'USD',2500,
 '{"booking_id":"f4300000-0000-4000-8000-000000000003","marina_id":"d1000000-0000-4000-8000-000000000001","paid_minor":2500,"currency":"EUR"}')$$,
 '23514',null,'snapshot denomination must agree with cancellation currency');
select * from finish();
rollback;
