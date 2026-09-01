create or replace function public.preview_berth_block_impact(
  target_marina_id uuid,
  target_berth_id uuid,
  target_actor_id uuid,
  target_status text
)
returns table (
  outcome text,
  berth_code text,
  requested_status text,
  affected_count integer,
  unresolved_count integer,
  affected_bookings jsonb
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_berth public.berths%rowtype;
  bookings jsonb := '[]'::jsonb;
  affected_total integer := 0;
begin
  if target_status not in ('available', 'blocked', 'out_of_service') then
    return query select 'invalid_status', null::text, target_status, 0, 0, bookings;
    return;
  end if;

  if not exists (
    select 1 from public.marinas marinas
    join public.organization_members members on members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id
      and members.user_id = target_actor_id
      and members.status = 'active'
      and members.role = 'marina_admin'
  ) then
    return query select 'unauthorized', null::text, target_status, 0, 0, bookings;
    return;
  end if;

  select berths.* into target_berth
  from public.berths berths
  where berths.id = target_berth_id and berths.marina_id = target_marina_id;
  if not found then
    return query select 'not_found', null::text, target_status, 0, 0, bookings;
    return;
  end if;

  if target_status in ('blocked', 'out_of_service') then
    with impacted as (
      select distinct on (bookings.id)
        bookings.id, bookings.reference, bookings.status,
        assignments.arrival_date, assignments.departure_date,
        bookings.vessel_length_m, bookings.vessel_beam_m, bookings.vessel_draft_m
      from public.booking_berth_assignments assignments
      join public.bookings bookings on bookings.id = assignments.booking_id
      where assignments.marina_id = target_marina_id
        and assignments.berth_id = target_berth_id
        and assignments.ended_at is null
        and bookings.status in ('confirmed', 'checked_in')
        and assignments.departure_date > current_date
      order by bookings.id, assignments.arrival_date
    ), options as (
      select impacted.id as booking_id,
        coalesce(jsonb_agg(jsonb_build_object(
          'berthId', berths.id, 'code', berths.code, 'zone', berths.zone,
          'maxLengthM', berths.max_length_m, 'maxBeamM', berths.max_beam_m,
          'maxDraftM', berths.max_draft_m
        ) order by berths.priority, berths.code) filter (where berths.id is not null), '[]'::jsonb) as berth_options
      from impacted
      left join public.berths berths
        on berths.marina_id = target_marina_id
        and berths.id <> target_berth_id
        and berths.status = 'available'
        and impacted.vessel_length_m <= berths.max_length_m
        and impacted.vessel_beam_m <= berths.max_beam_m
        and impacted.vessel_draft_m <= berths.max_draft_m
        and (berths.allow_smaller_vessels or (
          impacted.vessel_length_m = berths.max_length_m
          and impacted.vessel_beam_m = berths.max_beam_m
          and impacted.vessel_draft_m = berths.max_draft_m
        ))
        and not exists (
          select 1 from public.booking_berth_assignments conflicts
          join public.bookings conflict_bookings on conflict_bookings.id = conflicts.booking_id
          where conflicts.berth_id = berths.id
            and conflicts.booking_id <> impacted.id
            and conflicts.ended_at is null
            and conflict_bookings.status in ('confirmed', 'checked_in')
            and conflicts.arrival_date < impacted.departure_date
            and impacted.arrival_date < conflicts.departure_date
        )
      group by impacted.id
    ), rows as (
      select impacted.*, coalesce(options.berth_options, '[]'::jsonb) berth_options
      from impacted left join options on options.booking_id = impacted.id
    )
    select count(*)::integer,
      coalesce(jsonb_agg(jsonb_build_object(
        'bookingId', id, 'reference', reference, 'status', status,
        'arrivalDate', arrival_date, 'departureDate', departure_date,
        'berthOptions', berth_options
      ) order by arrival_date, reference), '[]'::jsonb)
    into affected_total, bookings
    from rows;
  end if;

  return query select
    case when affected_total > 0 then 'conflicts' else 'safe' end,
    target_berth.code, target_status, affected_total,
    affected_total, bookings;
end;
$$;

revoke all on function public.preview_berth_block_impact(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.preview_berth_block_impact(uuid, uuid, uuid, text)
  to service_role;

comment on function public.preview_berth_block_impact(uuid, uuid, uuid, text) is
  'Read-only operational impact preview for taking a berth blocked or out of service. It reports affected future assignments and only capacity-safe, unoccupied alternatives; it never reassigns or notifies.';
