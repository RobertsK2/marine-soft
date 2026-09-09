-- Existing marinas retain their Stripe-only behavior.
alter table public.marinas
  add column accepts_online_payment boolean not null default true,
  add column accepts_pay_at_marina boolean not null default false,
  add constraint marinas_booking_payment_methods_check check (accepts_online_payment or accepts_pay_at_marina);
grant select (accepts_online_payment, accepts_pay_at_marina) on public.marinas to anon;
grant update (accepts_online_payment, accepts_pay_at_marina) on public.marinas to authenticated;

-- Consuming inventory does not imply that money has been received.
alter table public.booking_holds drop constraint booking_holds_release_state_check;
alter table public.booking_holds add constraint booking_holds_release_state_check check (
  (status in ('active','expired') and released_at is null and release_reason is null and consumed_at is null)
  or (status='released' and released_at is not null and consumed_at is null
    and release_reason in ('checkout_session_creation_failed','checkout_session_expired','payment_failed'))
  or (status='consumed' and released_at is null and release_reason is null and consumed_at is not null)
);

alter table public.bookings drop constraint bookings_online_snapshot_complete_check;
alter table public.bookings add constraint bookings_online_snapshot_complete_check check (
  source <> 'online' or (
    booking_hold_id is not null and price_currency is not null and price_total_minor is not null and price_snapshot is not null
    and customer_snapshot is not null and jsonb_typeof(customer_snapshot)='object'
    and customer_snapshot ?& array['version','name','email','phone','source']
    and (customer_snapshot->>'version')::integer=1
    and ((booking_payment_id is not null and customer_snapshot->>'source'='stripe_checkout')
      or (booking_payment_id is null and customer_snapshot->>'source'='public_pay_at_marina'))
    and vessel_snapshot is not null and jsonb_typeof(vessel_snapshot)='object'
    and vessel_snapshot ?& array['version','name','lengthM','beamM','draftM']
    and (vessel_snapshot->>'version')::integer=1
  )
);

