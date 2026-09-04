create function private.capture_marina_publication_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_actor text := nullif(current_setting('berthio.audit_actor_id', true), '');
  event_actor_id uuid := coalesce(configured_actor::uuid, (select auth.uid()));
  event_actor_email text;
begin
  if old.is_public is not distinct from new.is_public then
    return new;
  end if;

  select users.email into event_actor_email
  from auth.users users
  where users.id = event_actor_id;

  insert into public.audit_events(
    marina_id, event_type, entity_type, entity_id, actor_id, actor_email,
    actor_type, summary, before_data, after_data, metadata
  ) values (
    new.id,
    case when new.is_public then 'marina.published' else 'marina.unpublished' end,
    'marina',
    new.id,
    event_actor_id,
    event_actor_email,
    case when event_actor_id is null then 'system' else 'member' end,
    case when new.is_public then 'Public booking page published' else 'Public booking page unpublished' end,
    jsonb_build_object('isPublic', old.is_public),
    jsonb_build_object('isPublic', new.is_public),
    jsonb_build_object('source_table', 'marinas', 'operation', 'update')
  );

  return new;
end;
$$;

revoke all on function private.capture_marina_publication_audit_event()
from public, anon, authenticated, service_role;

create trigger marinas_capture_publication_audit
after update of is_public on public.marinas
for each row
execute function private.capture_marina_publication_audit_event();

create function public.set_marina_publication_state(
  target_marina_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  requested_public boolean,
  integrations_ready boolean
)
returns table(outcome text, updated_at timestamptz, blockers text[])
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  marina_record public.marinas%rowtype;
  config_model public.pricing_model;
  readiness_blockers text[] := '{}'::text[];
  previous_actor text := current_setting('berthio.audit_actor_id', true);
begin
  select marinas.* into marina_record
  from public.marinas marinas
  where marinas.id = target_marina_id
  for update;

  if not found then
    raise exception 'Marina not found.' using errcode = 'P0002';
  end if;

  if target_actor_id is null or not exists (
    select 1
    from public.organization_members memberships
    where memberships.organization_id = marina_record.organization_id
      and memberships.user_id = target_actor_id
      and memberships.status = 'active'
      and memberships.role = 'marina_admin'
  ) then
    raise exception 'Marina admin access is required.' using errcode = '42501';
  end if;

  if expected_updated_at is distinct from marina_record.updated_at then
    return query select 'conflict'::text, marina_record.updated_at, '{}'::text[];
    return;
  end if;

  if requested_public then
    if char_length(btrim(marina_record.name)) = 0
      or char_length(btrim(marina_record.slug)) = 0
      or char_length(btrim(marina_record.timezone)) = 0
      or char_length(btrim(coalesce(marina_record.public_description, ''))) = 0 then
      readiness_blockers := array_append(readiness_blockers, 'profile');
    end if;

    select configs.model into config_model
    from public.marina_pricing_configs configs
    where configs.marina_id = target_marina_id;

    if config_model is null
      or not exists (
        select 1 from public.pricing_seasons seasons
        where seasons.marina_id = target_marina_id
      )
      or exists (
        select 1
        from public.pricing_seasons seasons
        where seasons.marina_id = target_marina_id
          and (
            (config_model = 'per_meter' and not exists (
              select 1 from public.pricing_season_meter_rates rates
              where rates.marina_id = target_marina_id and rates.season_id = seasons.id
            ))
            or
            (config_model = 'length_interval' and not exists (
              select 1 from public.pricing_season_length_rates rates
              where rates.marina_id = target_marina_id and rates.season_id = seasons.id
            ))
          )
      ) then
      readiness_blockers := array_append(readiness_blockers, 'pricing');
    end if;

    if not integrations_ready then
      readiness_blockers := array_append(readiness_blockers, 'integrations');
    end if;

    if cardinality(readiness_blockers) > 0 then
      return query select 'not_ready'::text, marina_record.updated_at, readiness_blockers;
      return;
    end if;
  end if;

  if marina_record.is_public = requested_public then
    return query select 'unchanged'::text, marina_record.updated_at, '{}'::text[];
    return;
  end if;

  perform set_config('berthio.audit_actor_id', target_actor_id::text, true);
  update public.marinas
  set is_public = requested_public
  where id = target_marina_id
  returning marinas.updated_at into marina_record.updated_at;
  perform set_config('berthio.audit_actor_id', coalesce(previous_actor, ''), true);

  return query select 'updated'::text, marina_record.updated_at, '{}'::text[];
end;
$$;

comment on function public.set_marina_publication_state(uuid, uuid, timestamptz, boolean, boolean) is
  'Service-only publication mutation. The caller must authenticate and tenant-scope target_actor_id before invoking it; persisted prerequisites are rechecked atomically.';

revoke all on function public.set_marina_publication_state(uuid, uuid, timestamptz, boolean, boolean)
from public, anon, authenticated, service_role;
grant execute on function public.set_marina_publication_state(uuid, uuid, timestamptz, boolean, boolean)
to service_role;
