alter table public.booking_berth_assignments
  drop constraint booking_berth_assignments_end_state_check,
  add constraint booking_berth_assignments_end_state_check check (
    (ended_at is null and ended_by is null and ended_reason is null)
    or (
      ended_at is not null
      and ended_at >= assigned_at
      and ended_by is not null
      and ended_reason in ('reassigned', 'booking_changed', 'booking_extended', 'cancelled')
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
    or new.ended_reason not in ('reassigned', 'booking_changed', 'booking_extended', 'cancelled') then
    raise exception 'Berth assignment history is immutable.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.booking_cancellation_events (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  cancelled_at timestamptz not null default statement_timestamp(),
  cancelled_by uuid not null references auth.users(id) on delete restrict,
  reason text not null constraint booking_cancellation_events_reason_check
    check (char_length(btrim(reason)) between 1 and 500),
  policy_code text not null,
  refund_percent smallint not null constraint booking_cancellation_events_percent_check
    check (refund_percent between 0 and 100),
  refund_recommendation_minor bigint,
  currency text,
  paid_total_minor bigint,
  price_snapshot jsonb,
  constraint booking_cancellation_events_financial_check check (
    (refund_recommendation_minor is null and currency is null and paid_total_minor is null and price_snapshot is null)
    or (refund_recommendation_minor is not null and refund_recommendation_minor >= 0
      and currency is not null and paid_total_minor is not null and paid_total_minor >= 0
      and price_snapshot is not null)
  )
);

comment on table public.booking_cancellation_events is
  'Immutable staff cancellation decisions and policy-based refund recommendations. No refund is executed here.';

alter table public.booking_cancellation_events enable row level security;
create policy booking_cancellation_events_select_member
on public.booking_cancellation_events for select
to authenticated
using ((select private.is_marina_member(marina_id)));
revoke all on table public.booking_cancellation_events from public, anon, authenticated;
grant select on table public.booking_cancellation_events to authenticated;
grant all on table public.booking_cancellation_events to service_role;

create function private.booking_cancellation_event_is_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Booking cancellation history is immutable.' using errcode = '23514';
end;
$$;

create trigger booking_cancellation_events_immutable
before update or delete on public.booking_cancellation_events
for each row execute function private.booking_cancellation_event_is_immutable();

create function public.preview_booking_cancellation(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz
)
returns table (
  outcome text,
  booking_status public.booking_status,
  policy_code text,
  refund_percent smallint,
  refund_recommendation_minor bigint,
  paid_total_minor bigint,
  currency text,
  assignment_count integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  latest_adjustment public.booking_price_adjustments%rowtype;
  paid_total bigint;
  percent smallint;
  code text;
  days_until integer;
begin
  if not exists (
    select 1 from public.marinas marinas
    join public.organization_members members on members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id and members.user_id = target_actor_id
      and members.status = 'active' and members.role in ('marina_admin', 'marina_staff')
  ) then
    return query select 'unauthorized', null::public.booking_status, null::text, null::smallint,
      null::bigint, null::bigint, null::text, 0;
    return;
  end if;

  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id;
  if not found then
    return query select 'not_found', null::public.booking_status, null::text, null::smallint,
      null::bigint, null::bigint, null::text, 0;
    return;
  end if;
  if target_booking.updated_at is distinct from expected_updated_at then
    return query select 'stale', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;
  if target_booking.status = 'cancelled' then
    return query select 'already_cancelled', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;
  if target_booking.status <> 'confirmed' then
    return query select 'not_cancellable', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;

  select adjustments.* into latest_adjustment
  from public.booking_price_adjustments adjustments
  where adjustments.booking_id = target_booking.id
  order by adjustments.changed_at desc, adjustments.id desc limit 1;
  paid_total := coalesce(latest_adjustment.revised_price_total_minor, target_booking.price_total_minor);
  days_until := target_booking.arrival_date - current_date;
  if days_until >= 7 then percent := 100; code := 'full_refund_7_days';
  elsif days_until >= 2 then percent := 50; code := 'partial_refund_2_to_6_days';
  else percent := 0; code := 'no_refund_under_2_days';
  end if;

  return query select 'ready', target_booking.status, code, percent,
    case when paid_total is null then null else floor(paid_total * percent / 100.0)::bigint end,
    paid_total, target_booking.price_currency,
    (select count(*)::integer from public.booking_berth_assignments assignments
      where assignments.booking_id = target_booking.id and assignments.marina_id = target_marina_id
        and assignments.ended_at is null);
end;
$$;

revoke all on function public.preview_booking_cancellation(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.preview_booking_cancellation(uuid, uuid, uuid, timestamptz)
  to service_role;

create function public.confirm_booking_cancellation(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  cancellation_reason text
)
returns table (
  outcome text,
  policy_code text,
  refund_percent smallint,
  refund_recommendation_minor bigint,
  currency text,
  released_assignment_count integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  preview record;
  reason text := coalesce(nullif(btrim(cancellation_reason), ''), 'Staff cancellation');
  released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));
  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id for update;
  if not found then
    return query select 'not_found', null::text, null::smallint, null::bigint, null::text, 0; return;
  end if;
  select * into preview from public.preview_booking_cancellation(
    target_marina_id, target_booking_id, target_actor_id, expected_updated_at
  );
  if preview.outcome <> 'ready' then
    return query select preview.outcome, preview.policy_code, preview.refund_percent,
      preview.refund_recommendation_minor, preview.currency, 0; return;
  end if;
  if char_length(reason) > 500 then
    return query select 'invalid_reason', preview.policy_code, preview.refund_percent,
      preview.refund_recommendation_minor, preview.currency, 0; return;
  end if;

  update public.bookings set status = 'cancelled' where id = target_booking.id;
  update public.booking_berth_assignments
  set ended_at = statement_timestamp(), ended_by = target_actor_id, ended_reason = 'cancelled'
  where booking_id = target_booking.id and marina_id = target_marina_id and ended_at is null;
  get diagnostics released = row_count;

  insert into public.booking_cancellation_events(
    marina_id, booking_id, cancelled_by, reason, policy_code, refund_percent,
    refund_recommendation_minor, currency, paid_total_minor, price_snapshot
  ) values (
    target_marina_id, target_booking.id, target_actor_id, reason, preview.policy_code,
    preview.refund_percent, preview.refund_recommendation_minor, preview.currency,
    preview.paid_total_minor, coalesce((select revised_price_snapshot from public.booking_price_adjustments
      where booking_id = target_booking.id order by changed_at desc, id desc limit 1), target_booking.price_snapshot)
  );

  return query select 'cancelled', preview.policy_code, preview.refund_percent,
    preview.refund_recommendation_minor, preview.currency, released;
end;
$$;

revoke all on function public.confirm_booking_cancellation(uuid, uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.confirm_booking_cancellation(uuid, uuid, uuid, timestamptz, text)
  to service_role;

comment on function public.preview_booking_cancellation(uuid, uuid, uuid, timestamptz) is
  'Read-only policy-based cancellation preview. It recommends a refund but never issues one.';
comment on function public.confirm_booking_cancellation(uuid, uuid, uuid, timestamptz, text) is
  'Atomically records a staff-confirmed cancellation, releases active berth capacity, and preserves payment and cancellation history. No refund is executed.';
