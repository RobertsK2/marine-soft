alter table public.bookings
  add column actual_check_in_at timestamptz,
  add column actual_check_out_at timestamptz,
  add column check_in_without_assignment boolean not null default false,
  add column check_in_assignment_exception_by uuid references auth.users(id) on delete set null;

create index bookings_check_in_assignment_exception_by_idx
on public.bookings(check_in_assignment_exception_by);

comment on column public.bookings.actual_check_in_at is
  'The real check-in instant. Stored as timestamptz and written only by the operational transition function.';
comment on column public.bookings.actual_check_out_at is
  'The real check-out instant. Stored as timestamptz and written only by the operational transition function.';
comment on column public.bookings.check_in_without_assignment is
  'True only when staff explicitly acknowledged an exceptional check-in without an active berth assignment.';

create function private.enforce_booking_operational_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status in ('checked_in', 'checked_out') then
      raise exception 'Operational booking states must be entered through the check-in/out transition.'
        using errcode = '23514';
    end if;
    if new.actual_check_in_at is not null
      or new.actual_check_out_at is not null
      or new.check_in_without_assignment
      or new.check_in_assignment_exception_by is not null then
      raise exception 'New bookings cannot contain operational check-in/out data.'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.actual_check_in_at is not null
    and new.actual_check_in_at is distinct from old.actual_check_in_at then
    raise exception 'The actual check-in timestamp is immutable.' using errcode = '23514';
  end if;
  if old.actual_check_out_at is not null
    and new.actual_check_out_at is distinct from old.actual_check_out_at then
    raise exception 'The actual check-out timestamp is immutable.' using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'confirmed' and new.status = 'checked_in' then
      if new.actual_check_in_at is null or new.actual_check_out_at is not null then
        raise exception 'Check-in requires an actual timestamp.' using errcode = '23514';
      end if;
      if new.check_in_without_assignment
        and new.check_in_assignment_exception_by is null then
        raise exception 'An unassigned check-in requires an explicit staff exception.' using errcode = '23514';
      end if;
      if not new.check_in_without_assignment
        and new.check_in_assignment_exception_by is not null then
        raise exception 'A normal check-in cannot record an assignment exception.' using errcode = '23514';
      end if;
      if not new.check_in_without_assignment and not exists (
        select 1
        from public.booking_berth_assignments assignments
        where assignments.booking_id = new.id
          and assignments.marina_id = new.marina_id
          and assignments.ended_at is null
      ) then
        raise exception 'Check-in requires an active berth assignment or an explicit exception.'
          using errcode = '23514';
      end if;
    elsif old.status = 'checked_in' and new.status = 'checked_out' then
      if new.actual_check_in_at is null
        or new.actual_check_out_at is null
        or new.actual_check_out_at < new.actual_check_in_at then
        raise exception 'Check-out requires an actual timestamp after check-in.' using errcode = '23514';
      end if;
      if new.check_in_without_assignment is distinct from old.check_in_without_assignment
        or new.check_in_assignment_exception_by is distinct from old.check_in_assignment_exception_by then
        raise exception 'Check-in assignment metadata is immutable at check-out.' using errcode = '23514';
      end if;
    elsif old.status = 'confirmed' and new.status = 'cancelled' then
      -- Preserve the pre-existing confirmed-booking cancellation path. Phase 6
      -- will add its own operational cancellation workflow.
      if new.actual_check_in_at is distinct from old.actual_check_in_at
        or new.actual_check_out_at is distinct from old.actual_check_out_at
        or new.check_in_without_assignment is distinct from old.check_in_without_assignment
        or new.check_in_assignment_exception_by is distinct from old.check_in_assignment_exception_by then
        raise exception 'Cancellation cannot create operational check-in/out data.' using errcode = '23514';
      end if;
    else
      raise exception 'Invalid booking status transition: % to %.', old.status, new.status
        using errcode = '23514';
    end if;
  elsif new.actual_check_in_at is distinct from old.actual_check_in_at
    or new.actual_check_out_at is distinct from old.actual_check_out_at
    or new.check_in_without_assignment is distinct from old.check_in_without_assignment
    or new.check_in_assignment_exception_by is distinct from old.check_in_assignment_exception_by then
    raise exception 'Operational timestamps and exceptions can change only with check-in/out.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger bookings_enforce_operational_transition
before insert or update of status, actual_check_in_at, actual_check_out_at,
  check_in_without_assignment, check_in_assignment_exception_by
on public.bookings
for each row execute function private.enforce_booking_operational_transition();

create function private.transition_booking_stay(
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
    and assignments.ended_at is null;

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
        check_in_assignment_exception_by = case when assigned_berth_code is null then actor_id else null end
    where id = target_booking.id;

    return query select 'checked_in', transition_at, assigned_berth_code, assigned_berth_code is null;
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

revoke all on function private.transition_booking_stay(uuid, public.booking_status, boolean)
from public, anon, authenticated;
grant execute on function private.transition_booking_stay(uuid, public.booking_status, boolean)
to authenticated;

create function public.transition_booking_stay(
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
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.transition_booking_stay(
    target_booking_id,
    target_status,
    allow_unassigned_check_in
  );
$$;

revoke all on function public.transition_booking_stay(uuid, public.booking_status, boolean)
from public, anon;
grant execute on function public.transition_booking_stay(uuid, public.booking_status, boolean)
to authenticated;
