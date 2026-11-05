-- Public guests may provide a date and an arrival window without claiming an exact
-- local arrival/departure time. Marina-managed exact times remain available.
alter table public.booking_holds
  alter column eta drop not null,
  alter column etd drop not null,
  add column eta_window text
    constraint booking_holds_eta_window_check check (eta_window in ('morning','afternoon','evening'));
alter table public.bookings
  alter column eta drop not null,
  alter column etd drop not null,
  add column eta_window text
    constraint bookings_eta_window_check check (eta_window in ('morning','afternoon','evening')),
  add constraint bookings_manual_times_present_check
    check (source <> 'manual' or (eta is not null and etd is not null));

comment on column public.booking_holds.eta_window is
  'Optional marina-local arrival preference; NULL means not specified. This is not an exact ETA.';
comment on column public.bookings.eta_window is
  'Optional marina-local arrival preference copied from the hold; NULL means not specified.';

-- The paid webhook and the pay-at-marina RPC already copy exact times from the
-- hold. This trigger carries the separate window without changing payment logic.
create function private.copy_booking_eta_window()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.booking_hold_id is not null then
    new.eta_window := (select holds.eta_window
      from public.booking_holds holds where holds.id = new.booking_hold_id);
  end if;
  return new;
end $$;
revoke all on function private.copy_booking_eta_window() from public,anon,authenticated;
create trigger bookings_copy_eta_window
before insert on public.bookings for each row execute function private.copy_booking_eta_window();

create or replace function private.booking_hold_snapshot_is_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.marina_id is distinct from old.marina_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.requester_session_hash is distinct from old.requester_session_hash
    or new.requester_network_hash is distinct from old.requester_network_hash
    or new.arrival_date is distinct from old.arrival_date
    or new.departure_date is distinct from old.departure_date
    or new.eta is distinct from old.eta or new.etd is distinct from old.etd
    or new.eta_window is distinct from old.eta_window
    or new.vessel_name is distinct from old.vessel_name
    or new.vessel_length_m is distinct from old.vessel_length_m
    or new.vessel_beam_m is distinct from old.vessel_beam_m
    or new.vessel_draft_m is distinct from old.vessel_draft_m
    or new.expires_at is distinct from old.expires_at
    or new.price_currency is distinct from old.price_currency
    or new.price_total_minor is distinct from old.price_total_minor
    or new.price_snapshot is distinct from old.price_snapshot
    or new.created_at is distinct from old.created_at then
    raise exception 'Booking hold request, expiry, and price snapshot are immutable.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Keep the original RPC signatures for in-flight requests. The new overloads
-- include the window in the locked, idempotent hold identity.
create function public.create_booking_hold(
  target_marina_id uuid, request_idempotency_key uuid,
  requested_arrival date, requested_departure date,
  requested_eta time without time zone, requested_etd time without time zone,
  requested_vessel_name text, requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  calculated_price_currency text, calculated_price_total_minor bigint, calculated_price_snapshot jsonb,
  request_session_hash text, request_network_hash text, requested_eta_window text
) returns table (outcome text,hold_token uuid,hold_expires_at timestamptz,total_minor bigint,currency text)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  existing_hold public.booking_holds%rowtype;
  inserted_hold public.booking_holds%rowtype;
  operation_time timestamptz := statement_timestamp();
