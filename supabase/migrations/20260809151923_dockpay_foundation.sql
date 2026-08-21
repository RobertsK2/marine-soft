create schema if not exists private;

revoke all on schema private from public, anon, authenticated;

create type public.organization_role as enum ('marina_admin', 'marina_staff');
create type public.membership_status as enum ('active', 'suspended');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  created_at timestamptz not null default now()
);

create table public.marinas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marinas_organization_id_idx on public.marinas (organization_id);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.organization_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx
on public.organization_members (user_id);

create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger marinas_set_updated_at
before update on public.marinas
for each row execute function private.set_updated_at();

create function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = target_organization_id
      and organization_members.user_id = (select auth.uid())
      and organization_members.status = 'active'
  );
$$;

create function private.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_members.organization_id = target_organization_id
      and organization_members.user_id = (select auth.uid())
      and organization_members.role = 'marina_admin'
      and organization_members.status = 'active'
  );
$$;

revoke all on function private.is_organization_member(uuid) from public, anon;
revoke all on function private.is_organization_admin(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.is_organization_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.marinas enable row level security;
alter table public.organization_members enable row level security;

create policy organizations_select_member
on public.organizations for select
to authenticated
using ((select private.is_organization_member(id)));

create policy organizations_update_admin
on public.organizations for update
to authenticated
using ((select private.is_organization_admin(id)))
with check ((select private.is_organization_admin(id)));

create policy marinas_select_member
on public.marinas for select
to authenticated
using ((select private.is_organization_member(organization_id)));

create policy marinas_insert_admin
on public.marinas for insert
to authenticated
with check ((select private.is_organization_admin(organization_id)));

create policy marinas_update_admin
on public.marinas for update
to authenticated
using ((select private.is_organization_admin(organization_id)))
with check ((select private.is_organization_admin(organization_id)));

create policy marinas_delete_admin
on public.marinas for delete
to authenticated
using ((select private.is_organization_admin(organization_id)));

create policy organization_members_select_self_or_admin
on public.organization_members for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_organization_admin(organization_id))
);

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.marinas from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;

grant select on table public.organizations to authenticated;
grant update (name) on table public.organizations to authenticated;
grant select, insert, delete on table public.marinas to authenticated;
grant update (name, slug, timezone) on table public.marinas to authenticated;
grant select on table public.organization_members to authenticated;

grant all on table public.organizations to service_role;
grant all on table public.marinas to service_role;
grant all on table public.organization_members to service_role;
