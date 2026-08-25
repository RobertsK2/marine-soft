create type public.booking_payment_status as enum ('pending', 'paid', 'failed', 'expired');

alter table public.marinas
add column stripe_account_id text
constraint marinas_stripe_account_id_check
check (stripe_account_id is null or stripe_account_id ~ '^acct_[A-Za-z0-9]+$');

alter table public.booking_holds add column payment_confirmed_at timestamptz;
alter table public.booking_holds drop constraint booking_holds_release_state_check;
alter table public.booking_holds add constraint booking_holds_release_state_check check (
  (status = 'active' and released_at is null and release_reason is null)
  or (status = 'expired' and released_at is null and release_reason is null)
  or (status = 'released' and released_at is not null
    and release_reason in ('checkout_session_creation_failed', 'checkout_session_expired', 'payment_failed'))
);

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null unique references public.booking_holds(id) on delete restrict,
  marina_id uuid not null references public.marinas(id) on delete restrict,
  stripe_account_id text not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  status public.booking_payment_status not null default 'pending',
  amount_total_minor bigint not null check (amount_total_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  price_snapshot jsonb not null,
  paid_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_payments_state_check check (
    (status = 'pending' and paid_at is null and failed_at is null)
    or (status = 'paid' and paid_at is not null and failed_at is null)
    or (status in ('failed', 'expired') and paid_at is null and failed_at is not null)
  )
);

create table public.stripe_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  stripe_account_id text not null,
  stripe_checkout_session_id text,
  outcome text not null,
  processed_at timestamptz not null default now()
);

create trigger booking_payments_set_updated_at before update on public.booking_payments
for each row execute function private.set_updated_at();

alter table public.booking_payments enable row level security;
alter table public.stripe_webhook_events enable row level security;
create policy booking_payments_select_member on public.booking_payments for select to authenticated
using ((select private.is_marina_member(marina_id)));
revoke all on table public.booking_payments, public.stripe_webhook_events from anon, authenticated;
grant select on table public.booking_payments to authenticated;
grant all on table public.booking_payments, public.stripe_webhook_events to service_role;

create function public.prepare_booking_checkout(target_hold_token uuid)
returns table (
  outcome text, payment_id uuid, hold_id uuid, marina_id uuid, marina_slug text,
  marina_name text, stripe_account_id text, amount_total_minor bigint,
  currency text, price_snapshot jsonb, hold_expires_at timestamptz,
  existing_checkout_session_id text
)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  target_hold public.booking_holds%rowtype;
  target_marina public.marinas%rowtype;
  target_payment public.booking_payments%rowtype;
begin
  select * into target_hold from public.booking_holds where public_token = target_hold_token for update;
  if not found then return query select 'not_found', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_hold.marina_id::text, 0));
  if target_hold.status = 'active' and target_hold.expires_at <= statement_timestamp() then
    update public.booking_holds set status = 'expired' where id = target_hold.id;
    return query select 'expired', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  if target_hold.status <> 'active' then
    return query select 'closed', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  select * into target_marina from public.marinas where id = target_hold.marina_id;
  if target_marina.stripe_account_id is null then
    return query select 'not_configured', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  insert into public.booking_payments (hold_id, marina_id, stripe_account_id, amount_total_minor, currency, price_snapshot)
  values (target_hold.id, target_hold.marina_id, target_marina.stripe_account_id, target_hold.price_total_minor, target_hold.price_currency, target_hold.price_snapshot)
  on conflict on constraint booking_payments_hold_id_key do nothing;
  select payments.* into target_payment from public.booking_payments payments where payments.hold_id = target_hold.id;
  if target_payment.status <> 'pending' then
    return query select 'closed', null::uuid, null::uuid, null::uuid, null::text, null::text, null::text, null::bigint, null::text, null::jsonb, null::timestamptz, null::text; return;
  end if;
  return query select 'ready', target_payment.id, target_hold.id, target_hold.marina_id,
    target_marina.slug, target_marina.name, target_payment.stripe_account_id,
    target_payment.amount_total_minor, target_payment.currency, target_payment.price_snapshot,
    target_hold.expires_at, target_payment.stripe_checkout_session_id;
