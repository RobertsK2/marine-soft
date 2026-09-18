-- The privileged public page checks this before loading a berth/booking snapshot.
-- No browser role can read or update requester fingerprints.
create table public.public_availability_rate_limits (
  identity_kind text not null check (identity_kind in ('session', 'network')),
  identity_hash text not null check (identity_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  request_count integer not null check (request_count between 1 and 121),
  primary key (identity_kind, identity_hash, window_start)
);

create index public_availability_rate_limits_window_idx
  on public.public_availability_rate_limits (window_start);

alter table public.public_availability_rate_limits enable row level security;
revoke all on public.public_availability_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.public_availability_rate_limits to service_role;

create function public.allow_public_availability_check(
  request_session_hash text,
  request_network_hash text
) returns boolean
language plpgsql volatile security invoker set search_path = '' as $$
declare
  bucket timestamptz := date_trunc('minute', clock_timestamp());
  session_count integer;
  network_count integer;
begin
  if request_session_hash !~ '^[0-9a-f]{64}$'
     or request_network_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid requester fingerprint.' using errcode = '22023';
  end if;

  insert into public.public_availability_rate_limits
    (identity_kind, identity_hash, window_start, request_count)
  values ('session', request_session_hash, bucket, 1)
  on conflict (identity_kind, identity_hash, window_start)
  do update set request_count = least(public.public_availability_rate_limits.request_count + 1, 21)
  returning request_count into session_count;

  insert into public.public_availability_rate_limits
    (identity_kind, identity_hash, window_start, request_count)
  values ('network', request_network_hash, bucket, 1)
  on conflict (identity_kind, identity_hash, window_start)
  do update set request_count = least(public.public_availability_rate_limits.request_count + 1, 121)
  returning request_count into network_count;

  -- Bound table growth without putting cleanup on every request.
  if random() < 0.001 then
    delete from public.public_availability_rate_limits
    where window_start < bucket - interval '1 day';
  end if;

  return session_count <= 20 and network_count <= 120;
end;
$$;

revoke all on function public.allow_public_availability_check(text, text) from public, anon, authenticated;
grant execute on function public.allow_public_availability_check(text, text) to service_role;
