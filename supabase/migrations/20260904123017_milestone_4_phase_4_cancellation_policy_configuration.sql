alter table public.audit_events
drop constraint audit_events_entity_type_check,
add constraint audit_events_entity_type_check
  check (entity_type in ('booking', 'berth', 'payment', 'assignment', 'marina', 'pricing', 'cancellation_policy'));

create table public.marina_cancellation_policies (
  marina_id uuid primary key references public.marinas(id) on delete cascade,
  evaluation_rule text not null default 'active_at_evaluation'
    constraint marina_cancellation_policies_evaluation_rule_check
    check (evaluation_rule = 'active_at_evaluation'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

comment on table public.marina_cancellation_policies is
  'Marina-owned cancellation policy. The active tiers are evaluated again at preview and confirmation time.';

create table public.marina_cancellation_policy_tiers (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marina_cancellation_policies(marina_id) on delete cascade,
  policy_code text not null constraint marina_cancellation_policy_tiers_code_check
    check (policy_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  min_days_before_arrival integer,
  max_days_before_arrival integer,
  refund_percent smallint not null constraint marina_cancellation_policy_tiers_percent_check
    check (refund_percent between 0 and 100),
  sort_order smallint not null constraint marina_cancellation_policy_tiers_sort_check
    check (sort_order between 1 and 20),
  constraint marina_cancellation_policy_tiers_bounds_check check (
    (min_days_before_arrival is null or min_days_before_arrival between -36500 and 36500)
    and (max_days_before_arrival is null or max_days_before_arrival between -36500 and 36500)
    and (min_days_before_arrival is null or max_days_before_arrival is null
      or min_days_before_arrival <= max_days_before_arrival)
  ),
  constraint marina_cancellation_policy_tiers_code_unique unique (marina_id, policy_code),
  constraint marina_cancellation_policy_tiers_sort_unique unique (marina_id, sort_order),
  constraint marina_cancellation_policy_tiers_no_overlap exclude using gist (
    marina_id with =,
    int4range(min_days_before_arrival, case when max_days_before_arrival is null then null else max_days_before_arrival + 1 end, '[)') with &&
  )
);

comment on table public.marina_cancellation_policy_tiers is
  'Complete, non-overlapping day ranges and refund recommendation percentages. Changes never issue a refund.';

create index marina_cancellation_policy_tiers_lookup_idx
on public.marina_cancellation_policy_tiers(marina_id, min_days_before_arrival, max_days_before_arrival);

create trigger marina_cancellation_policies_set_updated_at
before update on public.marina_cancellation_policies
for each row execute function private.set_updated_at();

create function private.insert_default_cancellation_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.marina_cancellation_policies(marina_id) values (new.id);
  insert into public.marina_cancellation_policy_tiers(
    marina_id, policy_code, min_days_before_arrival, max_days_before_arrival, refund_percent, sort_order
  ) values
    (new.id, 'no_refund_under_2_days', null, 1, 0, 1),
    (new.id, 'partial_refund_2_to_6_days', 2, 6, 50, 2),
    (new.id, 'full_refund_7_days', 7, null, 100, 3);
  return new;
end;
$$;

revoke all on function private.insert_default_cancellation_policy()
from public, anon, authenticated, service_role;

create trigger marinas_insert_default_cancellation_policy
after insert on public.marinas
for each row execute function private.insert_default_cancellation_policy();

insert into public.marina_cancellation_policies(marina_id)
select marinas.id from public.marinas marinas
on conflict (marina_id) do nothing;

insert into public.marina_cancellation_policy_tiers(
  marina_id, policy_code, min_days_before_arrival, max_days_before_arrival, refund_percent, sort_order
)
select policies.marina_id, defaults.policy_code, defaults.min_days, defaults.max_days,
  defaults.refund_percent, defaults.sort_order
from public.marina_cancellation_policies policies
cross join (values
  ('no_refund_under_2_days', null::integer, 1, 0::smallint, 1::smallint),
  ('partial_refund_2_to_6_days', 2, 6, 50::smallint, 2::smallint),
  ('full_refund_7_days', 7, null::integer, 100::smallint, 3::smallint)
) defaults(policy_code, min_days, max_days, refund_percent, sort_order)
where not exists (
  select 1 from public.marina_cancellation_policy_tiers tiers
  where tiers.marina_id = policies.marina_id
);

alter table public.marina_cancellation_policies enable row level security;
alter table public.marina_cancellation_policy_tiers enable row level security;

create policy marina_cancellation_policies_select_admin
on public.marina_cancellation_policies for select to authenticated
using ((select private.is_marina_admin(marina_id)));
create policy marina_cancellation_policy_tiers_select_admin
on public.marina_cancellation_policy_tiers for select to authenticated
using ((select private.is_marina_admin(marina_id)));

revoke all on table public.marina_cancellation_policies from public, anon, authenticated;
revoke all on table public.marina_cancellation_policy_tiers from public, anon, authenticated;
grant select on table public.marina_cancellation_policies to authenticated;
grant select on table public.marina_cancellation_policy_tiers to authenticated;
grant all on table public.marina_cancellation_policies to service_role;
grant all on table public.marina_cancellation_policy_tiers to service_role;

create function private.cancellation_policy_snapshot(target_marina_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when policies.marina_id is null then null else jsonb_build_object(
    'evaluationRule', policies.evaluation_rule,
    'tiers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'policyCode', tiers.policy_code,
        'minDaysBeforeArrival', tiers.min_days_before_arrival,
        'maxDaysBeforeArrival', tiers.max_days_before_arrival,
        'refundPercent', tiers.refund_percent
      ) order by tiers.sort_order)
      from public.marina_cancellation_policy_tiers tiers
      where tiers.marina_id = target_marina_id
    ), '[]'::jsonb)
  ) end
  from (select target_marina_id as requested_marina_id) requested
  left join public.marina_cancellation_policies policies
    on policies.marina_id = requested.requested_marina_id;
