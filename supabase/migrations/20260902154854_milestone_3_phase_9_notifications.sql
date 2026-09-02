create type public.notification_event_type as enum (
  'booking_confirmation',
  'arrival_reminder',
  'berth_move_confirmation',
  'cancellation_confirmation',
  'payment_balance_reminder'
);

create type public.notification_delivery_status as enum (
  'pending',
  'processing',
  'failed',
  'sent'
);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  event_type public.notification_event_type not null,
  dedupe_key text not null constraint notification_outbox_dedupe_key_check
    check (char_length(btrim(dedupe_key)) between 1 and 300),
  recipient_email text not null constraint notification_outbox_recipient_check
    check (recipient_email = lower(btrim(recipient_email)) and char_length(recipient_email) between 3 and 254),
  recipient_name text constraint notification_outbox_recipient_name_check
    check (recipient_name is null or char_length(btrim(recipient_name)) between 1 and 160),
  subject text not null constraint notification_outbox_subject_check
    check (char_length(btrim(subject)) between 1 and 500),
  text_body text not null constraint notification_outbox_body_check
    check (char_length(btrim(text_body)) between 1 and 20000),
  status public.notification_delivery_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (marina_id, dedupe_key),
  constraint notification_outbox_delivery_state_check check (
    (status = 'processing' and lease_token is not null and lease_expires_at is not null and sent_at is null)
    or (status = 'sent' and lease_token is null and lease_expires_at is null and sent_at is not null and provider_message_id is not null)
    or (status in ('pending', 'failed') and lease_token is null and lease_expires_at is null and sent_at is null)
  )
);

comment on table public.notification_outbox is
  'Transactional email outbox. Business transactions enqueue here; network delivery happens only after commit.';

create index notification_outbox_ready_idx
on public.notification_outbox(next_attempt_at, created_at)
where status in ('pending', 'failed', 'processing');
create index notification_outbox_marina_booking_idx
on public.notification_outbox(marina_id, booking_id, created_at desc)
where booking_id is not null;

create table public.notification_delivery_attempts (
  id bigint generated always as identity primary key,
  notification_id uuid not null references public.notification_outbox(id) on delete restrict,
  marina_id uuid not null references public.marinas(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('sent', 'failed')),
  provider_message_id text,
  error_message text,
  completed_at timestamptz not null default statement_timestamp(),
  unique (notification_id, attempt_number),
  constraint notification_delivery_attempt_result_check check (
    (outcome = 'sent' and provider_message_id is not null and error_message is null)
    or (outcome = 'failed' and provider_message_id is null and error_message is not null)
  )
);

comment on table public.notification_delivery_attempts is
  'Append-only delivery result history. Each completed provider attempt is recorded once.';

create index notification_delivery_attempts_marina_idx
on public.notification_delivery_attempts(marina_id, completed_at desc);

alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempts enable row level security;

create policy notification_outbox_select_member
on public.notification_outbox for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy notification_attempts_select_member
on public.notification_delivery_attempts for select to authenticated
using ((select private.is_marina_member(marina_id)));

revoke all on table public.notification_outbox from public, anon, authenticated, service_role;
revoke all on table public.notification_delivery_attempts from public, anon, authenticated, service_role;
revoke all on sequence public.notification_delivery_attempts_id_seq from public, anon, authenticated, service_role;
grant select on table public.notification_outbox, public.notification_delivery_attempts to authenticated, service_role;

create function private.notification_attempt_is_immutable()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception 'Notification delivery history is append-only.' using errcode = '23514';
end;
$$;

create trigger notification_delivery_attempts_immutable
before update or delete on public.notification_delivery_attempts
for each row execute function private.notification_attempt_is_immutable();

create function private.enqueue_booking_notification(
  target_booking_id uuid,
  target_event_type public.notification_event_type,
  target_dedupe_key text,
  target_subject text,
  target_body text
)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  target_booking public.bookings%rowtype;
  notification_id uuid;
begin
  select bookings.* into target_booking
  from public.bookings bookings where bookings.id = target_booking_id;
  if not found then return null; end if;

  insert into public.notification_outbox(
    marina_id, booking_id, event_type, dedupe_key, recipient_email,
    recipient_name, subject, text_body
  ) values (
    target_booking.marina_id, target_booking.id, target_event_type,
    target_dedupe_key, lower(target_booking.customer_email), target_booking.customer_name,
    target_subject, target_body
  ) on conflict (marina_id, dedupe_key) do nothing
  returning id into notification_id;
  return notification_id;