create function public.confirm_pay_at_marina_booking(
  target_marina_id uuid, request_idempotency_key uuid,
  requested_arrival date, requested_departure date, requested_eta time, requested_etd time,
  requested_vessel_name text, requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  calculated_price_currency text, calculated_price_total_minor bigint, calculated_price_snapshot jsonb,
  request_session_hash text, request_network_hash text,
  requested_customer_name text, requested_customer_email text, requested_customer_phone text
) returns table(outcome text, booking_id uuid)
language plpgsql volatile security invoker set search_path='' as $$
declare
  held record;
  target_hold public.booking_holds%rowtype;
  existing_booking public.bookings%rowtype;
  new_booking_id uuid;
  marina_record public.marinas%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text,0));
  select * into marina_record from public.marinas where id=target_marina_id for share;
  if not found or not marina_record.is_public then
    return query select 'not_found',null::uuid; return;
  end if;
  if not marina_record.accepts_pay_at_marina then
    return query select 'method_disabled',null::uuid; return;
  end if;
  if requested_customer_name is null or char_length(btrim(requested_customer_name)) not between 1 and 160
    or requested_customer_email is null or char_length(requested_customer_email)>254
    or requested_customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or requested_customer_phone is null or char_length(btrim(requested_customer_phone)) not between 5 and 40 then
    return query select 'invalid_customer',null::uuid; return;
  end if;
  if calculated_price_total_minor is null or calculated_price_total_minor<=0 then
    return query select 'pricing_unavailable',null::uuid; return;
  end if;
  -- All hold validation, quotas, HMAC ownership and bounded capacity checks
  -- remain in the existing service-role-only RPC. The entire conversion is atomic.
  select * into held from public.create_booking_hold(target_marina_id,request_idempotency_key,
    requested_arrival,requested_departure,requested_eta,requested_etd,requested_vessel_name,
    requested_length_m,requested_beam_m,requested_draft_m,calculated_price_currency,
    calculated_price_total_minor,calculated_price_snapshot,request_session_hash,request_network_hash);
  if held.outcome not in ('created','existing','closed') then
    return query select held.outcome,null::uuid; return;
  end if;
  -- 'closed' is returned only after the existing RPC verifies requester and all stay/vessel details.
  select * into target_hold from public.booking_holds
    where marina_id=target_marina_id and idempotency_key=request_idempotency_key for update;
  select * into existing_booking from public.bookings where booking_hold_id=target_hold.id;
  if found then
    if existing_booking.customer_snapshot->>'source'='public_pay_at_marina'
      and existing_booking.customer_snapshot->>'name'=btrim(requested_customer_name)
      and existing_booking.customer_snapshot->>'email'=lower(btrim(requested_customer_email))
      and existing_booking.customer_snapshot->>'phone'=btrim(requested_customer_phone) then
      return query select 'existing',existing_booking.id;
    else return query select 'idempotency_conflict',null::uuid;
    end if;
    return;
  end if;
  if held.outcome='closed' or target_hold.status<>'active' or target_hold.expires_at<=statement_timestamp()
    or exists(select 1 from public.booking_payments where hold_id=target_hold.id) then
    return query select 'closed',null::uuid; return;
  end if;
  -- Under the marina lock, replace this demand with its confirmed booking.
  -- Recheck the real solver after removing only our own hold from its demands.
  update public.booking_holds set status='consumed',consumed_at=statement_timestamp() where id=target_hold.id;
  if not private.capacity_is_available(target_marina_id,requested_arrival,requested_departure,
    requested_length_m,requested_beam_m,requested_draft_m) then
    update public.booking_holds set status='active',consumed_at=null where id=target_hold.id;
    return query select 'unavailable',null::uuid; return;
  end if;
  insert into public.bookings(marina_id,arrival_date,departure_date,eta,etd,
    customer_name,customer_email,customer_phone,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
    status,source,price_currency,price_total_minor,price_snapshot,booking_hold_id,customer_snapshot,vessel_snapshot)
  values(target_marina_id,target_hold.arrival_date,target_hold.departure_date,target_hold.eta,target_hold.etd,
    btrim(requested_customer_name),lower(btrim(requested_customer_email)),btrim(requested_customer_phone),
    target_hold.vessel_name,target_hold.vessel_length_m,target_hold.vessel_beam_m,target_hold.vessel_draft_m,
    'confirmed','online',target_hold.price_currency,target_hold.price_total_minor,target_hold.price_snapshot,target_hold.id,
    jsonb_build_object('version',1,'name',btrim(requested_customer_name),'email',lower(btrim(requested_customer_email)),
      'phone',btrim(requested_customer_phone),'source','public_pay_at_marina'),
    jsonb_build_object('version',1,'name',target_hold.vessel_name,'lengthM',target_hold.vessel_length_m,
      'beamM',target_hold.vessel_beam_m,'draftM',target_hold.vessel_draft_m)) returning id into new_booking_id;
  insert into public.booking_payment_balances(marina_id,booking_id,state,collection_method,currency,
    total_due_minor,paid_minor,balance_due_minor,due_at)
  values(target_marina_id,new_booking_id,
    'balance_due',
    'on_site',target_hold.price_currency,target_hold.price_total_minor,0,target_hold.price_total_minor,
    (target_hold.arrival_date+target_hold.eta) at time zone marina_record.timezone);
  return query select 'confirmed',new_booking_id;
