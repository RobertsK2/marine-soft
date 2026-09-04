-- Reusable deterministic Marina A pilot scenario. All business identifiers,
-- dates, snapshots, and berth choices are stable across local resets. This file
-- deliberately uses only existing product tables and workflows.

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  phone_change,phone_change_token,email_change_token_current,
  reauthentication_token,email_change_confirm_status,is_sso_user,is_anonymous,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
values ('00000000-0000-0000-0000-000000000000','df000000-0000-4000-8000-000000000001','authenticated','authenticated','pilot-operator@example.test','',
  '2028-01-01T09:00:00Z','','','','','','','',
  '',0,false,false,'{}','{}','2028-01-01T09:00:00Z','2028-01-01T09:00:00Z')
on conflict (id) do nothing;
insert into public.organization_members(id,organization_id,user_id,role,status,created_at)
values ('df100000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','df000000-0000-4000-8000-000000000001','marina_admin','active','2028-01-01T09:05:00Z')
on conflict (organization_id,user_id) do nothing;

insert into public.pricing_seasons(id,marina_id,name,starts_on,ends_on)
values ('d6000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','Pilot season','2028-01-01','2029-01-01')
on conflict (id) do nothing;
insert into public.pricing_season_meter_rates(season_id,marina_id,nightly_rate_per_meter_minor)
values ('d6000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001',300)
on conflict (season_id) do nothing;

with scenarios(id,reference,arrival_date,departure_date,eta,etd,customer_name,customer_email,customer_phone,vessel_name,
  vessel_length_m,vessel_beam_m,vessel_draft_m,status,accommodation_minor,fees_minor,subtotal_minor,tax_minor,total_minor,created_at) as (values
  ('da000000-0000-4000-8000-000000000001'::uuid,'BK-PILOT00001','2028-05-18'::date,'2028-05-21'::date,'14:00'::time,'10:00'::time,'Anna Kalniņa','anna.pilot@example.test','+37120001001','Ziemeļvējš',8.40::numeric,2.70::numeric,1.30::numeric,'confirmed'::public.booking_status,7560::bigint,1339::bigint,8899::bigint,1869::bigint,10768::bigint,'2028-01-15T10:00:00Z'::timestamptz),
  ('da000000-0000-4000-8000-000000000002','BK-PILOT00002','2028-05-19','2028-05-23','16:30','09:00','Mikael Saar','mikael.pilot@example.test','+37250001002','Merikotkas',12.50,3.85,2.05,'confirmed',15000,1675,16675,3502,20177,'2028-01-16T11:00:00Z'),
  ('da000000-0000-4000-8000-000000000003','BK-PILOT00003','2028-06-02','2028-06-09','13:00','11:00','Elena Rossi','elena.pilot@example.test','+39020001003','Azzurra',15.50,4.70,2.65,'confirmed',32550,2564,35114,7374,42488,'2028-01-17T12:00:00Z'),
  ('da000000-0000-4000-8000-000000000004','BK-PILOT00004','2028-04-10','2028-04-12','15:00','10:00','Lars Jensen','lars.pilot@example.test','+4520001004','Freja',9.20,3.00,1.55,'cancelled',5520,1138,6658,1398,8056,'2028-01-18T13:00:00Z'),
  ('da000000-0000-4000-8000-000000000005','BK-PILOT00005','2028-07-10','2028-07-12','12:00','09:00','Sofia Martin','sofia.pilot@example.test','+33620001005','Horizon',30.00,8.00,4.50,'confirmed',18000,1450,19450,4085,23535,'2028-01-19T13:00:00Z')
)
insert into public.bookings (
  id, reference, marina_id, arrival_date, departure_date, eta, etd,
  customer_name, customer_email, customer_phone, vessel_name,
  vessel_length_m, vessel_beam_m, vessel_draft_m, status, source,
  price_currency, price_total_minor, price_snapshot, created_at, updated_at
)
select id,reference,'d1000000-0000-4000-8000-000000000001',arrival_date,departure_date,eta,etd,
  customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,status,'manual',
  'EUR',total_minor,jsonb_build_object(
    'version',1,'currency','EUR','pricingModel','per_meter','taxBehavior','exclusive','taxRateBps',2100,
    'arrivalDate',arrival_date,'departureDate',departure_date,'vesselLengthM',vessel_length_m,
    'nights',(select jsonb_agg(jsonb_build_object('date',day::date,'season','Pilot season','rateMinor',300,'rateUnit','meter_night','amountMinor',round(vessel_length_m*300)) order by day)
      from generate_series(arrival_date,departure_date-1,interval '1 day') day),
    'mandatoryFees',jsonb_build_array(
      jsonb_build_object('name','Harbour administration','type','per_booking','quantity',1,'unitAmountMinor',500,'percentageBps',null,'amountMinor',500),
      jsonb_build_object('name','Environmental fee','type','per_night','quantity',departure_date-arrival_date,'unitAmountMinor',150,'percentageBps',null,'amountMinor',(departure_date-arrival_date)*150),
      jsonb_build_object('name','Vessel registration','type','per_vessel','quantity',1,'unitAmountMinor',200,'percentageBps',null,'amountMinor',200),
      jsonb_build_object('name','Infrastructure levy','type','percentage','quantity',1,'unitAmountMinor',null,'percentageBps',250,'amountMinor',round(accommodation_minor*0.025))
    ),'accommodationMinor',accommodation_minor,'mandatoryFeesMinor',fees_minor,'subtotalMinor',subtotal_minor,
    'taxMinor',tax_minor,'totalMinor',total_minor
  ),created_at,created_at
