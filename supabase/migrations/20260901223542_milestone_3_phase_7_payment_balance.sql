create type public.booking_payment_state as enum (
  'paid_in_full',
  'deposit_paid',
  'balance_due',
  'paid_outside_berthio',
  'payment_link_required'
);

create type public.booking_collection_method as enum (
  'berthio',
  'outside_berthio',
  'payment_link',
  'on_site'
);

create table public.booking_payment_balances (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas(id) on delete cascade,
  booking_id uuid not null unique references public.bookings(id) on delete restrict,
  state public.booking_payment_state not null,
  collection_method public.booking_collection_method not null,
  currency text,
  total_due_minor bigint,
  paid_minor bigint not null default 0,
  balance_due_minor bigint not null default 0,
  due_at timestamptz,
  payment_link_url text,
  note text,
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint booking_payment_balances_amounts_check check (
    total_due_minor is null or (total_due_minor >= 0 and paid_minor >= 0
      and balance_due_minor >= 0 and paid_minor + balance_due_minor = total_due_minor)
  ),
  constraint booking_payment_balances_link_check check (
    state <> 'payment_link_required' or collection_method = 'payment_link'
  ),
  constraint booking_payment_balances_state_check check (
    (state = 'paid_in_full' and balance_due_minor = 0)
    or (state = 'paid_outside_berthio' and collection_method = 'outside_berthio' and balance_due_minor = 0)
    or (state = 'deposit_paid' and paid_minor > 0 and balance_due_minor > 0)
    or (state = 'balance_due' and balance_due_minor > 0)
    or (state = 'payment_link_required' and balance_due_minor > 0)
  )
);

create index booking_payment_balances_due_idx
on public.booking_payment_balances(marina_id, due_at)
where balance_due_minor > 0;

create trigger booking_payment_balances_set_updated_at
before update on public.booking_payment_balances
for each row execute function private.set_updated_at();

alter table public.booking_payment_balances enable row level security;
create policy booking_payment_balances_select_member
on public.booking_payment_balances for select
to authenticated
using ((select private.is_marina_member(marina_id)));
revoke all on table public.booking_payment_balances from public, anon, authenticated;
grant select on table public.booking_payment_balances to authenticated;
grant all on table public.booking_payment_balances to service_role;

create function public.set_booking_payment_state(
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
      and members.status = 'active' and members.role in ('marina_admin', 'marina_staff')
  ) then
    return query select 'unauthorized', null::public.booking_payment_state, null::public.booking_collection_method,
      null::bigint, null::bigint, null::bigint, null::timestamptz, false; return;
  end if;
  select bookings.* into target_booking from public.bookings bookings
  where bookings.id = target_booking_id and bookings.marina_id = target_marina_id;
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

revoke all on function public.set_booking_payment_state(uuid, uuid, uuid, public.booking_payment_state, public.booking_collection_method, text, bigint, bigint, timestamptz, text, text)
from public, anon, authenticated;
grant execute on function public.set_booking_payment_state(uuid, uuid, uuid, public.booking_payment_state, public.booking_collection_method, text, bigint, bigint, timestamptz, text, text)
to service_role;

comment on table public.booking_payment_balances is
  'Staff-maintained payment state and remaining obligation. Overdue balances are warnings only and never cancel bookings.';
