-- Offline collections are receipts, never Stripe payments. Existing cumulative
-- balances remain authoritative for guest summaries and notifications.
create table public.booking_offline_payments (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete restrict,
  request_id uuid not null,
  currency text not null check (currency = 'EUR'),
  amount_minor bigint not null check (amount_minor > 0 and amount_minor <= 9007199254740991),
  paid_before_minor bigint not null check (paid_before_minor >= 0 and paid_before_minor <= 9007199254740991),
  method text not null check (method in ('cash', 'card_terminal', 'bank_transfer')),
  note text check (char_length(note) <= 500),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  recorded_by_label text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (booking_id) references public.booking_payment_balances(booking_id) on delete restrict,
  check (paid_before_minor + amount_minor <= 9007199254740991),
  unique (booking_id, request_id),
  unique (booking_id, paid_before_minor)
);
create index booking_offline_payments_marina_idx on public.booking_offline_payments(marina_id, booking_id);
alter table public.booking_offline_payments enable row level security;
create policy booking_offline_payments_select_member on public.booking_offline_payments
  for select to authenticated using ((select private.is_marina_member(marina_id)));
revoke all on public.booking_offline_payments from public, anon, authenticated, service_role;
grant select on public.booking_offline_payments to authenticated;
grant select, insert on public.booking_offline_payments to service_role;

create function private.guard_offline_payment_receipt() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare b public.booking_payment_balances%rowtype;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Offline payment history is immutable.' using errcode = '23514';
  end if;
  -- Same lock order as cancellation and the recording RPC.
  perform 1 from public.bookings where id = new.booking_id and marina_id = new.marina_id for update;
  select * into b from public.booking_payment_balances where booking_id = new.booking_id for update;
  if not found or b.marina_id <> new.marina_id or b.collection_method <> 'on_site'
    or b.currency is distinct from new.currency or b.paid_minor <> new.paid_before_minor
    or new.amount_minor > b.balance_due_minor then
    raise exception 'Receipt does not match the booking balance.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger booking_offline_payments_guard before insert or update or delete on public.booking_offline_payments
for each row execute function private.guard_offline_payment_receipt();

-- Enforce consistency even when a privileged caller attempts a direct write.
-- Deferred until the receipt insert and matching balance update both complete.
create function private.check_offline_payment_balance() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare b public.booking_payment_balances%rowtype; r public.booking_offline_payments%rowtype;
begin
  select * into r from public.booking_offline_payments where booking_id = new.booking_id
    order by paid_before_minor desc limit 1;
  if not found then return new; end if;
  select * into b from public.booking_payment_balances where booking_id = new.booking_id;
  if not found or b.marina_id <> r.marina_id or b.currency is distinct from r.currency
    or b.collection_method <> 'on_site' or b.paid_minor <> r.paid_before_minor + r.amount_minor then
    raise exception 'Booking balance must match immutable offline receipts.' using errcode = '23514';
  end if;
  return new;
end;
$$;
create constraint trigger offline_receipts_balance_consistent after insert on public.booking_offline_payments
  deferrable initially deferred for each row execute function private.check_offline_payment_balance();
create constraint trigger offline_balance_receipts_consistent after insert or update on public.booking_payment_balances
  deferrable initially deferred for each row execute function private.check_offline_payment_balance();
revoke all on function private.guard_offline_payment_receipt(), private.check_offline_payment_balance()
  from public, anon, authenticated, service_role;

create function public.record_booking_offline_payment(
  target_marina_id uuid, target_booking_id uuid, target_actor_id uuid, target_actor_label text,
  requested_request_id uuid, requested_currency text, requested_amount_minor bigint,
  requested_method text, requested_note text, expected_paid_minor bigint
) returns table(outcome text, receipt_id uuid)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  booking public.bookings%rowtype;
  balance public.booking_payment_balances%rowtype;
  receipt public.booking_offline_payments%rowtype;
  actor_label text := left(coalesce(nullif(btrim(target_actor_label), ''), target_actor_id::text), 320);
  clean_note text := nullif(btrim(requested_note), '');
