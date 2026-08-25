alter table public.booking_holds
add column consumed_at timestamptz;

alter table public.booking_holds drop constraint booking_holds_release_state_check;
alter table public.booking_holds add constraint booking_holds_release_state_check check (
  (status = 'active' and released_at is null and release_reason is null and consumed_at is null)
  or (status = 'expired' and released_at is null and release_reason is null and consumed_at is null)
  or (status = 'released' and released_at is not null and consumed_at is null
    and release_reason in ('checkout_session_creation_failed', 'checkout_session_expired', 'payment_failed'))
  or (status = 'consumed' and released_at is null and release_reason is null
    and consumed_at is not null and payment_confirmed_at is not null)
);

alter table public.bookings
add column booking_hold_id uuid unique references public.booking_holds(id) on delete restrict,
add column booking_payment_id uuid unique references public.booking_payments(id) on delete restrict,
add column customer_snapshot jsonb,
add column vessel_snapshot jsonb,
add constraint bookings_online_snapshot_complete_check check (
  source <> 'online'
  or (
    booking_hold_id is not null
    and booking_payment_id is not null
    and price_currency is not null
    and price_total_minor is not null
    and price_snapshot is not null
    and jsonb_typeof(customer_snapshot) = 'object'
    and customer_snapshot ?& array['version', 'name', 'email', 'phone', 'source']
    and (customer_snapshot ->> 'version')::integer = 1
    and customer_snapshot ->> 'name' = customer_name
    and customer_snapshot ->> 'email' = customer_email
    and customer_snapshot ->> 'phone' = customer_phone
    and customer_snapshot ->> 'source' = 'stripe_checkout'
    and jsonb_typeof(vessel_snapshot) = 'object'
    and vessel_snapshot ?& array['version', 'name', 'lengthM', 'beamM', 'draftM']
    and (vessel_snapshot ->> 'version')::integer = 1
    and vessel_snapshot ->> 'name' is not distinct from vessel_name
    and (vessel_snapshot ->> 'lengthM')::numeric = vessel_length_m
    and (vessel_snapshot ->> 'beamM')::numeric = vessel_beam_m
    and (vessel_snapshot ->> 'draftM')::numeric = vessel_draft_m
  )
);

comment on column public.bookings.customer_snapshot is
  'Immutable V1 customer details captured from the paid Stripe Checkout Session.';
comment on column public.bookings.vessel_snapshot is
  'Immutable V1 vessel details copied from the paid booking hold.';

create function private.protect_online_booking_snapshots()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if old.source = 'online' and (
    new.source is distinct from old.source
    or new.booking_hold_id is distinct from old.booking_hold_id
    or new.booking_payment_id is distinct from old.booking_payment_id
    or new.customer_name is distinct from old.customer_name
    or new.customer_email is distinct from old.customer_email
    or new.customer_phone is distinct from old.customer_phone
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.vessel_name is distinct from old.vessel_name
    or new.vessel_length_m is distinct from old.vessel_length_m
    or new.vessel_beam_m is distinct from old.vessel_beam_m
    or new.vessel_draft_m is distinct from old.vessel_draft_m
    or new.vessel_snapshot is distinct from old.vessel_snapshot
  ) then
    raise exception 'Online booking customer, vessel, hold, and payment snapshots are immutable.'
      using errcode = '23514';
  end if;
  return new;
end $$;

create trigger bookings_protect_online_snapshots
before update on public.bookings
for each row execute function private.protect_online_booking_snapshots();

alter table public.stripe_webhook_events
add column booking_id uuid references public.bookings(id) on delete restrict,
add column error_detail text;

create index booking_payments_paid_without_booking_idx
on public.booking_payments (paid_at, id)
where status = 'paid';

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
      where marina_id=target_marina_id and status <> 'consumed'
        and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
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
    select 1 from public.booking_holds where marina_id=new.marina_id and status <> 'consumed'
    and (payment_confirmed_at is not null or (status='active' and expires_at>statement_timestamp()))
    and arrival_date<new.departure_date and new.arrival_date<departure_date
  ) and not private.capacity_is_available(
    new.marina_id,new.arrival_date,new.departure_date,new.vessel_length_m,new.vessel_beam_m,new.vessel_draft_m,
    case when tg_op='UPDATE' then old.id else null end
  ) then raise exception 'Active public hold has priority over this booking change.' using errcode='P0001'; end if;
  return new;
end $$;

drop function public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid);

create function public.process_stripe_checkout_event(
  target_event_id text, target_event_type text, target_stripe_account_id text,
  target_session_id text, target_payment_intent_id text, target_payment_status text,
  target_amount_total_minor bigint, target_currency text, target_hold_token uuid,
  target_customer_name text default null, target_customer_email text default null,
  target_customer_phone text default null
)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  target_payment public.booking_payments%rowtype;
  target_hold public.booking_holds%rowtype;
  target_booking public.bookings%rowtype;
  event_outcome text;
  event_is_new boolean;
  booking_error text;
