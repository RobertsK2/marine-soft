alter table public.audit_events
drop constraint audit_events_entity_type_check,
add constraint audit_events_entity_type_check
  check (entity_type in ('booking', 'berth', 'payment', 'assignment', 'marina', 'pricing', 'cancellation_policy', 'integration'));

create function private.capture_stripe_account_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_actor_id uuid := (select auth.uid());
  event_actor_email text;
begin
  if event_actor_id is not null then
    select users.email into event_actor_email
    from auth.users users
    where users.id = event_actor_id;
  end if;

  insert into public.audit_events(
    marina_id, event_type, entity_type, entity_id, actor_id, actor_email,
    actor_type, summary, before_data, after_data, metadata
  ) values (
    new.id, 'integration.stripe_account_changed', 'integration', new.id,
    event_actor_id, event_actor_email,
    case when event_actor_id is null then 'system' else 'member' end,
    'Stripe Connect account configuration changed',
    jsonb_build_object('configured', old.stripe_account_id is not null),
    jsonb_build_object('configured', new.stripe_account_id is not null),
    jsonb_build_object(
      'integration', 'stripe_connect',
      'source_table', 'marinas',
      'operation', 'update',
      'configuration_change', case
        when old.stripe_account_id is null then 'configured'
        when new.stripe_account_id is null then 'removed'
        else 'replaced'
      end
    )
  );
  return new;
end;
$$;

revoke all on function private.capture_stripe_account_audit_event()
from public, anon, authenticated, service_role;

create trigger marinas_capture_stripe_account_audit
after update of stripe_account_id on public.marinas
for each row
when (old.stripe_account_id is distinct from new.stripe_account_id)
execute function private.capture_stripe_account_audit_event();

create function public.get_marina_integration_health(target_marina_id uuid)
returns table(
  stripe_webhook_event_count bigint,
  latest_stripe_webhook_at timestamptz,
  latest_stripe_webhook_outcome text,
  pending_payment_count bigint,
  failed_payment_count bigint,
  pending_notification_count bigint,
  processing_notification_count bigint,
  failed_notification_count bigint,
  sent_notification_count bigint,
  latest_notification_attempt_at timestamptz,
  latest_notification_attempt_outcome text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.is_marina_admin(target_marina_id)) then
    raise exception 'Marina admin access is required.' using errcode = '42501';
  end if;

  return query
  select
    (select count(*)
      from public.stripe_webhook_events events
      where exists (
        select 1 from public.booking_payments payments
        where payments.marina_id = target_marina_id
          and payments.stripe_account_id = events.stripe_account_id
          and payments.stripe_checkout_session_id = events.stripe_checkout_session_id
      )),
    (select events.processed_at
      from public.stripe_webhook_events events
      where exists (
        select 1 from public.booking_payments payments
        where payments.marina_id = target_marina_id
          and payments.stripe_account_id = events.stripe_account_id
          and payments.stripe_checkout_session_id = events.stripe_checkout_session_id
      )
      order by events.processed_at desc, events.stripe_event_id desc limit 1),
    (select events.outcome
      from public.stripe_webhook_events events
      where exists (
        select 1 from public.booking_payments payments
        where payments.marina_id = target_marina_id
          and payments.stripe_account_id = events.stripe_account_id
          and payments.stripe_checkout_session_id = events.stripe_checkout_session_id
      )
      order by events.processed_at desc, events.stripe_event_id desc limit 1),
    (select count(*) from public.booking_payments payments
      where payments.marina_id = target_marina_id and payments.status = 'pending'),
    (select count(*) from public.booking_payments payments
      where payments.marina_id = target_marina_id and payments.status in ('failed', 'expired')),
    (select count(*) from public.notification_outbox outbox
      where outbox.marina_id = target_marina_id and outbox.status = 'pending'),
    (select count(*) from public.notification_outbox outbox
      where outbox.marina_id = target_marina_id and outbox.status = 'processing'),
    (select count(*) from public.notification_outbox outbox
      where outbox.marina_id = target_marina_id and outbox.status = 'failed'),
    (select count(*) from public.notification_outbox outbox
      where outbox.marina_id = target_marina_id and outbox.status = 'sent'),
    (select attempts.completed_at from public.notification_delivery_attempts attempts
      where attempts.marina_id = target_marina_id
      order by attempts.completed_at desc, attempts.id desc limit 1),
    (select attempts.outcome::text from public.notification_delivery_attempts attempts
      where attempts.marina_id = target_marina_id
      order by attempts.completed_at desc, attempts.id desc limit 1);
end;
$$;

comment on function public.get_marina_integration_health(uuid) is
  'Returns tenant-scoped operational counts and timestamps for an authenticated marina admin. No credentials or provider identifiers are returned.';

revoke all on function public.get_marina_integration_health(uuid)
from public, anon, authenticated, service_role;
grant execute on function public.get_marina_integration_health(uuid)
to authenticated;