from scenarios
on conflict (id) do nothing;

insert into public.booking_payment_balances(
  id,marina_id,booking_id,state,collection_method,currency,total_due_minor,paid_minor,
  balance_due_minor,due_at,note,updated_at,updated_by
) values (
  'dd000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
  'da000000-0000-4000-8000-000000000002','deposit_paid','on_site','EUR',20177,5000,15177,
  '2028-05-10T09:00:00Z','Pilot balance due on arrival','2028-01-20T09:00:00Z','df000000-0000-4000-8000-000000000001'
) on conflict (booking_id) do nothing;

insert into public.booking_cancellation_events(
  id,marina_id,booking_id,cancelled_at,cancelled_by,reason,policy_code,refund_percent,
  refund_recommendation_minor,currency,paid_total_minor,price_snapshot
)
select 'dc000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',id,
  '2028-01-18T13:05:00Z','df000000-0000-4000-8000-000000000001','Pilot customer changed itinerary',
  'full_refund_7_days',100,price_total_minor,price_currency,price_total_minor,price_snapshot
from public.bookings where id='da000000-0000-4000-8000-000000000004'
on conflict (booking_id) do nothing;

-- Keep all deterministic pilot notifications as delivered history, never live
-- worker work, including the cancellation confirmation inserted above.
update public.notification_outbox
set status='sent',sent_at='2028-01-20T10:00:00Z',provider_message_id='pilot-seed-'||id::text,
  next_attempt_at='2028-01-20T10:00:00Z',updated_at='2028-01-20T10:00:00Z'
where booking_id::text like 'da000000-%';

insert into public.booking_berth_assignments (
  id, marina_id, booking_id, berth_id, arrival_date, departure_date,
  assigned_at, assignment_kind
)
values
  ('db000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000002','d5000000-0000-4000-8000-000000000005','2028-05-19','2028-05-23','2028-01-16T11:05:00Z','stay'),
  ('db000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','da000000-0000-4000-8000-000000000003','d5000000-0000-4000-8000-000000000008','2028-06-02','2028-06-09','2028-01-17T12:05:00Z','stay')
on conflict (id) do nothing;

update public.bookings
set status='checked_in',actual_check_in_at='2028-05-18T14:05:00Z',
  check_in_without_assignment=true,check_in_assignment_exception_by='df000000-0000-4000-8000-000000000001'
where id='da000000-0000-4000-8000-000000000001' and status='confirmed';
