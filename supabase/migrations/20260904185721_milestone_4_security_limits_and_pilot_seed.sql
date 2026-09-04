-- Milestone 4 pilot security closure only: anonymous hold abuse limits and a
-- deterministic fail-safe budget around the existing allocation algorithm.

alter table public.booking_holds
  add column requester_session_hash text default repeat('0',64),
  add column requester_network_hash text default repeat('0',64);

update public.booking_holds
set requester_session_hash = md5('legacy-session:' || id::text) || md5('legacy-session-2:' || id::text),
    requester_network_hash = md5('legacy-network:' || id::text) || md5('legacy-network-2:' || id::text);

alter table public.booking_holds
  alter column requester_session_hash set not null,
  alter column requester_network_hash set not null,
  add constraint booking_holds_requester_session_hash_check
    check (requester_session_hash ~ '^[0-9a-f]{64}$'),
  add constraint booking_holds_requester_network_hash_check
    check (requester_network_hash ~ '^[0-9a-f]{64}$');

comment on column public.booking_holds.requester_session_hash is
  'Server-HMAC pseudonymous browser bucket used only for anonymous hold abuse controls.';
comment on column public.booking_holds.requester_network_hash is
  'Server-HMAC pseudonymous network bucket used only for anonymous hold abuse controls.';

create index booking_holds_session_recent_idx
  on public.booking_holds (marina_id, requester_session_hash, created_at desc);
create index booking_holds_network_recent_idx
  on public.booking_holds (marina_id, requester_network_hash, created_at desc);
create index booking_holds_session_active_idx
  on public.booking_holds (marina_id, requester_session_hash, expires_at)
  where status = 'active';
create index booking_holds_network_active_idx
  on public.booking_holds (marina_id, requester_network_hash, expires_at)
  where status = 'active';
create index booking_holds_confirmed_capacity_idx
  on public.booking_holds (marina_id, arrival_date, departure_date)
  where payment_confirmed_at is not null and status <> 'consumed';

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

create or replace function private.capacity_is_available(
  target_marina_id uuid, requested_arrival date, requested_departure date,
  requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  excluded_booking_id uuid default null
) returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare
  demand_count bigint;
  berth_count bigint;
  search_count bigint;
  input_count bigint;
  solution_found boolean;
