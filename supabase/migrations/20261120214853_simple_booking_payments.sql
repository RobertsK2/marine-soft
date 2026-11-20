create table private.manual_booking_requests (
  marina_id uuid not null,
  actor_id uuid not null,
  request_id uuid not null,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  fingerprint bytea not null,
  primary key (marina_id, actor_id, request_id)
);
alter table private.manual_booking_requests enable row level security;
revoke all on private.manual_booking_requests from public, anon, authenticated, service_role;
grant select, insert on private.manual_booking_requests to service_role;
create index manual_booking_requests_booking_idx on private.manual_booking_requests(booking_id);

-- The app supplies the actor from the authenticated session after enforcing MFA.
-- Check live marina membership again before any privileged database write.
create function private.booking_payment_actor_timezone(target_marina_id uuid, target_actor_id uuid, admin_only boolean)
returns text language sql stable security invoker set search_path = '' as $$
  select marina.timezone from public.marinas marina
  join public.organization_members member on member.organization_id = marina.organization_id
  where marina.id = target_marina_id and member.user_id = target_actor_id and member.status = 'active'
    and (member.role = 'marina_admin' or (not admin_only and member.role = 'marina_staff'));
$$;
revoke all on function private.booking_payment_actor_timezone(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function private.booking_payment_actor_timezone(uuid, uuid, boolean) to service_role;

create function public.create_manual_booking_with_balance(
  target_marina_id uuid, target_actor_id uuid, requested_request_id uuid,
  requested_booking jsonb, requested_total_minor bigint
) returns table(outcome text, booking_id uuid)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  marina_timezone text := private.booking_payment_actor_timezone(target_marina_id, target_actor_id, false);
  previous_request private.manual_booking_requests%rowtype;
  input public.bookings%rowtype;
  created_booking_id uuid;
  request_fingerprint bytea;
  previous_audit_actor text;
begin
  if marina_timezone is null then return query select 'unauthorized', null::uuid; return; end if;
  if requested_request_id is null or requested_total_minor is null
    or requested_total_minor not between 1 and 9007199254740991
    or jsonb_typeof(requested_booking) is distinct from 'object' then
    return query select 'invalid_input', null::uuid; return;
  end if;

  request_fingerprint := sha256(convert_to(jsonb_build_array(requested_booking, requested_total_minor)::text, 'UTF8'));
  -- Serialize both retries and capacity decisions with public checkout.
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));
  select requests.* into previous_request from private.manual_booking_requests requests
  where requests.marina_id = target_marina_id and requests.actor_id = target_actor_id
    and requests.request_id = requested_request_id;
  if found then
    if previous_request.fingerprint = request_fingerprint then
      return query select 'existing', previous_request.booking_id;
    else
      return query select 'idempotency_conflict', null::uuid;
    end if;
    return;
  end if;

  input := jsonb_populate_record(null::public.bookings, requested_booking);
  if not private.capacity_is_available(target_marina_id, input.arrival_date, input.departure_date,
    input.vessel_length_m, input.vessel_beam_m, input.vessel_draft_m, null) then
    return query select 'unavailable', null::uuid; return;
  end if;

  previous_audit_actor := current_setting('berthio.audit_actor_id', true);
  perform set_config('berthio.audit_actor_id', target_actor_id::text, true);
  insert into public.bookings(marina_id, arrival_date, departure_date, eta, etd,
    customer_name, customer_email, customer_phone, vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m)
  values(target_marina_id, input.arrival_date, input.departure_date, input.eta, input.etd,
    input.customer_name, input.customer_email, input.customer_phone, input.vessel_name,
    input.vessel_length_m, input.vessel_beam_m, input.vessel_draft_m)
  returning id into created_booking_id;
  perform set_config('berthio.audit_actor_id', coalesce(previous_audit_actor, ''), true);

  insert into public.booking_payment_balances(marina_id, booking_id, state, collection_method,
    currency, total_due_minor, paid_minor, balance_due_minor, due_at, updated_by)
  values(target_marina_id, created_booking_id, 'balance_due', 'on_site',
    'EUR', requested_total_minor, 0, requested_total_minor,
    (input.arrival_date + input.eta) at time zone marina_timezone, target_actor_id);
  insert into private.manual_booking_requests(marina_id, actor_id, request_id, booking_id, fingerprint)
  values(target_marina_id, target_actor_id, requested_request_id, created_booking_id, request_fingerprint);
  return query select 'created', created_booking_id;
