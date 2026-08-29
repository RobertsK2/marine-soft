create table public.booking_berth_assignments (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  berth_id uuid not null references public.berths(id) on delete restrict,
  arrival_date date not null,
  departure_date date not null,
  assigned_at timestamptz not null default statement_timestamp(),
  assigned_by uuid references auth.users(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references auth.users(id) on delete set null,
  ended_reason text,
  constraint booking_berth_assignments_stay_check check (departure_date > arrival_date),
  constraint booking_berth_assignments_end_state_check check (
    (ended_at is null and ended_by is null and ended_reason is null)
    or (
      ended_at is not null
      and ended_at >= assigned_at
      and ended_by is not null
      and ended_reason = 'reassigned'
    )
  ),
  constraint booking_berth_assignments_no_overlap exclude using gist (
    berth_id with =,
    daterange(arrival_date, departure_date, '[)') with &&
  ) where (ended_at is null)
);

comment on table public.booking_berth_assignments is
  'Immutable manual berth-assignment history. Only the current row has ended_at null.';
comment on constraint booking_berth_assignments_no_overlap on public.booking_berth_assignments is
  'A real berth cannot have overlapping active assignments; stays use [arrival, departure).';

create unique index booking_berth_assignments_one_active_booking_idx
on public.booking_berth_assignments(booking_id)
where ended_at is null;

create index booking_berth_assignments_marina_active_berth_idx
on public.booking_berth_assignments(marina_id, berth_id, arrival_date, departure_date)
where ended_at is null;

alter table public.booking_berth_assignments enable row level security;

create policy booking_berth_assignments_select_member
on public.booking_berth_assignments for select
to authenticated
using ((select private.is_marina_member(marina_id)));

revoke all on table public.booking_berth_assignments from public, anon, authenticated;
grant select on table public.booking_berth_assignments to authenticated;
grant all on table public.booking_berth_assignments to service_role;

create function private.booking_berth_assignment_is_immutable()
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
    or new.ended_at is null
    or new.ended_by is null
    or new.ended_reason is distinct from 'reassigned' then
    raise exception 'Berth assignment history is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger booking_berth_assignments_enforce_history
before update on public.booking_berth_assignments
for each row execute function private.booking_berth_assignment_is_immutable();

create function private.assign_booking_berth(
  target_booking_id uuid,
  target_berth_id uuid
)
returns table (outcome text, assignment_id uuid, berth_code text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_booking public.bookings%rowtype;
  target_berth public.berths%rowtype;
  current_assignment public.booking_berth_assignments%rowtype;
  created_assignment public.booking_berth_assignments%rowtype;
  is_exact_fit boolean;
begin
  if actor_id is null then
    return query select 'unauthorized', null::uuid, null::text;
    return;
  end if;

  select bookings.* into target_booking
  from public.bookings bookings
  where bookings.id = target_booking_id
    and private.is_marina_member(bookings.marina_id)
  for update;

  if not found then
    return query select 'not_found', null::uuid, null::text;
    return;
  end if;

  if target_booking.status <> 'confirmed' then
    return query select 'booking_not_assignable', null::uuid, null::text;
    return;
  end if;

  select berths.* into target_berth
  from public.berths berths
  where berths.id = target_berth_id
    and berths.marina_id = target_booking.marina_id;

  if not found then
    return query select 'berth_not_found', null::uuid, null::text;
    return;
  end if;

  if target_berth.status <> 'available' then
    return query select 'berth_unavailable', null::uuid, target_berth.code;
    return;
  end if;

  is_exact_fit := target_booking.vessel_length_m = target_berth.max_length_m
    and target_booking.vessel_beam_m = target_berth.max_beam_m
    and target_booking.vessel_draft_m = target_berth.max_draft_m;

  if target_booking.vessel_length_m > target_berth.max_length_m
    or target_booking.vessel_beam_m > target_berth.max_beam_m
    or target_booking.vessel_draft_m > target_berth.max_draft_m
    or (not target_berth.allow_smaller_vessels and not is_exact_fit) then
    return query select 'incompatible', null::uuid, target_berth.code;
    return;
  end if;

  select assignments.* into current_assignment
  from public.booking_berth_assignments assignments
  where assignments.booking_id = target_booking.id
    and assignments.ended_at is null
  for update;

  if current_assignment.berth_id = target_berth.id then
    return query select 'existing', current_assignment.id, target_berth.code;
    return;
  end if;

  begin
    if current_assignment.id is not null then
      update public.booking_berth_assignments
      set ended_at = statement_timestamp(), ended_by = actor_id, ended_reason = 'reassigned'
      where id = current_assignment.id;
    end if;

    insert into public.booking_berth_assignments (
      marina_id, booking_id, berth_id, arrival_date, departure_date, assigned_by
    ) values (
      target_booking.marina_id, target_booking.id, target_berth.id,
      target_booking.arrival_date, target_booking.departure_date, actor_id
    ) returning * into created_assignment;
  exception
    when exclusion_violation or unique_violation then
      return query select 'conflict', null::uuid, target_berth.code;
      return;
  end;

  return query select
    case when current_assignment.id is null then 'assigned' else 'reassigned' end,
    created_assignment.id,
    target_berth.code;
end;
$$;

revoke all on function private.assign_booking_berth(uuid, uuid) from public, anon, authenticated;
grant execute on function private.assign_booking_berth(uuid, uuid) to authenticated;

create function public.assign_booking_berth(
  target_booking_id uuid,
  target_berth_id uuid
)
returns table (outcome text, assignment_id uuid, berth_code text)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.assign_booking_berth(target_booking_id, target_berth_id);
$$;

revoke all on function public.assign_booking_berth(uuid, uuid) from public, anon;
grant execute on function public.assign_booking_berth(uuid, uuid) to authenticated;

create function private.booking_assignment_snapshot_guard()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.marina_id is distinct from old.marina_id
    or new.arrival_date is distinct from old.arrival_date
    or new.departure_date is distinct from old.departure_date
    or new.vessel_length_m is distinct from old.vessel_length_m
    or new.vessel_beam_m is distinct from old.vessel_beam_m
    or new.vessel_draft_m is distinct from old.vessel_draft_m
  ) and exists (
    select 1 from public.booking_berth_assignments assignments
    where assignments.booking_id = old.id and assignments.ended_at is null
  ) then
    raise exception 'An assigned booking stay or vessel cannot change before reassignment support is implemented.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bookings_guard_active_assignment_snapshot
before update of marina_id, arrival_date, departure_date, vessel_length_m, vessel_beam_m, vessel_draft_m
on public.bookings
for each row execute function private.booking_assignment_snapshot_guard();