begin
  -- Actor ID and display email come from the verified server session, never
  -- browser fields. Recheck live membership here; auth.users stays private.
  if not exists (
    select 1 from public.marinas m join public.organization_members members on members.organization_id = m.organization_id
    where m.id = target_marina_id and members.user_id = target_actor_id
      and members.status = 'active' and members.role in ('marina_admin', 'marina_staff')
  ) then return query select 'unauthorized', null::uuid; return; end if;
  select * into booking from public.bookings where id = target_booking_id and marina_id = target_marina_id for update;
  if not found then return query select 'not_found', null::uuid; return; end if;
  if requested_request_id is null or requested_amount_minor is null or requested_amount_minor <= 0
    or requested_amount_minor > 9007199254740991 or requested_currency is distinct from 'EUR'
    or requested_method is null or requested_method not in ('cash', 'card_terminal', 'bank_transfer')
    or char_length(clean_note) > 500 then
    return query select 'invalid_payment', null::uuid; return;
  end if;
  select * into receipt from public.booking_offline_payments
    where booking_id = target_booking_id and request_id = requested_request_id;
  if found then
    if receipt.amount_minor <> requested_amount_minor or receipt.currency <> requested_currency
      or receipt.method <> requested_method or receipt.note is distinct from clean_note
      or receipt.recorded_by <> target_actor_id then
      return query select 'idempotency_conflict', null::uuid;
    else return query select 'already_recorded', receipt.id;
    end if;
    return;
  end if;
  if booking.status = 'cancelled' then return query select 'cancelled', null::uuid; return; end if;
  -- Explicitly excludes Stripe bookings, including legacy rows with a changed collection method.
  if booking.booking_payment_id is not null then return query select 'not_offline', null::uuid; return; end if;
  select * into balance from public.booking_payment_balances
    where booking_id = target_booking_id and marina_id = target_marina_id for update;
  if not found then return query select 'balance_required', null::uuid; return; end if;
  if balance.collection_method <> 'on_site' or balance.currency is distinct from requested_currency
    or balance.total_due_minor is null or balance.total_due_minor > 9007199254740991 then
    return query select 'not_offline', null::uuid; return;
  end if;
  -- A second staff member must refresh after another collection, even if their
  -- amount would still fit. A retry with the same request ID was handled above.
  if expected_paid_minor is distinct from balance.paid_minor then
    return query select 'stale', null::uuid; return;
  end if;
  if requested_amount_minor > balance.balance_due_minor then
    return query select 'excessive_amount', null::uuid; return;
  end if;
  insert into public.booking_offline_payments(marina_id, booking_id, request_id, currency,
    amount_minor, paid_before_minor, method, note, recorded_by, recorded_by_label)
  values(target_marina_id, target_booking_id, requested_request_id, requested_currency,
    requested_amount_minor, balance.paid_minor, requested_method, clean_note, target_actor_id, actor_label)
  returning * into receipt;
  update public.booking_payment_balances set
    paid_minor = balance.paid_minor + requested_amount_minor,
    balance_due_minor = balance.balance_due_minor - requested_amount_minor,
    state = case when balance.balance_due_minor = requested_amount_minor then 'paid_in_full'::public.booking_payment_state
      else 'deposit_paid'::public.booking_payment_state end,
    updated_by = target_actor_id
  where id = balance.id;
  return query select 'recorded', receipt.id;
end;
$$;
revoke all on function public.record_booking_offline_payment(uuid,uuid,uuid,text,uuid,text,bigint,text,text,bigint)
  from public, anon, authenticated;
grant execute on function public.record_booking_offline_payment(uuid,uuid,uuid,text,uuid,text,bigint,text,text,bigint) to service_role;
comment on table public.booking_offline_payments is
  'Immutable actual offline collections. paid_before_minor preserves the pre-receipt opening balance; no historic receipts are fabricated. Card terminal is a staff declaration, not a processor charge.';