end $$;
revoke all on function public.confirm_pay_at_marina_booking(uuid,uuid,date,date,time,time,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.confirm_pay_at_marina_booking(uuid,uuid,date,date,time,time,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text) to service_role;

create or replace function public.prepare_booking_checkout(target_hold_token uuid)
returns table (
  outcome text, payment_id uuid, hold_id uuid, marina_id uuid, marina_slug text,
  marina_name text, stripe_account_id text, amount_total_minor bigint,
  currency text, price_snapshot jsonb, hold_expires_at timestamptz,
  existing_checkout_session_id text
)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  target_hold public.booking_holds%rowtype;
  target_marina public.marinas%rowtype;
  target_payment public.booking_payments%rowtype;
begin
  select * into target_hold from public.booking_holds where public_token = target_hold_token;
  if found then perform pg_advisory_xact_lock(hashtextextended(target_hold.marina_id::text,0)); end if;
  select * into target_hold from public.booking_holds where public_token = target_hold_token for update;
  if not found then return query select 'not_found', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_hold.marina_id::text, 0));
  if target_hold.status = 'active' and target_hold.expires_at <= statement_timestamp() then
    update public.booking_holds set status = 'expired' where id = target_hold.id;
    return query select 'expired', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  if target_hold.status <> 'active' then
    return query select 'closed', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  select * into target_marina from public.marinas where id = target_hold.marina_id for share;
  if target_marina.stripe_account_id is null or not target_marina.accepts_online_payment or not target_marina.is_public then
    return query select 'not_configured', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  insert into public.booking_payments (hold_id, marina_id, stripe_account_id, amount_total_minor, currency, price_snapshot)
  values (target_hold.id, target_hold.marina_id, target_marina.stripe_account_id, target_hold.price_total_minor, target_hold.price_currency, target_hold.price_snapshot)
  on conflict on constraint booking_payments_hold_id_key do nothing;
  select payments.* into target_payment from public.booking_payments payments where payments.hold_id = target_hold.id;
  if target_payment.status <> 'pending' then
    return query select 'closed', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  return query select 'ready', target_payment.id, target_hold.id, target_hold.marina_id,
    target_marina.slug, target_marina.name, target_payment.stripe_account_id,
    target_payment.amount_total_minor, target_payment.currency, target_payment.price_snapshot,
    target_hold.expires_at, target_payment.stripe_checkout_session_id;
end $$;


create or replace function public.ensure_guest_booking_access(
  target_booking_id uuid,
  requested_ttl interval default interval '30 days'
)
returns table (grant_id uuid, expires_at timestamptz)
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if requested_ttl < interval '1 hour' or requested_ttl > interval '90 days' then
    raise exception 'Guest access duration must be between 1 hour and 90 days.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_booking_id::text, 0));

  if not exists (
    select 1
    from public.bookings bookings
    left join public.booking_payments payments on payments.id = bookings.booking_payment_id
    where bookings.id = target_booking_id
      and bookings.source = 'online'
      and (payments.status = 'paid' or (bookings.booking_payment_id is null and bookings.customer_snapshot->>'source'='public_pay_at_marina'))
  ) then
    return;
  end if;

  update public.guest_booking_access_grants grants
  set revoked_at = statement_timestamp()
  where grants.booking_id = target_booking_id
    and grants.revoked_at is null
    and grants.expires_at <= statement_timestamp();

  return query
  select grants.id, grants.expires_at
  from public.guest_booking_access_grants grants
  where grants.booking_id = target_booking_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp();

  if found then return; end if;

  return query
  insert into public.guest_booking_access_grants (booking_id, expires_at)
  values (target_booking_id, statement_timestamp() + requested_ttl)
  returning id, guest_booking_access_grants.expires_at;
end $$;


drop function public.get_guest_booking(uuid);
create function public.get_guest_booking(target_grant_id uuid)
returns table (
  booking_reference text,
  marina_name text,
  arrival_date date,
  departure_date date,
  eta time without time zone,
  etd time without time zone,
  vessel_name text,
  vessel_length_m numeric,
  vessel_beam_m numeric,
  vessel_draft_m numeric,
  price_total_minor bigint,
  price_currency text,
  booking_status public.booking_status,
  access_expires_at timestamptz,
  balance_due_minor bigint,
  collection_method public.booking_collection_method
)
language sql stable security invoker set search_path = '' as $$
  select
    bookings.reference,
    marinas.name,
    bookings.arrival_date,
    bookings.departure_date,
    bookings.eta,
    bookings.etd,
    bookings.vessel_name,
    bookings.vessel_length_m,
    bookings.vessel_beam_m,
    bookings.vessel_draft_m,
    bookings.price_total_minor,
    bookings.price_currency,
    bookings.status,
    grants.expires_at,
    coalesce(balances.balance_due_minor,case when bookings.booking_payment_id is not null then 0 else bookings.price_total_minor end),
    coalesce(balances.collection_method,case when bookings.booking_payment_id is not null then 'berthio'::public.booking_collection_method else 'on_site'::public.booking_collection_method end)
  from public.guest_booking_access_grants grants
  join public.bookings bookings on bookings.id = grants.booking_id
  left join public.booking_payment_balances balances on balances.booking_id=bookings.id and balances.marina_id=bookings.marina_id
  join public.marinas marinas on marinas.id = bookings.marina_id
  where grants.id = target_grant_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp();