end;
$$;

create function public.initialize_manual_booking_balance(
  target_marina_id uuid, target_booking_id uuid, target_actor_id uuid, requested_total_minor bigint
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  marina_timezone text := private.booking_payment_actor_timezone(target_marina_id, target_actor_id, true);
  booking public.bookings%rowtype;
begin
  if marina_timezone is null then return 'unauthorized'; end if;
  if requested_total_minor is null or requested_total_minor not between 1 and 9007199254740991 then
    return 'invalid_input';
  end if;
  select * into booking from public.bookings
  where id = target_booking_id and marina_id = target_marina_id for update;
  if not found then return 'not_found'; end if;
  if booking.source <> 'manual' or booking.booking_payment_id is not null or booking.status = 'cancelled' then
    return 'ineligible';
  end if;

  insert into public.booking_payment_balances(marina_id, booking_id, state, collection_method,
    currency, total_due_minor, paid_minor, balance_due_minor, due_at, updated_by)
  values(target_marina_id, target_booking_id, 'balance_due', 'on_site', 'EUR', requested_total_minor,
    0, requested_total_minor, (booking.arrival_date + booking.eta) at time zone marina_timezone, target_actor_id)
  on conflict (booking_id) do nothing;
  if found then return 'initialized'; end if;
  return 'already_initialized';
end;
$$;

create function public.update_booking_payment_settings(
  target_marina_id uuid, target_booking_id uuid, target_actor_id uuid,
  requested_payment_link text, requested_due_at timestamp without time zone
) returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  marina_timezone text := private.booking_payment_actor_timezone(target_marina_id, target_actor_id, true);
  balance public.booking_payment_balances%rowtype;
  payment_link text := nullif(btrim(requested_payment_link), '');
  payment_due timestamptz;
begin
  if marina_timezone is null then return 'unauthorized'; end if;
  -- Match the lock order of receipt recording and cancellation.
  perform 1 from public.bookings where id = target_booking_id and marina_id = target_marina_id for update;
  if not found then return 'not_found'; end if;
  select * into balance from public.booking_payment_balances
  where booking_id = target_booking_id and marina_id = target_marina_id for update;
  if not found then return 'balance_required'; end if;
  if payment_link is distinct from balance.payment_link_url and payment_link is not null
    and (length(payment_link) > 2048 or
      payment_link !~* '^https://([a-z0-9]([a-z0-9.-]*[a-z0-9])?|\[[0-9a-f:]+\])(:[0-9]{1,5})?([/?#][^[:space:]\\]*)?$') then
    return 'invalid_link';
  end if;

  if requested_due_at is not null and not isfinite(requested_due_at) then return 'invalid_due_at'; end if;
  if requested_due_at is not distinct from date_trunc('minute', balance.due_at at time zone marina_timezone) then
    -- Preserve the exact stored instant, including ambiguous local DST times.
    payment_due := balance.due_at;
  elsif requested_due_at is not null then
    payment_due := requested_due_at at time zone marina_timezone;
    if payment_due at time zone marina_timezone <> requested_due_at then return 'invalid_due_at'; end if;
  end if;
  if payment_link is not distinct from balance.payment_link_url and payment_due is not distinct from balance.due_at then
    return 'unchanged';
  end if;

  update public.booking_payment_balances
  set payment_link_url = payment_link, due_at = payment_due, updated_by = target_actor_id
  where id = balance.id;
  return 'updated';
end;
$$;

revoke all on function public.create_manual_booking_with_balance(uuid, uuid, uuid, jsonb, bigint),
  public.initialize_manual_booking_balance(uuid, uuid, uuid, bigint),
  public.update_booking_payment_settings(uuid, uuid, uuid, text, timestamp without time zone)
from public, anon, authenticated;
grant execute on function public.create_manual_booking_with_balance(uuid, uuid, uuid, jsonb, bigint),
  public.initialize_manual_booking_balance(uuid, uuid, uuid, bigint),
  public.update_booking_payment_settings(uuid, uuid, uuid, text, timestamp without time zone)
to service_role;
