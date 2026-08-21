create type public.berth_status as enum (
  'available',
  'blocked',
  'out_of_service'
);

create table public.berths (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas (id) on delete cascade,
  code text not null
    constraint berths_code_length_check
    check (code = btrim(code) and char_length(code) between 1 and 32),
  zone text not null
    constraint berths_zone_length_check
    check (zone = btrim(zone) and char_length(zone) between 1 and 80),
  max_length_m numeric(6, 2) not null
    constraint berths_max_length_positive_check
    check (max_length_m > 0),
  max_beam_m numeric(6, 2) not null
    constraint berths_max_beam_positive_check
    check (max_beam_m > 0),
  max_draft_m numeric(6, 2) not null
    constraint berths_max_draft_positive_check
    check (max_draft_m > 0),
  priority smallint not null default 100
    constraint berths_priority_positive_check
    check (priority > 0),
  status public.berth_status not null default 'available',
  allow_smaller_vessels boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.berths.priority is
  'Lower positive numbers are considered first by future berth matching.';

create unique index berths_marina_code_unique_idx
on public.berths (marina_id, lower(code));

create index berths_marina_priority_code_idx
on public.berths (marina_id, priority, code);

create trigger berths_set_updated_at
before update on public.berths
for each row execute function private.set_updated_at();

create function private.is_marina_member(target_marina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marinas
    join public.organization_members
      on organization_members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id
      and organization_members.user_id = (select auth.uid())
      and organization_members.status = 'active'
  );
$$;

create function private.is_marina_admin(target_marina_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.marinas
    join public.organization_members
      on organization_members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id
      and organization_members.user_id = (select auth.uid())
      and organization_members.role = 'marina_admin'
      and organization_members.status = 'active'
  );
$$;

revoke all on function private.is_marina_member(uuid) from public, anon;
revoke all on function private.is_marina_admin(uuid) from public, anon;
grant execute on function private.is_marina_member(uuid) to authenticated;
grant execute on function private.is_marina_admin(uuid) to authenticated;

alter table public.berths enable row level security;

create policy berths_select_member
on public.berths for select
to authenticated
using ((select private.is_marina_member(marina_id)));

create policy berths_insert_admin
on public.berths for insert
to authenticated
with check ((select private.is_marina_admin(marina_id)));

create policy berths_update_admin
on public.berths for update
to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));

create policy berths_delete_admin
on public.berths for delete
to authenticated
using ((select private.is_marina_admin(marina_id)));

revoke all on table public.berths from anon, authenticated;
grant select, insert, delete on table public.berths to authenticated;
grant update (
  code,
  zone,
  max_length_m,
  max_beam_m,
  max_draft_m,
  priority,
  status,
  allow_smaller_vessels
) on table public.berths to authenticated;

grant all on table public.berths to service_role;
