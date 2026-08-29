alter table public.bookings
  drop constraint bookings_online_snapshot_complete_check,
  add constraint bookings_online_snapshot_complete_check check (
    source <> 'online'
    or (
      booking_hold_id is not null
      and booking_payment_id is not null
      and price_currency is not null
      and price_total_minor is not null
      and price_snapshot is not null
      and customer_snapshot is not null
      and jsonb_typeof(customer_snapshot) = 'object'
      and customer_snapshot ?& array['version', 'name', 'email', 'phone', 'source']
      and (customer_snapshot ->> 'version')::integer = 1
      and customer_snapshot ->> 'source' = 'stripe_checkout'
      and vessel_snapshot is not null
      and jsonb_typeof(vessel_snapshot) = 'object'
      and vessel_snapshot ?& array['version', 'name', 'lengthM', 'beamM', 'draftM']
      and (vessel_snapshot ->> 'version')::integer = 1
    )
  );

create or replace function private.protect_online_booking_snapshots()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.source = 'online' and (
    new.source is distinct from old.source
    or new.booking_hold_id is distinct from old.booking_hold_id
    or new.booking_payment_id is distinct from old.booking_payment_id
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.vessel_snapshot is distinct from old.vessel_snapshot
  ) then
    raise exception 'Online booking payment, customer, and vessel origin snapshots are immutable.'
      using errcode = '23514';
  end if;
  return new;
end $$;