begin
  insert into public.stripe_webhook_events (
    stripe_event_id, event_type, stripe_account_id, stripe_checkout_session_id, outcome
  ) values (target_event_id, target_event_type, target_stripe_account_id, target_session_id, 'processing')
  on conflict do nothing;
  event_is_new := found;

  select payments.* into target_payment
  from public.booking_payments payments
  join public.booking_holds holds on holds.id = payments.hold_id
  where payments.stripe_checkout_session_id = target_session_id
    and payments.stripe_account_id = target_stripe_account_id
    and holds.public_token = target_hold_token
  for update of payments;

  if not found then
    event_outcome := case when event_is_new then 'ignored_unmatched' else 'duplicate' end;
  else
    select * into target_hold from public.booking_holds where id = target_payment.hold_id for update;
    select * into target_booking from public.bookings where booking_payment_id = target_payment.id;

    if target_amount_total_minor is distinct from target_payment.amount_total_minor
      or upper(target_currency) is distinct from target_payment.currency then
      event_outcome := case when event_is_new then 'ignored_amount_mismatch' else 'duplicate' end;
    elsif target_event_type in ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
      and target_payment_status = 'paid' then
      update public.booking_payments set
        status = 'paid',
        stripe_payment_intent_id = coalesce(target_payment_intent_id, stripe_payment_intent_id),
        paid_at = coalesce(paid_at, statement_timestamp()),
        failed_at = null
      where id = target_payment.id;
      update public.booking_holds set payment_confirmed_at = coalesce(payment_confirmed_at, statement_timestamp())
      where id = target_hold.id;

      if target_booking.id is not null then
        update public.booking_holds set status = 'consumed', consumed_at = coalesce(consumed_at, statement_timestamp()),
          released_at = null, release_reason = null where id = target_hold.id and status <> 'consumed';
        event_outcome := case when event_is_new then 'already_confirmed' else 'duplicate' end;
      elsif nullif(btrim(target_customer_name), '') is null
        or nullif(btrim(target_customer_email), '') is null
        or nullif(btrim(target_customer_phone), '') is null then
        event_outcome := 'critical_paid_without_booking';
        booking_error := 'Paid Checkout Session is missing required customer details.';
      else
        begin
          update public.booking_holds set status = 'consumed', consumed_at = statement_timestamp(),
            released_at = null, release_reason = null where id = target_hold.id;
          insert into public.bookings (
            marina_id, arrival_date, departure_date, eta, etd,
            customer_name, customer_email, customer_phone,
            vessel_name, vessel_length_m, vessel_beam_m, vessel_draft_m,
            status, source, price_currency, price_total_minor, price_snapshot,
            booking_hold_id, booking_payment_id, customer_snapshot, vessel_snapshot
          ) values (
            target_hold.marina_id, target_hold.arrival_date, target_hold.departure_date,
            target_hold.eta, target_hold.etd,
            btrim(target_customer_name), lower(btrim(target_customer_email)), btrim(target_customer_phone),
            target_hold.vessel_name, target_hold.vessel_length_m, target_hold.vessel_beam_m, target_hold.vessel_draft_m,
            'confirmed', 'online', target_payment.currency, target_payment.amount_total_minor, target_payment.price_snapshot,
            target_hold.id, target_payment.id,
            jsonb_build_object('version',1,'name',btrim(target_customer_name),'email',lower(btrim(target_customer_email)),
              'phone',btrim(target_customer_phone),'source','stripe_checkout'),
            jsonb_build_object('version',1,'name',target_hold.vessel_name,'lengthM',target_hold.vessel_length_m,
              'beamM',target_hold.vessel_beam_m,'draftM',target_hold.vessel_draft_m)
          ) returning * into target_booking;
          event_outcome := 'confirmed';
        exception when others then
          get stacked diagnostics booking_error = message_text;
          event_outcome := 'critical_paid_without_booking';
        end;
      end if;
    elsif target_payment.status = 'paid' and target_booking.id is null then
      event_outcome := 'critical_paid_without_booking';
      booking_error := 'A paid payment ledger entry has no online booking.';
    elsif target_payment.status = 'paid' then
      event_outcome := case when event_is_new then 'already_confirmed' else 'duplicate' end;
    elsif target_event_type in ('checkout.session.expired', 'checkout.session.async_payment_failed') then
      update public.booking_payments set
        status = case when target_event_type = 'checkout.session.expired'
          then 'expired'::public.booking_payment_status else 'failed'::public.booking_payment_status end,
        failed_at = coalesce(failed_at, statement_timestamp())
      where id = target_payment.id and status = 'pending';
      update public.booking_holds set status = 'released', released_at = statement_timestamp(),
        release_reason = case when target_event_type = 'checkout.session.expired'
          then 'checkout_session_expired' else 'payment_failed' end
      where id = target_hold.id and status = 'active';
      event_outcome := case when target_event_type = 'checkout.session.expired' then 'expired' else 'failed' end;
    else
      event_outcome := 'ignored';
    end if;
  end if;

  if event_outcome <> 'duplicate' then
    update public.stripe_webhook_events set
      outcome = event_outcome,
      booking_id = target_booking.id,
      error_detail = booking_error,
      processed_at = statement_timestamp()
    where stripe_event_id = target_event_id;
  end if;
  return event_outcome;
end $$;

revoke all on function public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid,text,text,text)
from public, anon, authenticated;
grant execute on function public.process_stripe_checkout_event(text,text,text,text,text,text,bigint,text,uuid,text,text,text)
to service_role;