begin
  if requested_eta_window is not null and requested_eta_window not in ('morning','afternoon','evening') then
    raise exception 'Invalid arrival window.' using errcode='22023';
  end if;
  if request_session_hash !~ '^[0-9a-f]{64}$' or request_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid anonymous requester fingerprint.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text,0));
  update public.booking_holds set status='expired'
    where marina_id=target_marina_id and status='active' and expires_at<=operation_time;

  select * into existing_hold from public.booking_holds
    where marina_id=target_marina_id and idempotency_key=request_idempotency_key;
  if found then
    if existing_hold.requester_session_hash is distinct from request_session_hash
      or existing_hold.arrival_date is distinct from requested_arrival or existing_hold.departure_date is distinct from requested_departure
      or existing_hold.eta is distinct from requested_eta or existing_hold.etd is distinct from requested_etd
      or existing_hold.eta_window is distinct from requested_eta_window
      or existing_hold.vessel_name is distinct from requested_vessel_name
      or existing_hold.vessel_length_m is distinct from requested_length_m or existing_hold.vessel_beam_m is distinct from requested_beam_m
      or existing_hold.vessel_draft_m is distinct from requested_draft_m then
      return query select 'idempotency_conflict',null::uuid,null::timestamptz,null::bigint,null::text;
    elsif existing_hold.status='active' and existing_hold.expires_at>operation_time then
      return query select 'existing',existing_hold.public_token,existing_hold.expires_at,existing_hold.price_total_minor,existing_hold.price_currency;
    else return query select 'closed',null::uuid,null::timestamptz,null::bigint,null::text;
    end if;
    return;
  end if;

  if not exists(select 1 from public.marinas where id=target_marina_id and is_public) then
    return query select 'not_found',null::uuid,null::timestamptz,null::bigint,null::text; return;
  end if;
  if jsonb_typeof(calculated_price_snapshot)<>'object'
    or (calculated_price_snapshot->>'version')::integer<>1
    or calculated_price_snapshot->>'currency'<>calculated_price_currency
    or (calculated_price_snapshot->>'totalMinor')::bigint<>calculated_price_total_minor
    or calculated_price_snapshot->>'arrivalDate'<>requested_arrival::text
    or calculated_price_snapshot->>'departureDate'<>requested_departure::text
    or (calculated_price_snapshot->>'vesselLengthM')::numeric<>requested_length_m then
    raise exception 'The server price snapshot does not match the hold request.' using errcode='22023';
  end if;

  if (select count(*) from public.booking_holds where marina_id=target_marina_id
      and requester_session_hash=request_session_hash and created_at>operation_time-interval '1 hour')>=5
    or (select count(*) from public.booking_holds where marina_id=target_marina_id
      and requester_network_hash=request_network_hash and created_at>operation_time-interval '1 hour')>=30
    or (select count(*) from public.booking_holds where marina_id=target_marina_id
      and requester_session_hash=request_session_hash and status='active' and expires_at>operation_time)>=2
    or (select count(*) from public.booking_holds where marina_id=target_marina_id
      and requester_network_hash=request_network_hash and status='active' and expires_at>operation_time)>=4 then
    return query select 'rate_limited',null::uuid,null::timestamptz,null::bigint,null::text; return;
  end if;

  if not private.capacity_is_available(target_marina_id,requested_arrival,requested_departure,
    requested_length_m,requested_beam_m,requested_draft_m) then
    return query select 'unavailable',null::uuid,null::timestamptz,null::bigint,null::text; return;
  end if;

  insert into public.booking_holds(marina_id,idempotency_key,requester_session_hash,requester_network_hash,
    arrival_date,departure_date,eta,etd,eta_window,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
    expires_at,price_currency,price_total_minor,price_snapshot,created_at)
  values(target_marina_id,request_idempotency_key,request_session_hash,request_network_hash,
    requested_arrival,requested_departure,requested_eta,requested_etd,requested_eta_window,requested_vessel_name,
    requested_length_m,requested_beam_m,requested_draft_m,operation_time+interval '15 minutes',
    calculated_price_currency,calculated_price_total_minor,calculated_price_snapshot,operation_time)
  returning * into inserted_hold;
  return query select 'created',inserted_hold.public_token,inserted_hold.expires_at,inserted_hold.price_total_minor,inserted_hold.price_currency;
end;
$$;

revoke all on function public.create_booking_hold(
  uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text
) from public,anon,authenticated;
grant execute on function public.create_booking_hold(
  uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text
) to service_role;

create function public.confirm_pay_at_marina_booking(
  target_marina_id uuid, request_idempotency_key uuid,
  requested_arrival date, requested_departure date, requested_eta time, requested_etd time,
  requested_vessel_name text, requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  calculated_price_currency text, calculated_price_total_minor bigint, calculated_price_snapshot jsonb,
  request_session_hash text, request_network_hash text,
  requested_customer_name text, requested_customer_email text, requested_customer_phone text,
  requested_eta_window text
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
    calculated_price_total_minor,calculated_price_snapshot,request_session_hash,request_network_hash,requested_eta_window);
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
revoke all on function public.confirm_pay_at_marina_booking(
  uuid,uuid,date,date,time,time,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text,text
) from public,anon,authenticated;
grant execute on function public.confirm_pay_at_marina_booking(
  uuid,uuid,date,date,time,time,text,numeric,numeric,numeric,text,bigint,jsonb,text,text,text,text,text,text
) to service_role;

-- A public pay-at-marina booking can be confirmed before an exact ETA is known.
-- If an exact ETA is supplied later, restore the on-site balance due date without
-- replacing a due date that marina staff have already chosen.
create function private.set_on_site_due_at_when_eta_provided()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.eta is null and new.eta is not null and new.status = 'confirmed' then
    update public.booking_payment_balances balances
    set due_at = (new.arrival_date + new.eta) at time zone marinas.timezone
    from public.marinas marinas
    where balances.booking_id = new.id
      and balances.marina_id = new.marina_id
      and marinas.id = new.marina_id
      and balances.collection_method = 'on_site'
      and balances.balance_due_minor > 0
      and balances.due_at is null;
  end if;
  return new;
end;
$$;
revoke all on function private.set_on_site_due_at_when_eta_provided()
from public, anon, authenticated, service_role;
create trigger bookings_set_on_site_due_at_when_eta_provided
after update of eta on public.bookings for each row
execute function private.set_on_site_due_at_when_eta_provided();

-- An unknown exact ETA must not suppress the reminder or state an invented time.
create or replace function public.queue_upcoming_arrival_reminders()
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  queued_count integer := 0;
  target record;
  inserted_id uuid;
begin
  for target in
    select bookings.id, bookings.reference, bookings.arrival_date, bookings.eta,
      marinas.name marina_name, marinas.timezone
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    where bookings.status = 'confirmed'
      and bookings.arrival_date = ((statement_timestamp() at time zone marinas.timezone)::date + 1)
  loop
    inserted_id := private.enqueue_booking_notification(
      target.id, 'arrival_reminder', 'arrival-reminder:' || target.id || ':' || target.arrival_date,
      'Arrival reminder for booking ' || target.reference,
      'Reminder: booking ' || target.reference || ' arrives at ' || target.marina_name || ' tomorrow ('
        || target.arrival_date || ')'
        || case when target.eta is null then '. Arrival time has not been supplied.'
          else ' at ' || target.eta || ' local time (' || target.timezone || ').' end
    );
    if inserted_id is not null then queued_count := queued_count + 1; end if;
  end loop;
  return queued_count;
end;
$$;