alter table public.booking_berth_assignments
  drop constraint booking_berth_assignments_end_state_check,
  add constraint booking_berth_assignments_end_state_check check (
    (ended_at is null and ended_by is null and ended_reason is null)
    or (
      ended_at is not null
      and ended_at >= assigned_at
      and ended_by is not null
      and ended_reason in ('reassigned', 'booking_changed')
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
    or new.ended_at is null
    or new.ended_by is null
    or new.ended_reason not in ('reassigned', 'booking_changed') then
    raise exception 'Berth assignment history is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.booking_price_adjustments (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  previous_price_total_minor bigint not null check (previous_price_total_minor >= 0),
  revised_price_total_minor bigint not null check (revised_price_total_minor >= 0),
  difference_from_paid_minor bigint not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  previous_price_snapshot jsonb not null,
  revised_price_snapshot jsonb not null,
  changed_at timestamptz not null default statement_timestamp(),
  changed_by uuid references auth.users(id) on delete set null,
  constraint booking_price_adjustments_snapshots_check check (
    jsonb_typeof(previous_price_snapshot) = 'object'
    and jsonb_typeof(revised_price_snapshot) = 'object'
    and previous_price_snapshot ->> 'currency' = currency
    and revised_price_snapshot ->> 'currency' = currency
    and (previous_price_snapshot ->> 'totalMinor')::bigint = previous_price_total_minor
    and (revised_price_snapshot ->> 'totalMinor')::bigint = revised_price_total_minor
  )
);

comment on table public.booking_price_adjustments is
  'Immutable history of server-calculated booking repricing. Positive differences are due; negative differences are refundable but never auto-refunded.';

create index booking_price_adjustments_booking_changed_idx
on public.booking_price_adjustments(booking_id, changed_at desc);

alter table public.booking_price_adjustments enable row level security;

create policy booking_price_adjustments_select_member
on public.booking_price_adjustments for select
to authenticated
using ((select private.is_marina_member(marina_id)));

revoke all on table public.booking_price_adjustments from public, anon, authenticated;
grant select on table public.booking_price_adjustments to authenticated;
grant all on table public.booking_price_adjustments to service_role;

revoke update (
  arrival_date, departure_date, eta, etd,
  customer_name, customer_email, customer_phone,
  vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m
) on table public.bookings from authenticated;

create function private.booking_price_adjustment_is_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Booking price adjustment history is immutable.' using errcode = '23514';
end $$;

create trigger booking_price_adjustments_enforce_history
before update or delete on public.booking_price_adjustments
for each row execute function private.booking_price_adjustment_is_immutable();

create function public.update_booking_details(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  requested_arrival date,
  requested_departure date,
  requested_eta time without time zone,
  requested_etd time without time zone,
  requested_customer_name text,
  requested_customer_email text,
  requested_customer_phone text,
  requested_vessel_name text,
  requested_length_m numeric,
  requested_beam_m numeric,
  requested_draft_m numeric,
  calculated_price_snapshot jsonb
)
returns table (
  outcome text,
  price_difference_minor bigint,
  revised_total_minor bigint,
  price_currency text,
  assignment_preserved boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  current_assignment public.booking_berth_assignments%rowtype;
  assigned_berth public.berths%rowtype;
  previous_adjustment public.booking_price_adjustments%rowtype;
  capacity_affecting boolean;
  price_affecting boolean;
  current_price_snapshot jsonb;
  current_price_total bigint;
  new_price_total bigint;
  keep_assignment boolean := false;
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
    return query select 'unauthorized', null::bigint, null::bigint, null::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));

  select bookings.* into target_booking
  from public.bookings bookings
  where bookings.id = target_booking_id
    and bookings.marina_id = target_marina_id
  for update;

  if not found then
    return query select 'not_found', null::bigint, null::bigint, null::text, false;
    return;
  end if;
  if target_booking.status <> 'confirmed' then
    return query select 'not_editable', null::bigint, null::bigint, target_booking.price_currency, false;
    return;
  end if;
  if target_booking.updated_at is distinct from expected_updated_at then
    return query select 'stale', null::bigint, null::bigint, target_booking.price_currency, false;
    return;
  end if;
  if requested_departure <= requested_arrival
    or requested_length_m <= 0 or requested_beam_m <= 0 or requested_draft_m <= 0
    or requested_customer_name <> btrim(requested_customer_name)
    or requested_customer_email <> lower(btrim(requested_customer_email))
    or requested_customer_phone <> btrim(requested_customer_phone)
    or (requested_vessel_name is not null and requested_vessel_name <> btrim(requested_vessel_name)) then
    return query select 'invalid', null::bigint, null::bigint, target_booking.price_currency, false;
    return;
  end if;

  capacity_affecting := requested_arrival is distinct from target_booking.arrival_date
    or requested_departure is distinct from target_booking.departure_date
    or requested_length_m is distinct from target_booking.vessel_length_m
    or requested_beam_m is distinct from target_booking.vessel_beam_m
    or requested_draft_m is distinct from target_booking.vessel_draft_m;
  price_affecting := requested_arrival is distinct from target_booking.arrival_date
    or requested_departure is distinct from target_booking.departure_date
    or requested_length_m is distinct from target_booking.vessel_length_m;

  if not capacity_affecting
    and requested_eta is not distinct from target_booking.eta
    and requested_etd is not distinct from target_booking.etd
    and requested_customer_name is not distinct from target_booking.customer_name
    and requested_customer_email is not distinct from target_booking.customer_email
    and requested_customer_phone is not distinct from target_booking.customer_phone
    and requested_vessel_name is not distinct from target_booking.vessel_name then
    return query select 'unchanged', null::bigint, target_booking.price_total_minor,
      target_booking.price_currency, exists (
        select 1 from public.booking_berth_assignments assignments
        where assignments.booking_id = target_booking.id and assignments.ended_at is null
      );
    return;
  end if;

  if capacity_affecting and not private.capacity_is_available(
    target_marina_id, requested_arrival, requested_departure,
    requested_length_m, requested_beam_m, requested_draft_m, target_booking.id
  ) then
    return query select 'unavailable', null::bigint, null::bigint, target_booking.price_currency, false;
    return;
  end if;

  select assignments.* into current_assignment
  from public.booking_berth_assignments assignments
  where assignments.booking_id = target_booking.id and assignments.ended_at is null
  for update;

  if current_assignment.id is not null then
    select berths.* into assigned_berth
    from public.berths berths
    where berths.id = current_assignment.berth_id
      and berths.marina_id = target_marina_id;

    if assigned_berth.id is null
      or assigned_berth.status <> 'available'
      or requested_length_m > assigned_berth.max_length_m
      or requested_beam_m > assigned_berth.max_beam_m
      or requested_draft_m > assigned_berth.max_draft_m
      or (
        not assigned_berth.allow_smaller_vessels
        and not (
          requested_length_m = assigned_berth.max_length_m
          and requested_beam_m = assigned_berth.max_beam_m
          and requested_draft_m = assigned_berth.max_draft_m
        )
      )
      or exists (
        select 1 from public.booking_berth_assignments conflicts
        where conflicts.berth_id = current_assignment.berth_id
          and conflicts.booking_id <> target_booking.id
          and conflicts.ended_at is null
          and conflicts.arrival_date < requested_departure
          and requested_arrival < conflicts.departure_date
      ) then
      return query select 'assignment_invalid', null::bigint, null::bigint,
        target_booking.price_currency, false;
      return;
    end if;
    keep_assignment := true;
  end if;

  if price_affecting and target_booking.price_snapshot is not null then
    if jsonb_typeof(calculated_price_snapshot) <> 'object'
      or (calculated_price_snapshot ->> 'version')::integer <> 1
      or calculated_price_snapshot ->> 'currency' <> target_booking.price_currency
      or calculated_price_snapshot ->> 'arrivalDate' <> requested_arrival::text
      or calculated_price_snapshot ->> 'departureDate' <> requested_departure::text
      or (calculated_price_snapshot ->> 'vesselLengthM')::numeric <> requested_length_m then
      return query select 'invalid_price', null::bigint, null::bigint,
        target_booking.price_currency, keep_assignment;
      return;
    end if;

    new_price_total := (calculated_price_snapshot ->> 'totalMinor')::bigint;
    select adjustments.* into previous_adjustment
    from public.booking_price_adjustments adjustments
    where adjustments.booking_id = target_booking.id
    order by adjustments.changed_at desc, adjustments.id desc
    limit 1;
    current_price_snapshot := coalesce(previous_adjustment.revised_price_snapshot, target_booking.price_snapshot);
    current_price_total := coalesce(previous_adjustment.revised_price_total_minor, target_booking.price_total_minor);
  elsif price_affecting and target_booking.price_snapshot is null
    and calculated_price_snapshot is not null then
    return query select 'invalid_price', null::bigint, null::bigint, null::text, keep_assignment;
    return;
  end if;

  if capacity_affecting and current_assignment.id is not null then
    update public.booking_berth_assignments
    set ended_at = statement_timestamp(), ended_by = target_actor_id, ended_reason = 'booking_changed'
    where id = current_assignment.id;
  end if;

  update public.bookings
  set arrival_date = requested_arrival,
      departure_date = requested_departure,
      eta = requested_eta,
      etd = requested_etd,
      customer_name = requested_customer_name,
      customer_email = requested_customer_email,
      customer_phone = requested_customer_phone,
      vessel_name = requested_vessel_name,
      vessel_length_m = requested_length_m,
      vessel_beam_m = requested_beam_m,
      vessel_draft_m = requested_draft_m
  where id = target_booking.id;

  if capacity_affecting and current_assignment.id is not null then
    insert into public.booking_berth_assignments (
      marina_id, booking_id, berth_id, arrival_date, departure_date, assigned_by
    ) values (
      target_marina_id, target_booking.id, current_assignment.berth_id,
      requested_arrival, requested_departure, target_actor_id
    );
  end if;

  if price_affecting and target_booking.price_snapshot is not null
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

  return query select 'updated',
    case when price_affecting and target_booking.price_snapshot is not null
      then new_price_total - target_booking.price_total_minor else null::bigint end,
    case when price_affecting and target_booking.price_snapshot is not null
      then new_price_total else coalesce(previous_adjustment.revised_price_total_minor, target_booking.price_total_minor) end,
    target_booking.price_currency,
    keep_assignment;
end;
$$;

revoke all on function public.update_booking_details(
  uuid, uuid, uuid, timestamptz, date, date, time without time zone,
  time without time zone, text, text, text, text, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.update_booking_details(
  uuid, uuid, uuid, timestamptz, date, date, time without time zone,
  time without time zone, text, text, text, text, numeric, numeric, numeric, jsonb
) to service_role;