$$;


revoke all on function public.get_guest_booking(uuid) from public,anon,authenticated;
grant execute on function public.get_guest_booking(uuid) to service_role;

create or replace function private.queue_operational_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  marina_name text;
  booking_reference text;
  berth_code text;
  currency_label text;
begin
  if tg_table_name = 'bookings' then
    select marinas.name into marina_name from public.marinas marinas where marinas.id = new.marina_id;
    perform private.enqueue_booking_notification(
      new.id, 'booking_confirmation', 'booking-confirmation:' || new.id,
      'Booking ' || new.reference || ' confirmed at ' || marina_name,
      'Hello ' || new.customer_name || E',\n\nYour booking ' || new.reference || ' at ' || marina_name
        || ' is confirmed for ' || new.arrival_date || ' to ' || new.departure_date || E'.'
        || case when new.customer_snapshot->>'source'='public_pay_at_marina' then E'\nPayment due at the marina: '
          || to_char(new.price_total_minor::numeric/100,'FM999999999990.00') || ' ' || new.price_currency || '. No payment has been collected.' else '' end
        || E'\n\nBerthio'
    );
  elsif tg_table_name = 'booking_cancellation_events' then
    select bookings.reference, marinas.name into booking_reference, marina_name
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    where bookings.id = new.booking_id;
    perform private.enqueue_booking_notification(
      new.booking_id, 'cancellation_confirmation', 'cancellation:' || new.id,
      'Booking ' || booking_reference || ' cancelled',
      'Your booking ' || booking_reference || ' at ' || marina_name || ' has been cancelled.'
        || case when new.refund_recommendation_minor is null then '' else E'\nRefund recommendation: '
          || new.refund_recommendation_minor || ' ' || coalesce(new.currency, '') || ' minor units. Any refund is handled separately.' end
    );
  elsif tg_table_name = 'booking_berth_assignments' then
    if new.assignment_kind <> 'planned_move' and not exists (
      select 1 from public.booking_berth_assignments prior
      where prior.booking_id = new.booking_id and prior.id <> new.id and prior.ended_reason = 'reassigned'
    ) then return new; end if;
    select bookings.reference, marinas.name, berths.code into booking_reference, marina_name, berth_code
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    join public.berths berths on berths.id = new.berth_id where bookings.id = new.booking_id;
    perform private.enqueue_booking_notification(
      new.booking_id, 'berth_move_confirmation', 'berth-move:' || new.id,
      'Berth update for booking ' || booking_reference,
      'Your berth for booking ' || booking_reference || ' at ' || marina_name || ' is confirmed as '
        || berth_code || ' from ' || new.arrival_date || ' to ' || new.departure_date || '.'
    );
  elsif tg_table_name = 'booking_payment_balances' then
    if new.balance_due_minor <= 0 then return new; end if;
    if tg_op = 'UPDATE' and old.state = new.state and old.balance_due_minor = new.balance_due_minor
      and old.due_at is not distinct from new.due_at and old.payment_link_url is not distinct from new.payment_link_url then
      return new;
    end if;
    select bookings.reference, marinas.name into booking_reference, marina_name
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    where bookings.id = new.booking_id;
    currency_label := coalesce(new.currency, 'currency');
    perform private.enqueue_booking_notification(
      new.booking_id, 'payment_balance_reminder',
      'payment-balance:' || new.id || ':' || extract(epoch from new.updated_at)::bigint,
      'Payment balance for booking ' || booking_reference,
      'A balance of ' || new.balance_due_minor || ' ' || currency_label || ' minor units is due for booking '
        || booking_reference || ' at ' || marina_name || '.'
        || case when new.due_at is null then '' else E'\nDue: ' || new.due_at end
        || case when new.payment_link_url is null then '' else E'\nPayment link: ' || new.payment_link_url end
        || case when new.collection_method = 'on_site' then E'\nPayment will be collected on site.' else '' end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.queue_operational_notification()
from public, anon, authenticated, service_role;

