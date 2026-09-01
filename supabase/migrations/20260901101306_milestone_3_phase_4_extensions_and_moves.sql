alter table public.booking_berth_assignments
  add column assignment_kind text not null default 'stay',
  add constraint booking_berth_assignments_kind_check
    check (assignment_kind in ('stay', 'planned_move'));

drop index booking_berth_assignments_one_active_booking_idx;

alter table public.booking_berth_assignments
  add constraint booking_berth_assignments_no_booking_segment_overlap exclude using gist (
    booking_id with =,
    daterange(arrival_date, departure_date, '[)') with &&
  ) where (ended_at is null);

create index booking_berth_assignments_booking_active_stay_idx
on public.booking_berth_assignments(booking_id, arrival_date, departure_date)
where ended_at is null;

alter table public.booking_berth_assignments
  drop constraint booking_berth_assignments_end_state_check,
  add constraint booking_berth_assignments_end_state_check check (
    (ended_at is null and ended_by is null and ended_reason is null)
    or (
      ended_at is not null
      and ended_at >= assigned_at
      and ended_by is not null
      and ended_reason in ('reassigned', 'booking_changed', 'booking_extended')
    )
  );

create or replace function private.booking_berth_assignment_is_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.ended_at is not null
    or new.id is distinct from old.id
    or new.marina_id is distinct from old.marina_id
    or new.booking_id is distinct from old.booking_id
    or new.berth_id is distinct from old.berth_id
    or new.arrival_date is distinct from old.arrival_date
    or new.departure_date is distinct from old.departure_date
    or new.assigned_at is distinct from old.assigned_at
    or new.assigned_by is distinct from old.assigned_by
    or new.assignment_kind is distinct from old.assignment_kind
    or new.ended_at is null
    or new.ended_by is null
    or new.ended_reason not in ('reassigned', 'booking_changed', 'booking_extended') then
    raise exception 'Berth assignment history is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create function private.extension_capacity_is_available_on_berth(
  target_marina_id uuid,
  target_berth_id uuid,
  requested_arrival date,
  requested_departure date,
  requested_length_m numeric,
  requested_beam_m numeric,
  requested_draft_m numeric,
  excluded_booking_id uuid
)
returns boolean
language sql
volatile
security invoker
set search_path = ''
as $$
  with recursive all_demands (
    demand_id, arrival_date, departure_date,
    vessel_length_m, vessel_beam_m, vessel_draft_m
  ) as (
    values (
      'request'::text, requested_arrival, requested_departure,
      requested_length_m, requested_beam_m, requested_draft_m
    )
    union all
    select 'booking:' || bookings.id::text, bookings.arrival_date, bookings.departure_date,
      bookings.vessel_length_m, bookings.vessel_beam_m, bookings.vessel_draft_m
    from public.bookings bookings
    where bookings.marina_id = target_marina_id
      and bookings.status in ('confirmed', 'checked_in')
      and bookings.id is distinct from excluded_booking_id
    union all
    select 'hold:' || holds.id::text, holds.arrival_date, holds.departure_date,
      holds.vessel_length_m, holds.vessel_beam_m, holds.vessel_draft_m
    from public.booking_holds holds
    where holds.marina_id = target_marina_id
      and holds.status <> 'consumed'
      and (holds.payment_confirmed_at is not null
        or (holds.status = 'active' and holds.expires_at > statement_timestamp()))
  ), connected as (
    select * from all_demands where demand_id = 'request'
    union
    select candidate.*
    from all_demands candidate
    join connected existing
      on candidate.arrival_date < existing.departure_date
      and existing.arrival_date < candidate.departure_date
  ), ranked as (
    select demand.*, count(berths.id) candidate_count
    from connected demand
    left join public.berths berths
      on berths.marina_id = target_marina_id
      and berths.status = 'available'
      and (demand.demand_id <> 'request' or berths.id = target_berth_id)
      and demand.vessel_length_m <= berths.max_length_m
      and demand.vessel_beam_m <= berths.max_beam_m
      and demand.vessel_draft_m <= berths.max_draft_m
      and (berths.allow_smaller_vessels or (
        demand.vessel_length_m = berths.max_length_m
        and demand.vessel_beam_m = berths.max_beam_m
        and demand.vessel_draft_m = berths.max_draft_m
      ))
    group by demand.demand_id, demand.arrival_date, demand.departure_date,
      demand.vessel_length_m, demand.vessel_beam_m, demand.vessel_draft_m
  ), ordered as (
    select ranked.*,
      row_number() over (
        order by candidate_count, vessel_length_m desc, vessel_beam_m desc,
          vessel_draft_m desc, arrival_date, departure_date, demand_id
      ) demand_number
    from ranked
  ), assignment_search(step, assignments) as (
    values (0::bigint, '[]'::jsonb)
    union all
    select search.step + 1,
      search.assignments || jsonb_build_array(jsonb_build_object(
        'berth_id', berths.id,
        'arrival_date', demand.arrival_date,
        'departure_date', demand.departure_date
      ))
    from assignment_search search
    join ordered demand on demand.demand_number = search.step + 1
    join public.berths berths
      on berths.marina_id = target_marina_id
      and berths.status = 'available'
      and (demand.demand_id <> 'request' or berths.id = target_berth_id)
      and demand.vessel_length_m <= berths.max_length_m
      and demand.vessel_beam_m <= berths.max_beam_m
      and demand.vessel_draft_m <= berths.max_draft_m
      and (berths.allow_smaller_vessels or (
        demand.vessel_length_m = berths.max_length_m
        and demand.vessel_beam_m = berths.max_beam_m
        and demand.vessel_draft_m = berths.max_draft_m
      ))
    where private.berth_assignment_is_open(
      search.assignments, berths.id, demand.arrival_date, demand.departure_date
    )
  )
  select exists (
    select 1 from assignment_search
    where step = (select count(*) from connected)
  );
