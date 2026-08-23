create type public.booking_hold_status as enum ('active', 'released', 'expired');

create table public.booking_holds (
  id uuid primary key default gen_random_uuid(),
  public_token uuid not null unique default gen_random_uuid(),
  marina_id uuid not null references public.marinas (id) on delete cascade,
  idempotency_key uuid not null,
  arrival_date date not null,
  departure_date date not null,
  eta time without time zone not null,
  etd time without time zone not null,
  vessel_name text
    constraint booking_holds_vessel_name_check
    check (
      vessel_name is null
      or (
        vessel_name = btrim(vessel_name)
        and char_length(vessel_name) between 1 and 120
      )
    ),
  vessel_length_m numeric(6, 2) not null
    constraint booking_holds_vessel_length_check check (vessel_length_m > 0),
  vessel_beam_m numeric(6, 2) not null
    constraint booking_holds_vessel_beam_check check (vessel_beam_m > 0),
  vessel_draft_m numeric(6, 2) not null
    constraint booking_holds_vessel_draft_check check (vessel_draft_m > 0),
  status public.booking_hold_status not null default 'active',
  expires_at timestamptz not null,
  price_currency text not null
    constraint booking_holds_price_currency_check check (price_currency ~ '^[A-Z]{3}$'),
  price_total_minor bigint not null
    constraint booking_holds_price_total_check check (price_total_minor >= 0),
  price_snapshot jsonb not null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_holds_stay_interval_check check (departure_date > arrival_date),
  constraint booking_holds_exact_expiry_check check (
    expires_at = created_at + interval '15 minutes'
  ),
  constraint booking_holds_price_snapshot_check check (
    jsonb_typeof(price_snapshot) = 'object'
    and price_snapshot ?& array[
      'version', 'currency', 'totalMinor', 'arrivalDate', 'departureDate', 'vesselLengthM'
    ]
    and (price_snapshot ->> 'version')::integer = 1
    and price_snapshot ->> 'currency' = price_currency
    and (price_snapshot ->> 'totalMinor')::bigint = price_total_minor
    and price_snapshot ->> 'arrivalDate' = arrival_date::text
    and price_snapshot ->> 'departureDate' = departure_date::text
    and (price_snapshot ->> 'vesselLengthM')::numeric = vessel_length_m
  ),
  constraint booking_holds_release_state_check check (
    (status = 'active' and released_at is null and release_reason is null)
    or (status = 'expired' and released_at is null and release_reason is null)
    or (
      status = 'released'
      and released_at is not null
      and release_reason = 'checkout_session_creation_failed'
    )
  ),
  unique (marina_id, idempotency_key)
);

comment on table public.booking_holds is
  'Server-created 15-minute public capacity reservations. No payment or permanent berth assignment.';
comment on column public.booking_holds.public_token is
  'Opaque customer-safe token; internal hold ids are never returned publicly.';

create index booking_holds_active_capacity_idx
on public.booking_holds (marina_id, arrival_date, departure_date, expires_at)
where status = 'active';

create trigger booking_holds_set_updated_at
before update on public.booking_holds
for each row execute function private.set_updated_at();

create function private.booking_hold_snapshot_is_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.marina_id is distinct from old.marina_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.arrival_date is distinct from old.arrival_date
    or new.departure_date is distinct from old.departure_date
    or new.eta is distinct from old.eta
    or new.etd is distinct from old.etd
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

create trigger booking_holds_enforce_immutable_snapshot
before update on public.booking_holds
for each row execute function private.booking_hold_snapshot_is_immutable();

alter table public.booking_holds enable row level security;

create policy booking_holds_select_member
on public.booking_holds for select
to authenticated
using ((select private.is_marina_member(marina_id)));

revoke all on table public.booking_holds from anon, authenticated;
grant select on table public.booking_holds to authenticated;
grant all on table public.booking_holds to service_role;

