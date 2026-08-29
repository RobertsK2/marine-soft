create table public.guest_booking_access_grants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  issued_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  constraint guest_booking_access_grants_expiry_check check (expires_at > issued_at),
  constraint guest_booking_access_grants_revocation_check check (
    revoked_at is null or revoked_at >= issued_at
  )
);

comment on table public.guest_booking_access_grants is
  'Server-only capability grants. The URL token is signed by the application and is never stored.';

create unique index guest_booking_access_one_active_idx
on public.guest_booking_access_grants (booking_id)
where revoked_at is null;

create index guest_booking_access_expiry_idx
on public.guest_booking_access_grants (expires_at)
where revoked_at is null;

alter table public.guest_booking_access_grants enable row level security;
revoke all on table public.guest_booking_access_grants from public, anon, authenticated;
grant all on table public.guest_booking_access_grants to service_role;

create function public.ensure_guest_booking_access(
  target_booking_id uuid,
  requested_ttl interval default interval '30 days'
)
returns table (grant_id uuid, expires_at timestamptz)
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if requested_ttl < interval '1 hour' or requested_ttl > interval '90 days' then
    raise exception 'Guest access duration must be between 1 hour and 90 days.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_booking_id::text, 0));

  if not exists (
    select 1
    from public.bookings bookings
    join public.booking_payments payments on payments.id = bookings.booking_payment_id
    where bookings.id = target_booking_id
      and bookings.source = 'online'
      and payments.status = 'paid'
  ) then
    return;
  end if;

  update public.guest_booking_access_grants grants
  set revoked_at = statement_timestamp()
  where grants.booking_id = target_booking_id
    and grants.revoked_at is null
    and grants.expires_at <= statement_timestamp();

  return query
  select grants.id, grants.expires_at
  from public.guest_booking_access_grants grants
  where grants.booking_id = target_booking_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp();

  if found then return; end if;

  return query
  insert into public.guest_booking_access_grants (booking_id, expires_at)
  values (target_booking_id, statement_timestamp() + requested_ttl)
  returning id, guest_booking_access_grants.expires_at;
end $$;

create function public.rotate_guest_booking_access(
  target_booking_id uuid,
  requested_ttl interval default interval '30 days'
)
returns table (grant_id uuid, expires_at timestamptz)
language plpgsql volatile security invoker set search_path = '' as $$
begin
  if requested_ttl < interval '1 hour' or requested_ttl > interval '90 days' then
    raise exception 'Guest access duration must be between 1 hour and 90 days.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_booking_id::text, 0));

  if not exists (select 1 from public.bookings where id = target_booking_id) then
    return;
  end if;

  update public.guest_booking_access_grants
  set revoked_at = statement_timestamp()
  where booking_id = target_booking_id and revoked_at is null;

  return query
  insert into public.guest_booking_access_grants (booking_id, expires_at)
  values (target_booking_id, statement_timestamp() + requested_ttl)
  returning id, guest_booking_access_grants.expires_at;
end $$;

create function public.revoke_guest_booking_access(target_grant_id uuid)
returns boolean
language plpgsql volatile security invoker set search_path = '' as $$
begin
  update public.guest_booking_access_grants
  set revoked_at = statement_timestamp()
  where id = target_grant_id and revoked_at is null;
  return found;
end $$;

create function public.get_guest_booking(target_grant_id uuid)
returns table (
  booking_reference text,
  marina_name text,
  arrival_date date,
  departure_date date,
  eta time without time zone,
  etd time without time zone,
  vessel_name text,
  vessel_length_m numeric,
  vessel_beam_m numeric,
  vessel_draft_m numeric,
  price_total_minor bigint,
  price_currency text,
  booking_status public.booking_status,
  access_expires_at timestamptz
)
language sql stable security invoker set search_path = '' as $$
  select
    bookings.reference,
    marinas.name,
    bookings.arrival_date,
    bookings.departure_date,
    bookings.eta,
    bookings.etd,
    bookings.vessel_name,
    bookings.vessel_length_m,
    bookings.vessel_beam_m,
    bookings.vessel_draft_m,
    bookings.price_total_minor,
    bookings.price_currency,
    bookings.status,
    grants.expires_at
  from public.guest_booking_access_grants grants
  join public.bookings bookings on bookings.id = grants.booking_id
  join public.marinas marinas on marinas.id = bookings.marina_id
  where grants.id = target_grant_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp();
$$;

create function public.update_guest_booking_times(
  target_grant_id uuid,
  requested_eta time without time zone,
  requested_etd time without time zone
)
returns boolean
language plpgsql volatile security invoker set search_path = '' as $$
declare target_booking_id uuid;
begin
  select grants.booking_id into target_booking_id
  from public.guest_booking_access_grants grants
  where grants.id = target_grant_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp()
  for update;

  if target_booking_id is null then return false; end if;

  update public.bookings
  set eta = requested_eta, etd = requested_etd
  where id = target_booking_id and status = 'confirmed';
  return found;
end $$;

revoke all on function public.ensure_guest_booking_access(uuid, interval) from public, anon, authenticated;
revoke all on function public.rotate_guest_booking_access(uuid, interval) from public, anon, authenticated;
revoke all on function public.revoke_guest_booking_access(uuid) from public, anon, authenticated;
revoke all on function public.get_guest_booking(uuid) from public, anon, authenticated;
revoke all on function public.update_guest_booking_times(uuid, time without time zone, time without time zone) from public, anon, authenticated;

grant execute on function public.ensure_guest_booking_access(uuid, interval) to service_role;
grant execute on function public.rotate_guest_booking_access(uuid, interval) to service_role;
grant execute on function public.revoke_guest_booking_access(uuid) to service_role;
grant execute on function public.get_guest_booking(uuid) to service_role;
grant execute on function public.update_guest_booking_times(uuid, time without time zone, time without time zone) to service_role;