$$;

revoke all on function private.extension_capacity_is_available_on_berth(
  uuid, uuid, date, date, numeric, numeric, numeric, uuid
) from public, anon, authenticated;
grant execute on function private.extension_capacity_is_available_on_berth(
  uuid, uuid, date, date, numeric, numeric, numeric, uuid
) to service_role;

create function public.preview_booking_extension(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  requested_departure date
)
returns table (
  outcome text,
  current_berth_id uuid,
  current_berth_code text,
  move_required boolean,
  berth_options jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  last_assignment public.booking_berth_assignments%rowtype;
  current_berth public.berths%rowtype;
  current_works boolean := false;
  options jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1
    from public.marinas marinas
    join public.organization_members members
      on members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id
      and members.user_id = target_actor_id
      and members.status = 'active'
      and members.role in ('marina_admin', 'marina_staff')
  ) then
    return query select 'unauthorized', null::uuid, null::text, false, options;
    return;
  end if;

  select bookings.* into target_booking
  from public.bookings bookings
  where bookings.id = target_booking_id
    and bookings.marina_id = target_marina_id;

  if not found then
    return query select 'not_found', null::uuid, null::text, false, options;
    return;
  end if;
  if target_booking.status not in ('confirmed', 'checked_in') then
    return query select 'not_extendable', null::uuid, null::text, false, options;
    return;
  end if;
  if target_booking.updated_at is distinct from expected_updated_at then
    return query select 'stale', null::uuid, null::text, false, options;
    return;
  end if;
  if requested_departure <= target_booking.departure_date then
    return query select 'invalid_departure', null::uuid, null::text, false, options;
    return;
  end if;
  if not private.capacity_is_available(
    target_marina_id,
    target_booking.departure_date,
    requested_departure,
    target_booking.vessel_length_m,
    target_booking.vessel_beam_m,
    target_booking.vessel_draft_m,
    target_booking.id
  ) then
    return query select 'impossible', null::uuid, null::text, false, options;
    return;
  end if;

  select assignments.* into last_assignment
  from public.booking_berth_assignments assignments
  where assignments.booking_id = target_booking.id
    and assignments.marina_id = target_marina_id
    and assignments.ended_at is null
  order by assignments.departure_date desc, assignments.arrival_date desc
  limit 1;

  if last_assignment.id is null then
    return query select 'unassigned_available', null::uuid, null::text, false, options;
    return;
  end if;

  select berths.* into current_berth
  from public.berths berths
  where berths.id = last_assignment.berth_id
    and berths.marina_id = target_marina_id;

  current_works := current_berth.id is not null
    and current_berth.status = 'available'
    and target_booking.vessel_length_m <= current_berth.max_length_m
    and target_booking.vessel_beam_m <= current_berth.max_beam_m
    and target_booking.vessel_draft_m <= current_berth.max_draft_m
    and (current_berth.allow_smaller_vessels or (
      target_booking.vessel_length_m = current_berth.max_length_m
      and target_booking.vessel_beam_m = current_berth.max_beam_m
      and target_booking.vessel_draft_m = current_berth.max_draft_m
    ))
    and not exists (
      select 1
      from public.booking_berth_assignments conflicts
      where conflicts.berth_id = current_berth.id
        and conflicts.booking_id <> target_booking.id
        and conflicts.ended_at is null
        and conflicts.arrival_date < requested_departure
        and target_booking.departure_date < conflicts.departure_date
    )
    and private.extension_capacity_is_available_on_berth(
      target_marina_id, current_berth.id,
      target_booking.departure_date, requested_departure,
      target_booking.vessel_length_m, target_booking.vessel_beam_m,
      target_booking.vessel_draft_m, target_booking.id
    );

  if current_works then
    return query select 'same_berth', current_berth.id, current_berth.code, false, options;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'berthId', berths.id,
    'code', berths.code,
    'zone', berths.zone,
    'maxLengthM', berths.max_length_m,
    'maxBeamM', berths.max_beam_m,
    'maxDraftM', berths.max_draft_m
  ) order by berths.priority, berths.code), '[]'::jsonb)
  into options
  from public.berths berths
  where berths.marina_id = target_marina_id
    and berths.id <> current_berth.id
    and berths.status = 'available'
    and target_booking.vessel_length_m <= berths.max_length_m
    and target_booking.vessel_beam_m <= berths.max_beam_m
    and target_booking.vessel_draft_m <= berths.max_draft_m
    and (berths.allow_smaller_vessels or (
      target_booking.vessel_length_m = berths.max_length_m
      and target_booking.vessel_beam_m = berths.max_beam_m
      and target_booking.vessel_draft_m = berths.max_draft_m
    ))
    and not exists (
      select 1
      from public.booking_berth_assignments conflicts
      where conflicts.berth_id = berths.id
        and conflicts.booking_id <> target_booking.id
        and conflicts.ended_at is null
        and conflicts.arrival_date < requested_departure
        and target_booking.departure_date < conflicts.departure_date
    )
    and private.extension_capacity_is_available_on_berth(
      target_marina_id, berths.id,
      target_booking.departure_date, requested_departure,
      target_booking.vessel_length_m, target_booking.vessel_beam_m,
      target_booking.vessel_draft_m, target_booking.id
    );

  if jsonb_array_length(options) = 0 then
    return query select 'impossible', current_berth.id, current_berth.code, true, options;
    return;
  end if;

  return query select 'move_required', current_berth.id, current_berth.code, true, options;