end;
$$;

revoke all on function private.enqueue_booking_notification(uuid, public.notification_event_type, text, text, text)
from public, anon, authenticated, service_role;

create function private.queue_operational_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  marina_name text;
  booking_reference text;
  berth_code text;
  currency_label text;
begin
  if tg_table_name = 'bookings' then
    select marinas.name into marina_name from public.marinas marinas where marinas.id = new.marina_id;
    perform private.enqueue_booking_notification(
      new.id, 'booking_confirmation', 'booking-confirmation:' || new.id,
      'Booking ' || new.reference || ' confirmed at ' || marina_name,
      'Hello ' || new.customer_name || E',\n\nYour booking ' || new.reference || ' at ' || marina_name
        || ' is confirmed for ' || new.arrival_date || ' to ' || new.departure_date || E'.\n\nBerthio'
    );
  elsif tg_table_name = 'booking_cancellation_events' then
    select bookings.reference, marinas.name into booking_reference, marina_name
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    where bookings.id = new.booking_id;
    perform private.enqueue_booking_notification(
      new.booking_id, 'cancellation_confirmation', 'cancellation:' || new.id,
      'Booking ' || booking_reference || ' cancelled',
      'Your booking ' || booking_reference || ' at ' || marina_name || ' has been cancelled.'
        || case when new.refund_recommendation_minor is null then '' else E'\nRefund recommendation: '
          || new.refund_recommendation_minor || ' ' || coalesce(new.currency, '') || ' minor units. Any refund is handled separately.' end
    );
  elsif tg_table_name = 'booking_berth_assignments' then
    if new.assignment_kind <> 'planned_move' and not exists (
      select 1 from public.booking_berth_assignments prior
      where prior.booking_id = new.booking_id and prior.id <> new.id and prior.ended_reason = 'reassigned'
    ) then return new; end if;
    select bookings.reference, marinas.name, berths.code into booking_reference, marina_name, berth_code
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    join public.berths berths on berths.id = new.berth_id where bookings.id = new.booking_id;
    perform private.enqueue_booking_notification(
      new.booking_id, 'berth_move_confirmation', 'berth-move:' || new.id,
      'Berth update for booking ' || booking_reference,
      'Your berth for booking ' || booking_reference || ' at ' || marina_name || ' is confirmed as '
        || berth_code || ' from ' || new.arrival_date || ' to ' || new.departure_date || '.'
    );
  elsif tg_table_name = 'booking_payment_balances' then
    if new.balance_due_minor <= 0 then return new; end if;
    if tg_op = 'UPDATE' and old.state = new.state and old.balance_due_minor = new.balance_due_minor
      and old.due_at is not distinct from new.due_at and old.payment_link_url is not distinct from new.payment_link_url then
      return new;
    end if;
    select bookings.reference, marinas.name into booking_reference, marina_name
    from public.bookings bookings join public.marinas marinas on marinas.id = bookings.marina_id
    where bookings.id = new.booking_id;
    currency_label := coalesce(new.currency, 'currency');
    perform private.enqueue_booking_notification(
      new.booking_id, 'payment_balance_reminder',
      'payment-balance:' || new.id || ':' || extract(epoch from new.updated_at)::bigint,
      'Payment balance for booking ' || booking_reference,
      'A balance of ' || new.balance_due_minor || ' ' || currency_label || ' minor units is due for booking '
        || booking_reference || ' at ' || marina_name || '.'
        || case when new.due_at is null then '' else E'\nDue: ' || new.due_at end
        || case when new.payment_link_url is null then '' else E'\nPayment link: ' || new.payment_link_url end
        || case when new.collection_method = 'on_site' then E'\nPayment will be collected on site.' else '' end
    );
  end if;
  return new;
end;
$$;

revoke all on function private.queue_operational_notification()
from public, anon, authenticated, service_role;

create trigger bookings_queue_confirmation
after insert on public.bookings for each row execute function private.queue_operational_notification();
create trigger cancellations_queue_confirmation
after insert on public.booking_cancellation_events for each row execute function private.queue_operational_notification();
create trigger assignments_queue_move_confirmation
after insert on public.booking_berth_assignments for each row execute function private.queue_operational_notification();
create trigger payment_balances_queue_reminder
after insert or update on public.booking_payment_balances for each row execute function private.queue_operational_notification();