-- Legacy management remains available only to marina administrators.
create or replace function public.set_booking_payment_state(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  requested_state public.booking_payment_state,
  requested_method public.booking_collection_method,
  requested_currency text,
  requested_total_minor bigint,
  requested_paid_minor bigint,
  requested_due_at timestamptz,
  requested_payment_link_url text,
  requested_note text
)
returns table (
  outcome text,
  state public.booking_payment_state,
  collection_method public.booking_collection_method,
  total_due_minor bigint,
  paid_minor bigint,
  balance_due_minor bigint,
  due_at timestamptz,
  overdue boolean
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  total_due bigint := requested_total_minor;
  paid bigint := coalesce(requested_paid_minor, 0);
  balance bigint;
begin
  if not exists (
    select 1 from public.marinas marinas
    join public.organization_members members on members.organization_id = marinas.organization_id
    where marinas.id = target_marina_id and members.user_id = target_actor_id
      and members.status = 'active' and members.role = 'marina_admin'
  ) then
    return query select 'unauthorized', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;
  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id for update;
  if not found then
    return query select 'not_found', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;
  total_due := coalesce(total_due, target_booking.price_total_minor);
  if total_due is null or total_due < 0 or paid < 0 or paid > total_due then
    return query select 'invalid_amounts', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;
  balance := total_due - paid;
  if requested_state = 'paid_in_full' and balance <> 0 then
    return query select 'invalid_state', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  elsif requested_state = 'paid_outside_berthio' and (requested_method <> 'outside_berthio' or balance <> 0) then
    return query select 'invalid_state', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  elsif requested_state in ('deposit_paid', 'balance_due', 'payment_link_required') and balance <= 0 then
    return query select 'invalid_state', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  elsif requested_state = 'payment_link_required' and requested_method <> 'payment_link' then
    return query select 'invalid_state', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;

  -- Serialize advanced changes with receipts. On-site collections must use the
  -- receipt RPC, regardless of a legacy collection-method change. A nonzero
  -- legacy offline balance also locks currency. No opening receipts are invented.
  -- Existing receipts additionally lock collection identity.
  if exists (
    select 1 from public.booking_payment_balances b where b.booking_id = target_booking_id
      and ((target_booking.booking_payment_id is null and (b.paid_minor <> paid
          or (b.paid_minor > 0 and b.currency is distinct from upper(nullif(btrim(requested_currency), '')))))
        or (exists (select 1 from public.booking_offline_payments r where r.booking_id = b.booking_id)
          and (b.currency is distinct from upper(nullif(btrim(requested_currency), ''))
            or requested_method <> 'on_site' or b.paid_minor <> paid)))
  ) then
    return query select 'history_locked', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;

  insert into public.booking_payment_balances(
    marina_id, booking_id, state, collection_method, currency, total_due_minor,
    paid_minor, balance_due_minor, due_at, payment_link_url, note, updated_by
  ) values (
    target_marina_id, target_booking.id, requested_state, requested_method,
    upper(nullif(btrim(requested_currency), '')), total_due, paid, balance,
    requested_due_at, nullif(btrim(requested_payment_link_url), ''),
    nullif(btrim(requested_note), ''), target_actor_id
  ) on conflict (booking_id) do update set
    state = excluded.state, collection_method = excluded.collection_method,
    currency = excluded.currency, total_due_minor = excluded.total_due_minor,
    paid_minor = excluded.paid_minor, balance_due_minor = excluded.balance_due_minor,
    due_at = excluded.due_at, payment_link_url = excluded.payment_link_url,
    note = excluded.note, updated_by = excluded.updated_by;

  return query select 'updated', requested_state, requested_method, total_due, paid, balance,
    requested_due_at, balance > 0 and requested_due_at is not null and requested_due_at < statement_timestamp();
end;
$$;


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
  payment_currency text;
  offline_balance public.booking_payment_balances%rowtype;
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
  -- Payment identity comes from the booking, not the editable collection
  -- method. Legacy cumulative balances remain authoritative without receipts.
  if target_booking.booking_payment_id is null then
    select b.* into offline_balance from public.booking_payment_balances b
      where b.booking_id = target_booking.id and b.marina_id = target_marina_id;
  end if;
  if offline_balance.id is not null then
    paid_total := offline_balance.paid_minor;
    payment_currency := offline_balance.currency;
  else
    -- Preserve the existing Stripe/legacy-without-balance calculation.
    paid_total := coalesce(latest_adjustment.revised_price_total_minor, target_booking.price_total_minor);
    payment_currency := target_booking.price_currency;
  end if;
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
      null::bigint, paid_total, payment_currency, 0;
    return;
  end if;

  return query select 'ready', target_booking.status, code, percent,
    case when paid_total is null then null else floor(paid_total * percent / 100.0)::bigint end,
    paid_total, payment_currency,
    (select count(*)::integer from public.booking_berth_assignments assignments
      where assignments.booking_id = target_booking.id and assignments.marina_id = target_marina_id
        and assignments.ended_at is null);
end;
$$;

comment on function public.preview_booking_cancellation(uuid, uuid, uuid, timestamptz) is
  'Read-only cancellation preview using the marina policy active at evaluation time. It recommends a refund but never issues one.';

-- A manual booking may have an actual payment balance but no historic price
-- snapshot. Preserve that absence and capture the real balance at cancellation.
-- Existing immutable rows remain unchanged and satisfy the original branch.
alter table public.booking_cancellation_events
  add column payment_balance_snapshot jsonb,
  drop constraint booking_cancellation_events_financial_check,
  add constraint booking_cancellation_events_financial_check check (
    (refund_recommendation_minor is null and currency is null and paid_total_minor is null
      and price_snapshot is null and payment_balance_snapshot is null)
    or (refund_recommendation_minor is not null and refund_recommendation_minor >= 0
      and currency is not null and paid_total_minor is not null and paid_total_minor >= 0
      and (price_snapshot is not null or payment_balance_snapshot is not null)
      and (payment_balance_snapshot is null or (
        jsonb_typeof(payment_balance_snapshot) = 'object'
        and payment_balance_snapshot @> jsonb_build_object(
          'booking_id', booking_id, 'marina_id', marina_id,
          'paid_minor', paid_total_minor, 'currency', currency
        )
      )))
  );
comment on column public.booking_cancellation_events.payment_balance_snapshot is
  'Actual offline booking payment balance captured at cancellation, including legacy paid amounts. Not a historic price snapshot and not a refund transaction.';

create or replace function public.confirm_booking_cancellation(
  target_marina_id uuid,
  target_booking_id uuid,
  target_actor_id uuid,
  expected_updated_at timestamptz,
  cancellation_reason text
)
returns table (
  outcome text,
  policy_code text,
  refund_percent smallint,
  refund_recommendation_minor bigint,
  currency text,
  released_assignment_count integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  target_booking public.bookings%rowtype;
  preview record;
  offline_balance public.booking_payment_balances%rowtype;
  reason text := coalesce(nullif(btrim(cancellation_reason), ''), 'Staff cancellation');
  released integer := 0;
begin
  perform pg_advisory_xact_lock(hashtextextended(target_marina_id::text, 0));
  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id for update;
  if not found then
    return query select 'not_found', null::text, null::smallint, null::bigint, null::text, 0; return;
  end if;
  -- Match the receipt/editor lock order: booking, then balance. Re-evaluate
  -- the recommendation under those locks before writing immutable history.
  if target_booking.booking_payment_id is null then
    select b.* into offline_balance from public.booking_payment_balances b
      where b.booking_id = target_booking.id and b.marina_id = target_marina_id for update;
  end if;
  select * into preview from public.preview_booking_cancellation(
    target_marina_id, target_booking_id, target_actor_id, expected_updated_at
  );
  if preview.outcome <> 'ready' then
    return query select preview.outcome, preview.policy_code, preview.refund_percent,
      preview.refund_recommendation_minor, preview.currency, 0; return;
  end if;
  if char_length(reason) > 500 then
    return query select 'invalid_reason', preview.policy_code, preview.refund_percent,
      preview.refund_recommendation_minor, preview.currency, 0; return;
  end if;

  update public.bookings set status = 'cancelled' where id = target_booking.id;
  update public.booking_berth_assignments
  set ended_at = statement_timestamp(), ended_by = target_actor_id, ended_reason = 'cancelled'
  where booking_id = target_booking.id and marina_id = target_marina_id and ended_at is null;
  get diagnostics released = row_count;

  insert into public.booking_cancellation_events(
    marina_id, booking_id, cancelled_by, reason, policy_code, refund_percent,
    refund_recommendation_minor, currency, paid_total_minor, price_snapshot, payment_balance_snapshot
  ) values (
    target_marina_id, target_booking.id, target_actor_id, reason, preview.policy_code,
    preview.refund_percent, preview.refund_recommendation_minor, preview.currency,
    preview.paid_total_minor, coalesce((select revised_price_snapshot from public.booking_price_adjustments
      where booking_id = target_booking.id order by changed_at desc, id desc limit 1), target_booking.price_snapshot),
    case when offline_balance.id is not null then to_jsonb(offline_balance) else null end
  );

  return query select 'cancelled', preview.policy_code, preview.refund_percent,
    preview.refund_recommendation_minor, preview.currency, released;
end;
$$;