end;
$$;

revoke all on function public.preview_booking_extension(
  uuid, uuid, uuid, timestamptz, date
) from public, anon, authenticated;
grant execute on function public.preview_booking_extension(
  uuid, uuid, uuid, timestamptz, date
) to service_role;

create function public.confirm_booking_extension(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  requested_departure date,
  requested_move_berth_id uuid,
  calculated_price_snapshot jsonb
)
returns table (
  outcome text,
  current_berth_code text,
  move_berth_code text,
  price_difference_minor bigint,
  revised_total_minor bigint,
  price_currency text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  preview record;
  previous_adjustment public.booking_price_adjustments%rowtype;
  current_price_snapshot jsonb;
  current_price_total bigint;
  new_price_total bigint;
  segment jsonb;
  segments jsonb := '[]'::jsonb;
  selected_move_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));

  select bookings.* into target_booking
  from public.bookings bookings
  where bookings.id = target_booking_id
    and bookings.marina_id = target_marina_id
  for update;

  if not found then
    return query select 'not_found', null::text, null::text,
      null::bigint, null::bigint, null::text;
    return;
  end if;

  select * into preview
  from public.preview_booking_extension(
    target_marina_id, target_booking_id, target_actor_id,
    expected_updated_at, requested_departure
  );

  if preview.outcome not in ('same_berth', 'move_required', 'unassigned_available') then
    return query select preview.outcome, preview.current_berth_code, null::text,
      null::bigint, null::bigint, target_booking.price_currency;
    return;
  end if;

  if preview.outcome = 'move_required' then
    if requested_move_berth_id is null or not exists (
      select 1
      from jsonb_array_elements(preview.berth_options) option
      where option ->> 'berthId' = requested_move_berth_id::text
    ) then
      return query select 'move_invalid', preview.current_berth_code, null::text,
        null::bigint, null::bigint, target_booking.price_currency;
      return;
    end if;
    select berths.code into selected_move_code
    from public.berths berths
    where berths.id = requested_move_berth_id;
  elsif requested_move_berth_id is not null
    and requested_move_berth_id is distinct from preview.current_berth_id then
    return query select 'move_not_required', preview.current_berth_code, null::text,
      null::bigint, null::bigint, target_booking.price_currency;
    return;
  end if;

  if target_booking.price_snapshot is not null then
    if jsonb_typeof(calculated_price_snapshot) <> 'object'
      or (calculated_price_snapshot ->> 'version')::integer <> 1
      or calculated_price_snapshot ->> 'currency' <> target_booking.price_currency
      or calculated_price_snapshot ->> 'arrivalDate' <> target_booking.arrival_date::text
      or calculated_price_snapshot ->> 'departureDate' <> requested_departure::text
      or (calculated_price_snapshot ->> 'vesselLengthM')::numeric
        <> target_booking.vessel_length_m then
      return query select 'invalid_price', preview.current_berth_code, null::text,
        null::bigint, null::bigint, target_booking.price_currency;
      return;
    end if;

    new_price_total := (calculated_price_snapshot ->> 'totalMinor')::bigint;
    select adjustments.* into previous_adjustment
    from public.booking_price_adjustments adjustments
    where adjustments.booking_id = target_booking.id
    order by adjustments.changed_at desc, adjustments.id desc
    limit 1;
    current_price_snapshot := coalesce(
      previous_adjustment.revised_price_snapshot, target_booking.price_snapshot
    );
    current_price_total := coalesce(
      previous_adjustment.revised_price_total_minor, target_booking.price_total_minor
    );
  elsif calculated_price_snapshot is not null then
    return query select 'invalid_price', preview.current_berth_code, null::text,
      null::bigint, null::bigint, null::text;
    return;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'berthId', assignments.berth_id,
    'arrivalDate', assignments.arrival_date,
    'departureDate', assignments.departure_date,
    'assignmentKind', assignments.assignment_kind
  ) order by assignments.arrival_date, assignments.departure_date), '[]'::jsonb)
  into segments
  from public.booking_berth_assignments assignments
  where assignments.booking_id = target_booking.id
    and assignments.marina_id = target_marina_id
    and assignments.ended_at is null;

  update public.booking_berth_assignments
  set ended_at = statement_timestamp(),
      ended_by = target_actor_id,
      ended_reason = 'booking_extended'
  where booking_id = target_booking.id
    and marina_id = target_marina_id
    and ended_at is null;

  update public.bookings
  set departure_date = requested_departure
  where id = target_booking.id;

  if preview.outcome in ('same_berth', 'move_required') then
    for segment in select value from jsonb_array_elements(segments)
    loop
      insert into public.booking_berth_assignments (
        marina_id, booking_id, berth_id, arrival_date, departure_date,
        assigned_by, assignment_kind
      ) values (
        target_marina_id,
        target_booking.id,
        (segment ->> 'berthId')::uuid,
        (segment ->> 'arrivalDate')::date,
        case
          when preview.outcome = 'same_berth'
            and (segment ->> 'departureDate')::date = target_booking.departure_date
          then requested_departure
          else (segment ->> 'departureDate')::date
        end,
        target_actor_id,
        segment ->> 'assignmentKind'
      );
    end loop;
  end if;

  if preview.outcome = 'move_required' then
    insert into public.booking_berth_assignments (
      marina_id, booking_id, berth_id, arrival_date, departure_date,
      assigned_by, assignment_kind
    ) values (
      target_marina_id, target_booking.id, requested_move_berth_id,
      target_booking.departure_date, requested_departure,
      target_actor_id, 'planned_move'
    );
  end if;

  if target_booking.price_snapshot is not null
    and new_price_total is distinct from current_price_total then
    insert into public.booking_price_adjustments (
      marina_id, booking_id, previous_price_total_minor, revised_price_total_minor,
      difference_from_paid_minor, currency, previous_price_snapshot,
      revised_price_snapshot, changed_by
    ) values (
      target_marina_id, target_booking.id, current_price_total, new_price_total,
      new_price_total - target_booking.price_total_minor, target_booking.price_currency,
      current_price_snapshot, calculated_price_snapshot, target_actor_id
    );
  end if;

  return query select
    case preview.outcome
      when 'same_berth' then 'extended_same_berth'
      when 'move_required' then 'extended_with_move'
      else 'extended_unassigned'
    end,
    preview.current_berth_code,
    selected_move_code,
    case when target_booking.price_snapshot is not null
      then new_price_total - target_booking.price_total_minor else null::bigint end,
    case when target_booking.price_snapshot is not null
      then new_price_total else null::bigint end,
    target_booking.price_currency;