begin
  select count(*) into input_count from (
    select 1 from (
      select id from public.bookings
        where marina_id=target_marina_id and status in ('confirmed','checked_in') and id is distinct from excluded_booking_id
      union all
      select id from public.booking_holds
        where marina_id=target_marina_id and status<>'consumed'
          and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
    ) capacity_inputs limit 4097
  ) bounded_inputs;
  if input_count>4096 then
    raise exception 'BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED'
      using errcode='54000',detail='More than 4096 rows entered one allocation search.';
  end if;

  select count(*) into berth_count from (
    select 1 from public.berths
    where marina_id = target_marina_id and status = 'available'
    limit 257
  ) bounded_berths;
  if berth_count > 256 then
    raise exception 'BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED'
      using errcode = '54000', detail = 'More than 256 available berths entered one allocation search.';
  end if;

  with recursive all_demands (demand_id,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m) as (
    values ('request'::text,requested_arrival,requested_departure,requested_length_m,requested_beam_m,requested_draft_m)
    union all select 'booking:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.bookings where marina_id=target_marina_id and status in ('confirmed','checked_in') and id is distinct from excluded_booking_id
    union all select 'hold:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.booking_holds where marina_id=target_marina_id and status <> 'consumed'
        and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
  ), connected as (
    select * from all_demands where demand_id='request' union
    select candidate.* from all_demands candidate join connected existing
      on candidate.arrival_date<existing.departure_date and existing.arrival_date<candidate.departure_date
  ) select count(*) into demand_count from (select 1 from connected limit 65) bounded_demands;

  if demand_count > 64 then
    raise exception 'BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED'
      using errcode = '54000', detail = 'More than 64 connected demands entered one allocation search.';
  end if;

  with recursive all_demands (demand_id,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m) as (
    values ('request'::text,requested_arrival,requested_departure,requested_length_m,requested_beam_m,requested_draft_m)
    union all select 'booking:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.bookings where marina_id=target_marina_id and status in ('confirmed','checked_in') and id is distinct from excluded_booking_id
    union all select 'hold:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.booking_holds where marina_id=target_marina_id and status <> 'consumed'
        and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
  ), connected as (
    select * from all_demands where demand_id='request' union
    select candidate.* from all_demands candidate join connected existing
      on candidate.arrival_date<existing.departure_date and existing.arrival_date<candidate.departure_date
  ), ranked as (
    select demand.*,count(berths.id) candidate_count from connected demand
    left join public.berths berths on berths.marina_id=target_marina_id and berths.status='available'
      and demand.vessel_length_m<=berths.max_length_m and demand.vessel_beam_m<=berths.max_beam_m and demand.vessel_draft_m<=berths.max_draft_m
      and (berths.allow_smaller_vessels or (demand.vessel_length_m=berths.max_length_m and demand.vessel_beam_m=berths.max_beam_m and demand.vessel_draft_m=berths.max_draft_m))
    group by demand.demand_id,demand.arrival_date,demand.departure_date,demand.vessel_length_m,demand.vessel_beam_m,demand.vessel_draft_m
  ), ordered as (
    select ranked.*,row_number() over(order by candidate_count,vessel_length_m desc,vessel_beam_m desc,vessel_draft_m desc,arrival_date,departure_date,demand_id) demand_number from ranked
  ), assignment_search(step,assignments) as (
    values(0::bigint,'[]'::jsonb) union all
    select search.step+1,search.assignments||jsonb_build_array(jsonb_build_object('berth_id',berths.id,'arrival_date',demand.arrival_date,'departure_date',demand.departure_date))
    from assignment_search search join ordered demand on demand.demand_number=search.step+1
    join public.berths berths on berths.marina_id=target_marina_id and berths.status='available'
      and demand.vessel_length_m<=berths.max_length_m and demand.vessel_beam_m<=berths.max_beam_m and demand.vessel_draft_m<=berths.max_draft_m
      and (berths.allow_smaller_vessels or (demand.vessel_length_m=berths.max_length_m and demand.vessel_beam_m=berths.max_beam_m and demand.vessel_draft_m=berths.max_draft_m))
    where private.berth_assignment_is_open(search.assignments,berths.id,demand.arrival_date,demand.departure_date)
  ), bounded_search as materialized (
    select * from assignment_search limit 50001
  )
  select count(*),coalesce(bool_or(step=demand_count),false)
    into search_count,solution_found from bounded_search;

  if search_count > 50000 then
    raise exception 'BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED'
      using errcode = '54000', detail = 'More than 50000 allocation nodes were required.';
  end if;
  return solution_found;
end;
$$;

drop function public.create_booking_hold(
  uuid, uuid, date, date, time without time zone, time without time zone,
  text, numeric, numeric, numeric, text, bigint, jsonb
);

create function public.create_booking_hold(
  target_marina_id uuid, request_idempotency_key uuid,
  requested_arrival date, requested_departure date,
  requested_eta time without time zone, requested_etd time without time zone,
  requested_vessel_name text, requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  calculated_price_currency text, calculated_price_total_minor bigint, calculated_price_snapshot jsonb,
  request_session_hash text, request_network_hash text
) returns table (outcome text,hold_token uuid,hold_expires_at timestamptz,total_minor bigint,currency text)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  existing_hold public.booking_holds%rowtype;
  inserted_hold public.booking_holds%rowtype;
  operation_time timestamptz := statement_timestamp();
begin
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
    arrival_date,departure_date,eta,etd,vessel_name,vessel_length_m,vessel_beam_m,vessel_draft_m,
    expires_at,price_currency,price_total_minor,price_snapshot,created_at)
  values(target_marina_id,request_idempotency_key,request_session_hash,request_network_hash,
    requested_arrival,requested_departure,requested_eta,requested_etd,requested_vessel_name,
    requested_length_m,requested_beam_m,requested_draft_m,operation_time+interval '15 minutes',
    calculated_price_currency,calculated_price_total_minor,calculated_price_snapshot,operation_time)
  returning * into inserted_hold;
  return query select 'created',inserted_hold.public_token,inserted_hold.expires_at,inserted_hold.price_total_minor,inserted_hold.price_currency;