create function private.berth_assignment_is_open(
  assignments jsonb,
  candidate_berth_id uuid,
  candidate_arrival date,
  candidate_departure date
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select not exists (
    select 1
    from jsonb_to_recordset(assignments) as assigned(
      berth_id uuid,
      arrival_date date,
      departure_date date
    )
    where assigned.berth_id = candidate_berth_id
      and assigned.arrival_date < candidate_departure
      and candidate_arrival < assigned.departure_date
  );
$$;

create function private.capacity_is_available(
  target_marina_id uuid,
  requested_arrival date,
  requested_departure date,
  requested_length_m numeric,
  requested_beam_m numeric,
  requested_draft_m numeric,
  excluded_booking_id uuid default null
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with recursive all_demands (
    demand_id,
    arrival_date,
    departure_date,
    vessel_length_m,
    vessel_beam_m,
    vessel_draft_m
  ) as (
    values (
      'request'::text,
      requested_arrival,
      requested_departure,
      requested_length_m,
      requested_beam_m,
      requested_draft_m
    )
    union all
    select
      'booking:' || bookings.id::text,
      bookings.arrival_date,
      bookings.departure_date,
      bookings.vessel_length_m,
      bookings.vessel_beam_m,
      bookings.vessel_draft_m
    from public.bookings
    where bookings.marina_id = target_marina_id
      and bookings.status in ('confirmed', 'checked_in')
      and bookings.id is distinct from excluded_booking_id
    union all
    select
      'hold:' || booking_holds.id::text,
      booking_holds.arrival_date,
      booking_holds.departure_date,
      booking_holds.vessel_length_m,
      booking_holds.vessel_beam_m,
      booking_holds.vessel_draft_m
    from public.booking_holds
    where booking_holds.marina_id = target_marina_id
      and booking_holds.status = 'active'
      and booking_holds.expires_at > statement_timestamp()
  ),
  connected (
    demand_id,
    arrival_date,
    departure_date,
    vessel_length_m,
    vessel_beam_m,
    vessel_draft_m
  ) as (
    select * from all_demands where demand_id = 'request'
    union
    select candidate.*
    from all_demands candidate
    join connected existing
      on candidate.arrival_date < existing.departure_date
      and existing.arrival_date < candidate.departure_date
  ),
  ranked as (
    select
      demand.*,
      count(berths.id) as candidate_count
    from connected demand
    left join public.berths
      on berths.marina_id = target_marina_id
      and berths.status = 'available'
      and demand.vessel_length_m <= berths.max_length_m
      and demand.vessel_beam_m <= berths.max_beam_m
      and demand.vessel_draft_m <= berths.max_draft_m
      and (
        berths.allow_smaller_vessels
        or (
          demand.vessel_length_m = berths.max_length_m
          and demand.vessel_beam_m = berths.max_beam_m
          and demand.vessel_draft_m = berths.max_draft_m
        )
      )
    group by
      demand.demand_id,
      demand.arrival_date,
      demand.departure_date,
      demand.vessel_length_m,
      demand.vessel_beam_m,
      demand.vessel_draft_m
  ),
  ordered as (
    select
      ranked.*,
      row_number() over (
        order by
          candidate_count,
          vessel_length_m desc,
          vessel_beam_m desc,
          vessel_draft_m desc,
          arrival_date,
          departure_date,
          demand_id
      ) as demand_number
    from ranked
  ),
  assignment_search (step, assignments) as (
    values (0::bigint, '[]'::jsonb)
    union all
    select
      assignment_search.step + 1,
      assignment_search.assignments || jsonb_build_array(
        jsonb_build_object(
          'berth_id', berths.id,
          'arrival_date', demand.arrival_date,
          'departure_date', demand.departure_date
        )
      )
    from assignment_search
    join ordered demand
      on demand.demand_number = assignment_search.step + 1
    join public.berths
      on berths.marina_id = target_marina_id
      and berths.status = 'available'
      and demand.vessel_length_m <= berths.max_length_m
      and demand.vessel_beam_m <= berths.max_beam_m
      and demand.vessel_draft_m <= berths.max_draft_m
      and (
        berths.allow_smaller_vessels
        or (
          demand.vessel_length_m = berths.max_length_m
          and demand.vessel_beam_m = berths.max_beam_m
          and demand.vessel_draft_m = berths.max_draft_m
        )
      )
    where private.berth_assignment_is_open(
      assignment_search.assignments,
      berths.id,
      demand.arrival_date,
      demand.departure_date
    )
  )
  select exists (
    select 1
    from assignment_search
    where step = (select count(*) from connected)
  );
$$;

create function public.create_booking_hold(
  target_marina_id uuid,
  request_idempotency_key uuid,
  requested_arrival date,
  requested_departure date,
  requested_eta time without time zone,
  requested_etd time without time zone,
  requested_vessel_name text,
  requested_length_m numeric,
  requested_beam_m numeric,
  requested_draft_m numeric,
  calculated_price_currency text,
  calculated_price_total_minor bigint,
  calculated_price_snapshot jsonb
)
returns table (
  outcome text,
  hold_token uuid,
  hold_expires_at timestamptz,
  total_minor bigint,
  currency text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  existing_hold public.booking_holds%rowtype;
  inserted_hold public.booking_holds%rowtype;
  operation_time timestamptz := statement_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));

  update public.booking_holds
  set status = 'expired'
  where marina_id = target_marina_id
    and status = 'active'
    and expires_at <= operation_time;

  select * into existing_hold
  from public.booking_holds
  where marina_id = target_marina_id
    and idempotency_key = request_idempotency_key;

  if found then
    if existing_hold.arrival_date is distinct from requested_arrival
      or existing_hold.departure_date is distinct from requested_departure
      or existing_hold.eta is distinct from requested_eta
      or existing_hold.etd is distinct from requested_etd
      or existing_hold.vessel_name is distinct from requested_vessel_name
      or existing_hold.vessel_length_m is distinct from requested_length_m
      or existing_hold.vessel_beam_m is distinct from requested_beam_m
      or existing_hold.vessel_draft_m is distinct from requested_draft_m then
      return query select 'idempotency_conflict', null::uuid, null::timestamptz, null::bigint, null::text;
    elsif existing_hold.status = 'active' and existing_hold.expires_at > operation_time then
      return query select
        'existing',
        existing_hold.public_token,
        existing_hold.expires_at,
        existing_hold.price_total_minor,
        existing_hold.price_currency;
    else
      return query select 'closed', null::uuid, null::timestamptz, null::bigint, null::text;
    end if;
    return;
  end if;

  if not exists (
    select 1 from public.marinas
    where marinas.id = target_marina_id and marinas.is_public
  ) then
    return query select 'not_found', null::uuid, null::timestamptz, null::bigint, null::text;
    return;
  end if;

  if jsonb_typeof(calculated_price_snapshot) <> 'object'
    or (calculated_price_snapshot ->> 'version')::integer <> 1
    or calculated_price_snapshot ->> 'currency' <> calculated_price_currency
    or (calculated_price_snapshot ->> 'totalMinor')::bigint <> calculated_price_total_minor
    or calculated_price_snapshot ->> 'arrivalDate' <> requested_arrival::text
    or calculated_price_snapshot ->> 'departureDate' <> requested_departure::text
    or (calculated_price_snapshot ->> 'vesselLengthM')::numeric <> requested_length_m then
    raise exception 'The server price snapshot does not match the hold request.'
      using errcode = '22023';
  end if;

  if not private.capacity_is_available(
    target_marina_id,
    requested_arrival,
    requested_departure,
    requested_length_m,
    requested_beam_m,
    requested_draft_m
  ) then
    return query select 'unavailable', null::uuid, null::timestamptz, null::bigint, null::text;
    return;
  end if;

  insert into public.booking_holds (
    marina_id,
    idempotency_key,
    arrival_date,
    departure_date,
    eta,
    etd,
    vessel_name,
    vessel_length_m,
    vessel_beam_m,
    vessel_draft_m,
    expires_at,
    price_currency,
    price_total_minor,
    price_snapshot,
    created_at
  )
  values (
    target_marina_id,
    request_idempotency_key,
    requested_arrival,
    requested_departure,
    requested_eta,
    requested_etd,
    requested_vessel_name,
    requested_length_m,
    requested_beam_m,
    requested_draft_m,
    operation_time + interval '15 minutes',
    calculated_price_currency,
    calculated_price_total_minor,
    calculated_price_snapshot,
    operation_time
  )
  returning * into inserted_hold;

  return query select
    'created',
    inserted_hold.public_token,
    inserted_hold.expires_at,
    inserted_hold.price_total_minor,
    inserted_hold.price_currency;
end;
$$;

create function public.release_booking_hold_after_checkout_failure(
  target_hold_token uuid
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_hold public.booking_holds%rowtype;
  operation_time timestamptz := statement_timestamp();
begin
  select * into target_hold
  from public.booking_holds
  where public_token = target_hold_token;

  if not found then return false; end if;

  perform pg_advisory_xact_lock(hashtextextended(target_hold.marina_id::text, 0));

  update public.booking_holds
  set status = 'expired'
  where id = target_hold.id
    and status = 'active'
    and expires_at <= operation_time;

  update public.booking_holds
  set
    status = 'released',
    released_at = operation_time,
    release_reason = 'checkout_session_creation_failed'
  where id = target_hold.id
    and status = 'active';

  return true;
end;
$$;

revoke all on function public.create_booking_hold(
  uuid, uuid, date, date, time without time zone, time without time zone,
  text, numeric, numeric, numeric, text, bigint, jsonb
) from public, anon, authenticated;
revoke all on function public.release_booking_hold_after_checkout_failure(uuid)
from public, anon, authenticated;

grant execute on function public.create_booking_hold(
  uuid, uuid, date, date, time without time zone, time without time zone,
  text, numeric, numeric, numeric, text, bigint, jsonb
) to service_role;
grant execute on function public.release_booking_hold_after_checkout_failure(uuid)
to service_role;

grant usage on schema private to service_role;
revoke all on function private.berth_assignment_is_open(jsonb, uuid, date, date)
from public, anon;
revoke all on function private.capacity_is_available(
  uuid, date, date, numeric, numeric, numeric, uuid
) from public, anon;
grant execute on function private.berth_assignment_is_open(jsonb, uuid, date, date)
to authenticated, service_role;
grant execute on function private.capacity_is_available(
  uuid, date, date, numeric, numeric, numeric, uuid
) to authenticated, service_role;

create function private.booking_respects_active_holds()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  should_check boolean;
begin
  if tg_op = 'INSERT' then
    should_check := new.status in ('confirmed', 'checked_in');
  else
    should_check := new.status in ('confirmed', 'checked_in') and (
      old.status not in ('confirmed', 'checked_in')
      or new.arrival_date is distinct from old.arrival_date
      or new.departure_date is distinct from old.departure_date
      or new.vessel_length_m is distinct from old.vessel_length_m
      or new.vessel_beam_m is distinct from old.vessel_beam_m
      or new.vessel_draft_m is distinct from old.vessel_draft_m
    );
  end if;

  if not should_check then return new; end if;

  perform pg_advisory_xact_lock(hashtextextended(new.marina_id::text, 0));

  if exists (
    select 1
    from public.booking_holds
    where booking_holds.marina_id = new.marina_id
      and booking_holds.status = 'active'
      and booking_holds.expires_at > statement_timestamp()
      and booking_holds.arrival_date < new.departure_date
      and new.arrival_date < booking_holds.departure_date
  ) and not private.capacity_is_available(
    new.marina_id,
    new.arrival_date,
    new.departure_date,
    new.vessel_length_m,
    new.vessel_beam_m,
    new.vessel_draft_m,
    case when tg_op = 'UPDATE' then old.id else null end
  ) then
    raise exception 'Active public hold has priority over this booking change.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger bookings_insert_respects_active_holds
before insert on public.bookings
for each row execute function private.booking_respects_active_holds();

create trigger bookings_update_respects_active_holds
before update of
  arrival_date,
  departure_date,
  vessel_length_m,
  vessel_beam_m,
  vessel_draft_m,
  status
on public.bookings
for each row execute function private.booking_respects_active_holds();
