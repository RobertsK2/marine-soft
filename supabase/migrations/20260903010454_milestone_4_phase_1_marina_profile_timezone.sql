alter table public.marinas
add column contact_email text,
add column contact_phone text,
add column website_url text,
add constraint marinas_contact_email_format check (
  contact_email is null
  or (
    char_length(contact_email) between 3 and 254
    and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
),
add constraint marinas_contact_phone_format check (
  contact_phone is null
  or (
    char_length(contact_phone) between 3 and 32
    and contact_phone ~ '^[+0-9 ()-]+$'
  )
),
add constraint marinas_website_url_format check (
  website_url is null
  or (
    char_length(website_url) between 1 and 2048
    and website_url ~ '^https://[^[:space:]]+$'
  )
);

create function private.validate_marina_timezone()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.timezone <> 'UTC' and not (
    new.timezone ~ '^[A-Za-z][A-Za-z0-9._+-]*/[A-Za-z0-9._+-]+(/[A-Za-z0-9._+-]+)*$'
    and exists (
      select 1
      from pg_catalog.pg_timezone_names zones
      where zones.name = new.timezone
    )
  ) then
    raise exception 'Unsupported IANA timezone.' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_marina_timezone()
from public, anon, authenticated, service_role;

create trigger marinas_validate_timezone
before insert or update of timezone on public.marinas
for each row execute function private.validate_marina_timezone();

alter table public.audit_events
drop constraint audit_events_entity_type_check,
add constraint audit_events_entity_type_check
  check (entity_type in ('booking', 'berth', 'payment', 'assignment', 'marina'));

create function private.capture_marina_profile_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_actor_id uuid := (select auth.uid());
  event_actor_email text;
  event_actor_type text := 'system';
begin
  if event_actor_id is not null then
    event_actor_type := 'member';
    select users.email
    into event_actor_email
    from auth.users users
    where users.id = event_actor_id;
  end if;

  insert into public.audit_events (
    marina_id,
    event_type,
    entity_type,
    entity_id,
    actor_id,
    actor_email,
    actor_type,
    summary,
    before_data,
    after_data,
    metadata
  ) values (
    new.id,
    'marina.profile_updated',
    'marina',
    new.id,
    event_actor_id,
    event_actor_email,
    event_actor_type,
    'Marina profile updated',
    jsonb_build_object(
      'name', old.name,
      'timezone', old.timezone,
      'public_description', old.public_description,
      'public_description_local', old.public_description_local,
      'local_language', old.local_language,
      'contact_email', old.contact_email,
      'contact_phone', old.contact_phone,
      'website_url', old.website_url
    ),
    jsonb_build_object(
      'name', new.name,
      'timezone', new.timezone,
      'public_description', new.public_description,
      'public_description_local', new.public_description_local,
      'local_language', new.local_language,
      'contact_email', new.contact_email,
      'contact_phone', new.contact_phone,
      'website_url', new.website_url
    ),
    jsonb_build_object('source_table', 'marinas', 'operation', 'update')
  );

  return new;
end;
$$;

revoke all on function private.capture_marina_profile_audit_event()
from public, anon, authenticated, service_role;

create trigger marinas_capture_profile_audit
after update of
  name,
  timezone,
  public_description,
  public_description_local,
  local_language,
  contact_email,
  contact_phone,
  website_url
on public.marinas
for each row
when (
  old.name is distinct from new.name
  or old.timezone is distinct from new.timezone
  or old.public_description is distinct from new.public_description
  or old.public_description_local is distinct from new.public_description_local
  or old.local_language is distinct from new.local_language
  or old.contact_email is distinct from new.contact_email
  or old.contact_phone is distinct from new.contact_phone
  or old.website_url is distinct from new.website_url
)
execute function private.capture_marina_profile_audit_event();

grant update (
  name,
  timezone,
  public_description,
  public_description_local,
  local_language,
  contact_email,
  contact_phone,
  website_url
) on public.marinas to authenticated;

grant select (
  contact_email,
  contact_phone,
  website_url
) on public.marinas to anon;