end;
$$;

revoke all on function public.create_booking_hold(
  uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text
) from public,anon,authenticated;
grant execute on function public.create_booking_hold(
  uuid,uuid,date,date,time without time zone,time without time zone,text,numeric,numeric,numeric,text,bigint,jsonb,text,text
) to service_role;

-- Preserve the extension solver's original forced-berth semantics while using
-- the same demand/berth guard and node ceiling as the general solver.
create or replace function private.extension_capacity_is_available_on_berth(
  target_marina_id uuid, target_berth_id uuid, requested_arrival date, requested_departure date,
  requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric, excluded_booking_id uuid
) returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare
  general_capacity boolean;
  search_count bigint;
  solution_found boolean;
begin
  general_capacity := private.capacity_is_available(target_marina_id,requested_arrival,requested_departure,
    requested_length_m,requested_beam_m,requested_draft_m,excluded_booking_id);
  if not general_capacity then return false; end if;

  with recursive all_demands (demand_id,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m) as (
    values ('request'::text,requested_arrival,requested_departure,requested_length_m,requested_beam_m,requested_draft_m)
    union all select 'booking:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.bookings where marina_id=target_marina_id and status in ('confirmed','checked_in') and id is distinct from excluded_booking_id
    union all select 'hold:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m
      from public.booking_holds where marina_id=target_marina_id and status<>'consumed'
        and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
  ), connected as (
    select * from all_demands where demand_id='request' union
    select candidate.* from all_demands candidate join connected existing
      on candidate.arrival_date<existing.departure_date and existing.arrival_date<candidate.departure_date
  ), ranked as (
    select demand.*,count(berths.id) candidate_count from connected demand
    left join public.berths berths on berths.marina_id=target_marina_id and berths.status='available'
      and (demand.demand_id<>'request' or berths.id=target_berth_id)
      and demand.vessel_length_m<=berths.max_length_m and demand.vessel_beam_m<=berths.max_beam_m and demand.vessel_draft_m<=berths.max_draft_m
      and (berths.allow_smaller_vessels or (demand.vessel_length_m=berths.max_length_m and demand.vessel_beam_m=berths.max_beam_m and demand.vessel_draft_m=berths.max_draft_m))
    group by demand.demand_id,demand.arrival_date,demand.departure_date,demand.vessel_length_m,demand.vessel_beam_m,demand.vessel_draft_m
  ), ordered as (
    select ranked.*,row_number() over(order by candidate_count,vessel_length_m desc,vessel_beam_m desc,vessel_draft_m desc,arrival_date,departure_date,demand_id) demand_number from ranked
  ), assignment_search(step,assignments) as (
    values(0::bigint,'[]'::jsonb) union all
    select search.step+1,search.assignments||jsonb_build_array(jsonb_build_object('berth_id',berths.id,'arrival_date',demand.arrival_date,'departure_date',demand.departure_date))
    from assignment_search search join ordered demand on demand.demand_number=search.step+1
    join public.berths berths on berths.marina_id=target_marina_id and berths.status='available'
      and (demand.demand_id<>'request' or berths.id=target_berth_id)
      and demand.vessel_length_m<=berths.max_length_m and demand.vessel_beam_m<=berths.max_beam_m and demand.vessel_draft_m<=berths.max_draft_m
      and (berths.allow_smaller_vessels or (demand.vessel_length_m=berths.max_length_m and demand.vessel_beam_m=berths.max_beam_m and demand.vessel_draft_m=berths.max_draft_m))
    where private.berth_assignment_is_open(search.assignments,berths.id,demand.arrival_date,demand.departure_date)
  ), bounded_search as materialized (select * from assignment_search limit 50001),
  demand_total as (select count(*) value from connected)
  select count(*),coalesce(bool_or(step=(select value from demand_total)),false)
    into search_count,solution_found from bounded_search;

  if search_count>50000 then
    raise exception 'BERTHIO_ALLOCATION_WORK_BUDGET_EXCEEDED'
      using errcode='54000',detail='More than 50000 forced-berth allocation nodes were required.';
  end if;
  return solution_found;
end;
$$;