end;
$$;

revoke all on function public.confirm_booking_extension(
  uuid, uuid, uuid, timestamptz, date, uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.confirm_booking_extension(
  uuid, uuid, uuid, timestamptz, date, uuid, jsonb
) to service_role;

create or replace function private.transition_booking_stay(
  target_booking_id uuid,
  target_status public.booking_status,
  allow_unassigned_check_in boolean default false
)
returns table (
  outcome text,
  actual_at timestamptz,
  berth_code text,
  used_assignment_exception boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_booking public.bookings%rowtype;
  assigned_berth_code text;
  transition_at timestamptz := statement_timestamp();
begin
  if actor_id is null then
    return query select 'unauthorized', null::timestamptz, null::text, false;
    return;
  end if;

  select bookings.* into target_booking
  from public.bookings bookings
  where bookings.id = target_booking_id
    and private.is_marina_member(bookings.marina_id)
  for update;

  if not found then
    return query select 'not_found', null::timestamptz, null::text, false;
    return;
  end if;

  select berths.code into assigned_berth_code
  from public.booking_berth_assignments assignments
  join public.berths berths on berths.id = assignments.berth_id
  where assignments.booking_id = target_booking.id
    and assignments.marina_id = target_booking.marina_id
    and assignments.ended_at is null
  order by
    case when target_status = 'checked_in' then assignments.arrival_date end asc,
    case when target_status = 'checked_out' then assignments.departure_date end desc
  limit 1;

  if target_status = 'checked_in' then
    if target_booking.status <> 'confirmed' then
      return query select 'invalid_transition', null::timestamptz, assigned_berth_code, false;
      return;
    end if;
    if assigned_berth_code is null and not allow_unassigned_check_in then
      return query select 'assignment_required', null::timestamptz, null::text, false;
      return;
    end if;

    update public.bookings
    set status = 'checked_in',
        actual_check_in_at = transition_at,
        check_in_without_assignment = assigned_berth_code is null,
        check_in_assignment_exception_by = case
          when assigned_berth_code is null then actor_id else null end
    where id = target_booking.id;

    return query select 'checked_in', transition_at, assigned_berth_code,
      assigned_berth_code is null;
    return;
  end if;

  if target_status = 'checked_out' then
    if target_booking.status <> 'checked_in' then
      return query select 'invalid_transition', null::timestamptz, assigned_berth_code, false;
      return;
    end if;

    update public.bookings
    set status = 'checked_out', actual_check_out_at = transition_at
    where id = target_booking.id;

    return query select 'checked_out', transition_at, assigned_berth_code,
      target_booking.check_in_without_assignment;
    return;
  end if;

  return query select 'invalid_target', null::timestamptz, assigned_berth_code, false;
end;
$$;

comment on column public.booking_berth_assignments.assignment_kind is
  'Stay segments are current operational assignments; planned_move marks a staff-confirmed future berth move created only by an extension.';
comment on function public.preview_booking_extension(uuid, uuid, uuid, timestamptz, date) is
  'Read-only authoritative preview for an extension. It identifies whether the final active berth can serve the added interval and returns capacity-safe alternatives.';
comment on function public.confirm_booking_extension(uuid, uuid, uuid, timestamptz, date, uuid, jsonb) is
  'Atomically revalidates and confirms a stay extension, optionally appending an explicit planned berth-move segment while preserving assignment and price history.';
