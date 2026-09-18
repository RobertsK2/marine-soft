-- Keep membership/tenant checks anchored in the database, including calls
-- made through the Data API and SECURITY DEFINER RPCs. Missing AAL is AAL1.
create function private.mfa_allows_role(actor_role public.organization_role)
returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce(actor_role = 'marina_staff'
    or (actor_role = 'marina_admin' and (select auth.jwt()->>'aal') = 'aal2'), false);
$$;

revoke all on function private.mfa_allows_role(public.organization_role)
from public, anon, authenticated;

comment on function private.mfa_allows_role(public.organization_role) is
  'Admin authorization requires a signed AAL2 claim, including before enrollment. Staff retain AAL1 access. Called only by the tenant membership helpers; no client-controlled role or metadata is trusted.';

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members members
    where members.organization_id = target_organization_id
      and members.user_id = (select auth.uid())
      and members.status = 'active'
      and private.mfa_allows_role(members.role)
  );
$$;

create or replace function private.is_organization_admin(target_organization_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members members
    where members.organization_id = target_organization_id
      and members.user_id = (select auth.uid())
      and members.role = 'marina_admin'
      and members.status = 'active'
      and private.mfa_allows_role(members.role)
  );
$$;

create or replace function private.is_marina_member(target_marina_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.marinas marina
    join public.organization_members members
      on members.organization_id = marina.organization_id
    where marina.id = target_marina_id
      and members.user_id = (select auth.uid())
      and members.status = 'active'
      and private.mfa_allows_role(members.role)
  );
$$;

create or replace function private.is_marina_admin(target_marina_id uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.marinas marina
    join public.organization_members members
      on members.organization_id = marina.organization_id
    where marina.id = target_marina_id
      and members.user_id = (select auth.uid())
      and members.role = 'marina_admin'
      and members.status = 'active'
      and private.mfa_allows_role(members.role)
  );
$$;