$$;

revoke all on function private.cancellation_policy_snapshot(uuid)
from public, anon, authenticated, service_role;

create function public.replace_marina_cancellation_policy(
  target_marina_id uuid,
  expected_updated_at timestamptz,
  requested_policy jsonb
)
returns table(outcome text, updated_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
  caller_email text;
  current_updated_at timestamptz;
  old_policy jsonb;
  new_policy jsonb;
  tier jsonb;
  tier_number integer;
  tier_count integer;
  tier_min integer;
  tier_max integer;
  previous_max integer;
begin
  if caller_id is null or not (select private.is_marina_admin(target_marina_id)) then
    raise exception 'Marina admin access is required.' using errcode = '42501';
  end if;

  select policies.updated_at into current_updated_at
  from public.marina_cancellation_policies policies
  where policies.marina_id = target_marina_id
  for update;
  if not found then
    raise exception 'Cancellation policy is not configured.' using errcode = 'P0002';
  end if;
  if expected_updated_at is distinct from current_updated_at then
    return query select 'conflict'::text, current_updated_at;
    return;
  end if;

  if jsonb_typeof(requested_policy) <> 'object'
    or requested_policy ->> 'evaluationRule' <> 'active_at_evaluation'
    or jsonb_typeof(requested_policy -> 'tiers') <> 'array' then
    raise exception 'Cancellation policy format is invalid.' using errcode = '22023';
  end if;
  tier_count := jsonb_array_length(requested_policy -> 'tiers');
  if tier_count not between 1 and 20 then
    raise exception 'Cancellation policy requires between 1 and 20 tiers.' using errcode = '22023';
  end if;
  if (
    select count(*) <> count(distinct value ->> 'policyCode')
    from jsonb_array_elements(requested_policy -> 'tiers')
  ) then
    raise exception 'Cancellation policy codes must be unique.' using errcode = '22023';
  end if;

  for tier, tier_number in
    select value, ordinality::integer
    from jsonb_array_elements(requested_policy -> 'tiers') with ordinality
  loop
    if jsonb_typeof(tier) <> 'object'
      or coalesce(tier ->> 'policyCode', '') !~ '^[a-z][a-z0-9_]{0,79}$'
      or not (tier ? 'minDaysBeforeArrival')
      or not (tier ? 'maxDaysBeforeArrival')
      or jsonb_typeof(tier -> 'refundPercent') <> 'number'
      or coalesce(tier ->> 'refundPercent', '') !~ '^\d+$'
      or (tier ->> 'refundPercent')::numeric not between 0 and 100 then
      raise exception 'Cancellation tier % has an invalid code or refund percentage.', tier_number using errcode = '22023';
    end if;

    if jsonb_typeof(tier -> 'minDaysBeforeArrival') = 'null' then
      tier_min := null;
    elsif jsonb_typeof(tier -> 'minDaysBeforeArrival') = 'number'
      and tier ->> 'minDaysBeforeArrival' ~ '^-?\d+$'
      and (tier ->> 'minDaysBeforeArrival')::numeric between -36500 and 36500 then
      tier_min := (tier ->> 'minDaysBeforeArrival')::integer;
    else
      raise exception 'Cancellation tier % has an invalid minimum day threshold.', tier_number using errcode = '22023';
    end if;
    if jsonb_typeof(tier -> 'maxDaysBeforeArrival') = 'null' then
      tier_max := null;
    elsif jsonb_typeof(tier -> 'maxDaysBeforeArrival') = 'number'
      and tier ->> 'maxDaysBeforeArrival' ~ '^-?\d+$'
      and (tier ->> 'maxDaysBeforeArrival')::numeric between -36500 and 36500 then
      tier_max := (tier ->> 'maxDaysBeforeArrival')::integer;
    else
      raise exception 'Cancellation tier % has an invalid maximum day threshold.', tier_number using errcode = '22023';
    end if;

    if tier_number = 1 and tier_min is not null then
      raise exception 'The first cancellation tier must have no minimum day threshold.' using errcode = '22023';
    elsif tier_number > 1 and (previous_max is null or tier_min is distinct from previous_max + 1) then
      raise exception 'Cancellation tiers must be ordered, contiguous, and non-overlapping.' using errcode = '22023';
    end if;
    if tier_min is not null and tier_max is not null and tier_min > tier_max then
      raise exception 'A cancellation tier has reversed day thresholds.' using errcode = '22023';
    end if;
    if tier_number < tier_count and tier_max is null then
      raise exception 'Only the final cancellation tier may have no maximum threshold.' using errcode = '22023';
    elsif tier_number = tier_count and tier_max is not null then
      raise exception 'The final cancellation tier must have no maximum day threshold.' using errcode = '22023';
    end if;
    previous_max := tier_max;
  end loop;

  old_policy := private.cancellation_policy_snapshot(target_marina_id);
  new_policy := jsonb_build_object(
    'evaluationRule', 'active_at_evaluation',
    'tiers', (
      select jsonb_agg(jsonb_build_object(
        'policyCode', value ->> 'policyCode',
        'minDaysBeforeArrival', value -> 'minDaysBeforeArrival',
        'maxDaysBeforeArrival', value -> 'maxDaysBeforeArrival',
        'refundPercent', (value ->> 'refundPercent')::integer
      ) order by ordinality)
      from jsonb_array_elements(requested_policy -> 'tiers') with ordinality
    )
  );
  if old_policy = new_policy then
    return query select 'unchanged'::text, current_updated_at;
    return;
  end if;

  delete from public.marina_cancellation_policy_tiers
  where marina_id = target_marina_id;
  insert into public.marina_cancellation_policy_tiers(
    marina_id, policy_code, min_days_before_arrival, max_days_before_arrival, refund_percent, sort_order
  )
  select target_marina_id, value ->> 'policyCode',
    case when jsonb_typeof(value -> 'minDaysBeforeArrival') = 'null' then null else (value ->> 'minDaysBeforeArrival')::integer end,
    case when jsonb_typeof(value -> 'maxDaysBeforeArrival') = 'null' then null else (value ->> 'maxDaysBeforeArrival')::integer end,
    (value ->> 'refundPercent')::smallint, ordinality::smallint
  from jsonb_array_elements(requested_policy -> 'tiers') with ordinality;
  update public.marina_cancellation_policies
  set evaluation_rule = 'active_at_evaluation'
  where marina_id = target_marina_id
  returning marina_cancellation_policies.updated_at into current_updated_at;

  select users.email into caller_email from auth.users users where users.id = caller_id;
  insert into public.audit_events(
    marina_id, event_type, entity_type, entity_id, actor_id, actor_email,
    actor_type, summary, before_data, after_data, metadata
  ) values (
    target_marina_id, 'cancellation_policy.configuration_updated', 'cancellation_policy', target_marina_id,
    caller_id, caller_email, 'member', 'Cancellation policy configuration updated',
    old_policy, new_policy, jsonb_build_object('evaluation_rule', 'active_at_evaluation')
  );

  return query select 'updated'::text, current_updated_at;
end;
$$;

revoke all on function public.replace_marina_cancellation_policy(uuid, timestamptz, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.replace_marina_cancellation_policy(uuid, timestamptz, jsonb)
to authenticated;

create or replace function public.preview_booking_cancellation(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz
)
returns table (
  outcome text,
  booking_status public.booking_status,
  policy_code text,
  refund_percent smallint,
  refund_recommendation_minor bigint,
  paid_total_minor bigint,
  currency text,
  assignment_count integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  latest_adjustment public.booking_price_adjustments%rowtype;
  paid_total bigint;
  percent smallint;
  code text;
  days_until integer;
begin
  if not exists (
    select 1 from public.marinas marinas
    join public.organization_members members on members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id and members.user_id = target_actor_id
      and members.status = 'active' and members.role in ('marina_admin', 'marina_staff')
  ) then
    return query select 'unauthorized', null::public.booking_status, null::text, null::smallint,
      null::bigint, null::bigint, null::text, 0;
    return;
  end if;

  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id;
  if not found then
    return query select 'not_found', null::public.booking_status, null::text, null::smallint,
      null::bigint, null::bigint, null::text, 0;
    return;
  end if;
  if target_booking.updated_at is distinct from expected_updated_at then
    return query select 'stale', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;
  if target_booking.status = 'cancelled' then
    return query select 'already_cancelled', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;
  if target_booking.status <> 'confirmed' then
    return query select 'not_cancellable', target_booking.status, null::text, null::smallint,
      null::bigint, null::bigint, target_booking.price_currency, 0;
    return;
  end if;

  select adjustments.* into latest_adjustment
  from public.booking_price_adjustments adjustments
  where adjustments.booking_id = target_booking.id
  order by adjustments.changed_at desc, adjustments.id desc limit 1;
  paid_total := coalesce(latest_adjustment.revised_price_total_minor, target_booking.price_total_minor);
  days_until := target_booking.arrival_date - current_date;
  select tiers.refund_percent, tiers.policy_code into percent, code
  from public.marina_cancellation_policies policies
  join public.marina_cancellation_policy_tiers tiers on tiers.marina_id = policies.marina_id
  where policies.marina_id = target_marina_id
    and policies.evaluation_rule = 'active_at_evaluation'
    and (tiers.min_days_before_arrival is null or days_until >= tiers.min_days_before_arrival)
    and (tiers.max_days_before_arrival is null or days_until <= tiers.max_days_before_arrival)
  order by tiers.sort_order
  limit 1;
  if not found then
    return query select 'policy_unavailable', target_booking.status, null::text, null::smallint,
      null::bigint, paid_total, target_booking.price_currency, 0;
    return;
  end if;

  return query select 'ready', target_booking.status, code, percent,
    case when paid_total is null then null else floor(paid_total * percent / 100.0)::bigint end,
    paid_total, target_booking.price_currency,
    (select count(*)::integer from public.booking_berth_assignments assignments
      where assignments.booking_id = target_booking.id and assignments.marina_id = target_marina_id
        and assignments.ended_at is null);
end;
$$;

comment on function public.preview_booking_cancellation(uuid, uuid, uuid, timestamptz) is
  'Read-only cancellation preview using the marina policy active at evaluation time. It recommends a refund but never issues one.';