end $$;

create function public.attach_booking_checkout_session(target_payment_id uuid, target_session_id text)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
begin
  update public.booking_payments set stripe_checkout_session_id = target_session_id
  where id = target_payment_id and status = 'pending'
    and (stripe_checkout_session_id is null or stripe_checkout_session_id = target_session_id);
  return found;
end $$;

create function public.fail_booking_checkout_creation(target_payment_id uuid)
returns boolean language plpgsql volatile security invoker set search_path = '' as $$
declare target_hold_id uuid;
begin
  select hold_id into target_hold_id from public.booking_payments where id = target_payment_id for update;
  if not found then return false; end if;
  update public.booking_payments set status = 'failed', failed_at = coalesce(failed_at, statement_timestamp())
    where id = target_payment_id and status = 'pending';
  update public.booking_holds set status = 'released', released_at = statement_timestamp(),
    release_reason = 'checkout_session_creation_failed'
    where id = target_hold_id and status = 'active';
  return true;
end $$;

create function public.process_stripe_checkout_event(
  target_event_id text, target_event_type text, target_stripe_account_id text,
  target_session_id text, target_payment_intent_id text, target_payment_status text,
  target_amount_total_minor bigint, target_currency text, target_hold_token uuid
)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  target_payment public.booking_payments%rowtype;
  target_hold public.booking_holds%rowtype;
  event_outcome text;
begin
  insert into public.stripe_webhook_events (
    stripe_event_id, event_type, stripe_account_id, stripe_checkout_session_id, outcome
  ) values (target_event_id, target_event_type, target_stripe_account_id, target_session_id, 'processing')
  on conflict do nothing;
  if not found then return 'duplicate'; end if;
  select payments.* into target_payment
  from public.booking_payments payments join public.booking_holds holds on holds.id = payments.hold_id
  where payments.stripe_checkout_session_id = target_session_id and payments.stripe_account_id = target_stripe_account_id
    and holds.public_token = target_hold_token for update of payments;
  if not found then event_outcome := 'ignored_unmatched';
  else select * into target_hold from public.booking_holds where id = target_payment.hold_id for update;
  end if;
  if target_payment.id is null then null;
  elsif target_amount_total_minor is distinct from target_payment.amount_total_minor
    or upper(target_currency) is distinct from target_payment.currency then event_outcome := 'ignored_amount_mismatch';
  elsif target_payment.status = 'paid' then event_outcome := 'already_paid';
  elsif target_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded') and target_payment_status = 'paid' then
    update public.booking_payments set status = 'paid', stripe_payment_intent_id = target_payment_intent_id, paid_at = coalesce(paid_at, statement_timestamp()), failed_at = null where id = target_payment.id and status <> 'paid';
    update public.booking_holds set payment_confirmed_at = coalesce(payment_confirmed_at, statement_timestamp()) where id = target_hold.id;
    event_outcome := 'paid';
  elsif target_event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
    update public.booking_payments set status = case when target_event_type = 'checkout.session.expired' then 'expired'::public.booking_payment_status else 'failed'::public.booking_payment_status end,
      failed_at = coalesce(failed_at, statement_timestamp()) where id = target_payment.id and status = 'pending';
    update public.booking_holds set status = 'released', released_at = statement_timestamp(),
      release_reason = case when target_event_type = 'checkout.session.expired' then 'checkout_session_expired' else 'payment_failed' end
      where id = target_hold.id and status = 'active';
    event_outcome := case when target_event_type = 'checkout.session.expired' then 'expired' else 'failed' end;
  else event_outcome := 'ignored';
  end if;
  update public.stripe_webhook_events set outcome = event_outcome where stripe_event_id = target_event_id;
  return event_outcome;
end $$;

revoke all on function public.prepare_booking_checkout(uuid), public.attach_booking_checkout_session(uuid,text), public.fail_booking_checkout_creation(uuid),
public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid) from public, anon, authenticated;
grant execute on function public.prepare_booking_checkout(uuid), public.attach_booking_checkout_session(uuid,text), public.fail_booking_checkout_creation(uuid),
public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid) to service_role;