create function public.queue_upcoming_arrival_reminders()
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  queued_count integer := 0;
  target record;
  inserted_id uuid;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
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
        || target.arrival_date || ') at ' || target.eta || ' local time (' || target.timezone || ').'
    );
    if inserted_id is not null then queued_count := queued_count + 1; end if;
  end loop;
  return queued_count;
end;
$$;

create function public.claim_notification_deliveries(
  requested_limit integer default 10,
  requested_lease_seconds integer default 120
)
returns setof public.notification_outbox
language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if requested_limit not between 1 and 50 or requested_lease_seconds not between 30 and 900 then
    raise exception 'Invalid notification claim limits.' using errcode = '22023';
  end if;
  return query
  with ready as (
    select outbox.id from public.notification_outbox outbox
    where (
      outbox.status in ('pending', 'failed') and outbox.next_attempt_at <= statement_timestamp()
    ) or (
      outbox.status = 'processing' and outbox.lease_expires_at <= statement_timestamp()
    )
    order by outbox.next_attempt_at, outbox.created_at
    limit requested_limit for update skip locked
  )
  update public.notification_outbox outbox set
    status = 'processing', attempt_count = outbox.attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = statement_timestamp() + make_interval(secs => requested_lease_seconds),
    updated_at = statement_timestamp()
  from ready where outbox.id = ready.id returning outbox.*;
end;
$$;

create function public.complete_notification_delivery(
  target_notification_id uuid,
  target_lease_token uuid,
  delivery_succeeded boolean,
  target_provider_message_id text default null,
  target_error_message text default null
)
returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  target public.notification_outbox%rowtype;
  safe_error text;
begin
  if (select auth.role()) <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  select * into target from public.notification_outbox
  where id = target_notification_id for update;
  if not found then return 'not_found'; end if;
  if target.status = 'sent' then return 'already_sent'; end if;
  if target.status <> 'processing' or target.lease_token is distinct from target_lease_token then return 'stale_claim'; end if;

  if delivery_succeeded and nullif(btrim(target_provider_message_id), '') is null then
    raise exception 'A provider message ID is required for successful delivery.' using errcode = '22023';
  elsif not delivery_succeeded and nullif(btrim(target_error_message), '') is null then
    raise exception 'An error is required for failed delivery.' using errcode = '22023';
  end if;
  safe_error := left(nullif(btrim(target_error_message), ''), 2000);

  insert into public.notification_delivery_attempts(
    notification_id, marina_id, attempt_number, outcome, provider_message_id, error_message
  ) values (
    target.id, target.marina_id, target.attempt_count,
    case when delivery_succeeded then 'sent' else 'failed' end,
    case when delivery_succeeded then btrim(target_provider_message_id) else null end,
    case when delivery_succeeded then null else safe_error end
  );

  update public.notification_outbox set
    status = case when delivery_succeeded then 'sent'::public.notification_delivery_status else 'failed'::public.notification_delivery_status end,
    sent_at = case when delivery_succeeded then statement_timestamp() else null end,
    provider_message_id = case when delivery_succeeded then btrim(target_provider_message_id) else null end,
    last_error = case when delivery_succeeded then null else safe_error end,
    next_attempt_at = case when delivery_succeeded then next_attempt_at
      else statement_timestamp() + make_interval(secs => least(3600, 30 * (2 ^ least(target.attempt_count - 1, 7))::integer)) end,
    lease_token = null, lease_expires_at = null, updated_at = statement_timestamp()
  where id = target.id;
  return case when delivery_succeeded then 'sent' else 'failed' end;
end;
$$;

revoke all on function public.queue_upcoming_arrival_reminders() from public, anon, authenticated;
revoke all on function public.claim_notification_deliveries(integer, integer) from public, anon, authenticated;
revoke all on function public.complete_notification_delivery(uuid, uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.queue_upcoming_arrival_reminders() to service_role;
grant execute on function public.claim_notification_deliveries(integer, integer) to service_role;
grant execute on function public.complete_notification_delivery(uuid, uuid, boolean, text, text) to service_role;
