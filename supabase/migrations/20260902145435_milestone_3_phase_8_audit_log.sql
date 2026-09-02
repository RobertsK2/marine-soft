create table public.audit_events (
  id bigint generated always as identity primary key,
  marina_id uuid not null references public.marinas(id) on delete cascade,
  event_type text not null constraint audit_events_event_type_check
    check (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  entity_type text not null constraint audit_events_entity_type_check
    check (entity_type in ('booking', 'berth', 'payment', 'assignment')),
  entity_id uuid not null,
  booking_id uuid,
  berth_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_type text not null constraint audit_events_actor_type_check
    check (actor_type in ('member', 'guest', 'system')),
  summary text not null constraint audit_events_summary_check
    check (char_length(btrim(summary)) between 1 and 240),
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default statement_timestamp(),
  constraint audit_events_context_check check (
    before_data is not null or after_data is not null
  )
);

comment on table public.audit_events is
  'Append-only, tenant-scoped operational history. Product roles may read but never insert, update, or delete events directly.';

create index audit_events_marina_timeline_idx
on public.audit_events(marina_id, occurred_at desc, id desc);
create index audit_events_booking_timeline_idx
on public.audit_events(marina_id, booking_id, occurred_at desc, id desc)
where booking_id is not null;
create index audit_events_berth_timeline_idx
on public.audit_events(marina_id, berth_id, occurred_at desc, id desc)
where berth_id is not null;
create index audit_events_actor_idx
on public.audit_events(actor_id)
where actor_id is not null;

alter table public.audit_events enable row level security;
create policy audit_events_select_marina_member
on public.audit_events for select
to authenticated
using ((select private.is_marina_member(marina_id)));

revoke all on table public.audit_events from public, anon, authenticated, service_role;
grant select on table public.audit_events to authenticated, service_role;
revoke all on sequence public.audit_events_id_seq from public, anon, authenticated, service_role;

create function private.audit_event_is_immutable()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Audit history is append-only.' using errcode = '23514';
end;
$$;

create trigger audit_events_immutable
before update or delete on public.audit_events
for each row execute function private.audit_event_is_immutable();

create function private.capture_operational_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data jsonb := coalesce(new_data, old_data);
  event_marina_id uuid := (row_data ->> 'marina_id')::uuid;
  event_entity_type text;
  event_entity_id uuid;
  event_booking_id uuid;
  event_berth_id uuid;
  event_actor_id uuid;
  event_actor_email text;
  event_actor_type text := 'system';
  event_type_name text;
  event_summary text;
  configured_actor text := nullif(current_setting('berthio.audit_actor_id', true), '');
begin
  if tg_table_name = 'bookings' then
    event_entity_type := 'booking';
    event_entity_id := (row_data ->> 'id')::uuid;
    event_booking_id := event_entity_id;
    event_actor_id := coalesce(configured_actor::uuid, (select auth.uid()));
    if tg_op = 'INSERT' then
      event_type_name := 'booking.created';
      event_summary := 'Booking ' || coalesce(row_data ->> 'reference', event_entity_id::text) || ' created';
    elsif old_data ->> 'status' is distinct from new_data ->> 'status' then
      event_type_name := case new_data ->> 'status'
        when 'checked_in' then 'booking.checked_in'
        when 'checked_out' then 'booking.checked_out'
        when 'cancelled' then 'booking.cancelled'
        else 'booking.status_changed'
      end;
      event_summary := 'Booking status changed from ' || (old_data ->> 'status') || ' to ' || (new_data ->> 'status');
    elsif (new_data ->> 'departure_date')::date > (old_data ->> 'departure_date')::date then
      event_type_name := 'booking.extended';
      event_summary := 'Booking departure extended to ' || (new_data ->> 'departure_date');
    elsif event_actor_id is null
      and (old_data - array['eta', 'etd', 'updated_at']) = (new_data - array['eta', 'etd', 'updated_at'])
      and ((old_data ->> 'eta') is distinct from (new_data ->> 'eta')
        or (old_data ->> 'etd') is distinct from (new_data ->> 'etd')) then
      event_type_name := 'booking.guest_times_updated';
      event_actor_type := 'guest';
      event_summary := 'Guest updated ETA or ETD';
    else
      event_type_name := 'booking.updated';
      event_summary := 'Booking details updated';
    end if;
  elsif tg_table_name = 'berths' then
    event_entity_type := 'berth';
    event_entity_id := (row_data ->> 'id')::uuid;
    event_berth_id := event_entity_id;
    event_actor_id := coalesce(configured_actor::uuid, (select auth.uid()));
    if tg_op = 'INSERT' then
      event_type_name := 'berth.created';
      event_summary := 'Berth ' || coalesce(row_data ->> 'code', event_entity_id::text) || ' created';
    elsif old_data ->> 'status' is distinct from new_data ->> 'status' then
      event_type_name := 'berth.status_changed';
      event_summary := 'Berth ' || coalesce(new_data ->> 'code', event_entity_id::text)
        || ' status changed from ' || (old_data ->> 'status') || ' to ' || (new_data ->> 'status');
    else
      event_type_name := 'berth.updated';
      event_summary := 'Berth ' || coalesce(new_data ->> 'code', event_entity_id::text) || ' details updated';
    end if;
  elsif tg_table_name = 'booking_berth_assignments' then
    event_entity_type := 'assignment';
    event_entity_id := (row_data ->> 'id')::uuid;
    event_booking_id := (row_data ->> 'booking_id')::uuid;
    event_berth_id := (row_data ->> 'berth_id')::uuid;
    event_actor_id := coalesce(
      (new_data ->> 'ended_by')::uuid,
      (new_data ->> 'assigned_by')::uuid,
      configured_actor::uuid,
      (select auth.uid())
    );
    if tg_op = 'INSERT' and row_data ->> 'assignment_kind' = 'planned_move' then
      event_type_name := 'assignment.move_planned';
      event_summary := 'Berth move planned for booking';
    elsif tg_op = 'INSERT' and exists (
      select 1 from public.booking_berth_assignments prior
      where prior.booking_id = event_booking_id
        and prior.id <> event_entity_id
        and prior.ended_reason = 'reassigned'
    ) then
      event_type_name := 'assignment.reassigned';
      event_summary := 'Booking reassigned to another berth';
    elsif tg_op = 'INSERT' then
      event_type_name := 'assignment.assigned';
      event_summary := 'Berth assigned to booking';
    else
      event_type_name := 'assignment.ended';
      event_summary := 'Berth assignment ended: ' || coalesce(new_data ->> 'ended_reason', 'completed');
    end if;
  elsif tg_table_name = 'booking_payment_balances' then
    event_entity_type := 'payment';
    event_entity_id := (row_data ->> 'id')::uuid;
    event_booking_id := (row_data ->> 'booking_id')::uuid;
    event_actor_id := coalesce((new_data ->> 'updated_by')::uuid, configured_actor::uuid, (select auth.uid()));
    event_type_name := 'payment.balance_changed';
    event_summary := 'Payment balance state set to ' || (new_data ->> 'state');
  elsif tg_table_name = 'booking_payments' then
    event_entity_type := 'payment';
    event_entity_id := (row_data ->> 'id')::uuid;
    event_booking_id := nullif(row_data ->> 'booking_id', '')::uuid;
    event_actor_id := coalesce(configured_actor::uuid, (select auth.uid()));
    event_type_name := case
      when tg_op = 'INSERT' then 'payment.created'
      when new_data ->> 'status' = 'paid' then 'payment.paid'
      when new_data ->> 'status' = 'failed' then 'payment.failed'
      when new_data ->> 'status' = 'expired' then 'payment.expired'
      else 'payment.updated'
    end;
    event_summary := 'Berthio payment state: ' || coalesce(new_data ->> 'status', row_data ->> 'status');
  elsif tg_table_name = 'booking_price_adjustments' then
    event_entity_type := 'booking';
    event_entity_id := (row_data ->> 'booking_id')::uuid;
    event_booking_id := event_entity_id;
    event_actor_id := coalesce((new_data ->> 'changed_by')::uuid, configured_actor::uuid, (select auth.uid()));
    event_type_name := 'booking.price_adjusted';
    event_summary := 'Booking price changed from ' || (row_data ->> 'previous_price_total_minor')
      || ' to ' || (row_data ->> 'revised_price_total_minor') || ' minor units';
  elsif tg_table_name = 'booking_cancellation_events' then
    event_entity_type := 'booking';
    event_entity_id := (row_data ->> 'booking_id')::uuid;
    event_booking_id := event_entity_id;
    event_actor_id := coalesce((new_data ->> 'cancelled_by')::uuid, configured_actor::uuid, (select auth.uid()));
    event_type_name := 'booking.cancellation_recorded';
    event_summary := 'Cancellation decision recorded under policy ' || (row_data ->> 'policy_code');
  else
    raise exception 'Unsupported audit source table: %', tg_table_name;
  end if;

  if event_actor_id is not null then
    event_actor_type := 'member';
    select users.email into event_actor_email from auth.users users where users.id = event_actor_id;
  end if;

  insert into public.audit_events(
    marina_id, event_type, entity_type, entity_id, booking_id, berth_id,
    actor_id, actor_email, actor_type, summary, before_data, after_data, metadata
  ) values (
    event_marina_id, event_type_name, event_entity_type, event_entity_id,
    event_booking_id, event_berth_id, event_actor_id, event_actor_email,
    event_actor_type, event_summary, old_data, new_data,
    jsonb_build_object('source_table', tg_table_name, 'operation', lower(tg_op))
  );

  return new;
end;
$$;

revoke all on function private.capture_operational_audit_event()
from public, anon, authenticated, service_role;

create trigger bookings_capture_audit
after insert or update on public.bookings
for each row execute function private.capture_operational_audit_event();
create trigger berths_capture_audit
after insert or update on public.berths
for each row execute function private.capture_operational_audit_event();
create trigger booking_assignments_capture_audit
after insert or update on public.booking_berth_assignments
for each row execute function private.capture_operational_audit_event();
create trigger payment_balances_capture_audit
after insert or update on public.booking_payment_balances
for each row execute function private.capture_operational_audit_event();
create trigger booking_payments_capture_audit
after insert or update on public.booking_payments
for each row execute function private.capture_operational_audit_event();
create trigger price_adjustments_capture_audit
after insert on public.booking_price_adjustments
for each row execute function private.capture_operational_audit_event();
create trigger cancellation_events_capture_audit
after insert on public.booking_cancellation_events
for each row execute function private.capture_operational_audit_event();

create function public.audited_update_booking_details(
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
language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform set_config('berthio.audit_actor_id', target_actor_id::text, true);
  return query select result.* from public.update_booking_details(
    target_marina_id, target_booking_id, target_actor_id, expected_updated_at,
    requested_arrival, requested_departure, requested_eta, requested_etd,
    requested_customer_name, requested_customer_email, requested_customer_phone,
    requested_vessel_name, requested_length_m, requested_beam_m, requested_draft_m,
    calculated_price_snapshot
  ) result;
end;
$$;

create function public.audited_confirm_booking_extension(
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
language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform set_config('berthio.audit_actor_id', target_actor_id::text, true);
  return query select result.* from public.confirm_booking_extension(
    target_marina_id, target_booking_id, target_actor_id, expected_updated_at,
    requested_departure, requested_move_berth_id, calculated_price_snapshot
  ) result;
end;
$$;

create function public.audited_confirm_booking_cancellation(
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
language plpgsql volatile security invoker set search_path = '' as $$
begin
  perform set_config('berthio.audit_actor_id', target_actor_id::text, true);
  return query select result.* from public.confirm_booking_cancellation(
    target_marina_id, target_booking_id, target_actor_id, expected_updated_at,
    cancellation_reason
  ) result;
end;
$$;

revoke all on function public.audited_update_booking_details(
  uuid, uuid, uuid, timestamptz, date, date, time without time zone,
  time without time zone, text, text, text, text, numeric, numeric, numeric, jsonb
) from public, anon, authenticated;
revoke all on function public.audited_confirm_booking_extension(
  uuid, uuid, uuid, timestamptz, date, uuid, jsonb
) from public, anon, authenticated;
revoke all on function public.audited_confirm_booking_cancellation(
  uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.audited_update_booking_details(
  uuid, uuid, uuid, timestamptz, date, date, time without time zone,
  time without time zone, text, text, text, text, numeric, numeric, numeric, jsonb
) to service_role;
grant execute on function public.audited_confirm_booking_extension(
  uuid, uuid, uuid, timestamptz, date, uuid, jsonb
) to service_role;
grant execute on function public.audited_confirm_booking_cancellation(
  uuid, uuid, uuid, timestamptz, text
) to service_role;