create or replace function private.capacity_is_available(
  target_marina_id uuid, requested_arrival date, requested_departure date,
  requested_length_m numeric, requested_beam_m numeric, requested_draft_m numeric,
  excluded_booking_id uuid default null
) returns boolean language sql volatile security invoker set search_path = '' as $$
  with recursive all_demands (demand_id,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m) as (
    values ('request'::text,requested_arrival,requested_departure,requested_length_m,requested_beam_m,requested_draft_m)
    union all select 'booking:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m from public.bookings
      where marina_id=target_marina_id and status in ('confirmed','checked_in') and id is distinct from excluded_booking_id
    union all select 'hold:'||id::text,arrival_date,departure_date,vessel_length_m,vessel_beam_m,vessel_draft_m from public.booking_holds
      where marina_id=target_marina_id and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
  ), connected as (
    select * from all_demands where demand_id='request' union
    select c.* from all_demands c join connected e on c.arrival_date<e.departure_date and e.arrival_date<c.departure_date
  ), ranked as (
    select d.*,count(b.id) candidate_count from connected d left join public.berths b on b.marina_id=target_marina_id and b.status='available'
      and d.vessel_length_m<=b.max_length_m and d.vessel_beam_m<=b.max_beam_m and d.vessel_draft_m<=b.max_draft_m
      and (b.allow_smaller_vessels or (d.vessel_length_m=b.max_length_m and d.vessel_beam_m=b.max_beam_m and d.vessel_draft_m=b.max_draft_m))
    group by d.demand_id,d.arrival_date,d.departure_date,d.vessel_length_m,d.vessel_beam_m,d.vessel_draft_m
  ), ordered as (
    select ranked.*,row_number() over(order by candidate_count,vessel_length_m desc,vessel_beam_m desc,vessel_draft_m desc,arrival_date,departure_date,demand_id) demand_number from ranked
  ), assignment_search(step,assignments) as (
    values(0::bigint,'[]'::jsonb) union all
    select s.step+1,s.assignments||jsonb_build_array(jsonb_build_object('berth_id',b.id,'arrival_date',d.arrival_date,'departure_date',d.departure_date))
    from assignment_search s join ordered d on d.demand_number=s.step+1 join public.berths b on b.marina_id=target_marina_id and b.status='available'
      and d.vessel_length_m<=b.max_length_m and d.vessel_beam_m<=b.max_beam_m and d.vessel_draft_m<=b.max_draft_m
      and (b.allow_smaller_vessels or (d.vessel_length_m=b.max_length_m and d.vessel_beam_m=b.max_beam_m and d.vessel_draft_m=b.max_draft_m))
    where private.berth_assignment_is_open(s.assignments,b.id,d.arrival_date,d.departure_date)
  ) select exists(select 1 from assignment_search where step=(select count(*) from connected));
$$;

create or replace function private.booking_respects_active_holds()
returns trigger language plpgsql volatile security invoker set search_path = '' as $$
declare should_check boolean;
begin
  if tg_op = 'INSERT' then should_check := new.status in ('confirmed','checked_in');
  else should_check := new.status in ('confirmed','checked_in') and (
    old.status not in ('confirmed','checked_in') or new.arrival_date is distinct from old.arrival_date
    or new.departure_date is distinct from old.departure_date or new.vessel_length_m is distinct from old.vessel_length_m
    or new.vessel_beam_m is distinct from old.vessel_beam_m or new.vessel_draft_m is distinct from old.vessel_draft_m
  ); end if;
  if not should_check then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.marina_id::text,0));
  if exists (
    select 1 from public.booking_holds where marina_id=new.marina_id
    and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
    and arrival_date<new.departure_date and new.arrival_date<departure_date
  ) and not private.capacity_is_available(
    new.marina_id,new.arrival_date,new.departure_date,new.vessel_length_m,new.vessel_beam_m,new.vessel_draft_m,
    case when tg_op='UPDATE' then old.id else null end
  ) then raise exception 'Active public hold has priority over this booking change.' using errcode='P0001'; end if;
  return new;
end $$;
