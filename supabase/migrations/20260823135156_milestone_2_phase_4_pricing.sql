create extension if not exists btree_gist with schema extensions;

create type public.pricing_model as enum ('length_interval', 'per_meter');
create type public.tax_behavior as enum ('exclusive', 'inclusive');
create type public.mandatory_fee_type as enum (
  'per_booking',
  'per_night',
  'per_vessel',
  'percentage'
);

create table public.marina_pricing_configs (
  marina_id uuid primary key references public.marinas (id) on delete cascade,
  currency text not null
    constraint marina_pricing_configs_currency_check
    check (currency ~ '^[A-Z]{3}$'),
  model public.pricing_model not null,
  tax_behavior public.tax_behavior not null,
  tax_rate_bps integer not null default 0
    constraint marina_pricing_configs_tax_rate_check
    check (tax_rate_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.marina_pricing_configs.tax_rate_bps is
  'Tax rate in basis points. 2100 represents 21.00 percent.';

create table public.pricing_seasons (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas (id) on delete cascade,
  name text not null
    constraint pricing_seasons_name_check
    check (name = btrim(name) and char_length(name) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_seasons_interval_check check (ends_on > starts_on),
  constraint pricing_seasons_id_marina_unique unique (id, marina_id),
  constraint pricing_seasons_no_overlap exclude using gist (
    marina_id with =,
    daterange(starts_on, ends_on, '[)') with &&
  )
);

comment on constraint pricing_seasons_interval_check on public.pricing_seasons is
  'Pricing seasons use [starts_on, ends_on) date semantics.';

create table public.pricing_season_length_rates (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  marina_id uuid not null,
  min_length_m numeric(7, 2) not null
    constraint pricing_length_rates_min_check check (min_length_m >= 0),
  max_length_m numeric(7, 2) not null,
  nightly_rate_minor bigint not null
    constraint pricing_length_rates_amount_check check (nightly_rate_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_length_rates_interval_check check (max_length_m > min_length_m),
  constraint pricing_length_rates_season_fk foreign key (season_id, marina_id)
    references public.pricing_seasons (id, marina_id) on delete cascade,
  constraint pricing_length_rates_no_overlap exclude using gist (
    season_id with =,
    numrange(min_length_m, max_length_m, '[)') with &&
  )
);

comment on table public.pricing_season_length_rates is
  'Fixed nightly prices for [min_length_m, max_length_m) vessel intervals.';

create table public.pricing_season_meter_rates (
  season_id uuid primary key,
  marina_id uuid not null,
  nightly_rate_per_meter_minor bigint not null
    constraint pricing_meter_rates_amount_check
    check (nightly_rate_per_meter_minor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pricing_meter_rates_season_fk foreign key (season_id, marina_id)
    references public.pricing_seasons (id, marina_id) on delete cascade
);

create table public.marina_mandatory_fees (
  id uuid primary key default gen_random_uuid(),
  marina_id uuid not null references public.marinas (id) on delete cascade,
  name text not null
    constraint marina_mandatory_fees_name_check
    check (name = btrim(name) and char_length(name) between 1 and 80),
  fee_type public.mandatory_fee_type not null,
  amount_minor bigint,
  percentage_bps integer,
  sort_order smallint not null default 100
    constraint marina_mandatory_fees_sort_order_check check (sort_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marina_mandatory_fees_value_check check (
    (
      fee_type = 'percentage'
      and amount_minor is null
      and percentage_bps is not null
      and percentage_bps between 1 and 10000
    )
    or
    (
      fee_type <> 'percentage'
      and amount_minor is not null
      and amount_minor >= 0
      and percentage_bps is null
    )
  )
);

create index pricing_seasons_marina_dates_idx
on public.pricing_seasons (marina_id, starts_on, ends_on);

create index pricing_length_rates_marina_season_idx
on public.pricing_season_length_rates (marina_id, season_id, min_length_m);

create index pricing_meter_rates_marina_idx
on public.pricing_season_meter_rates (marina_id);

create index marina_mandatory_fees_marina_sort_idx
on public.marina_mandatory_fees (marina_id, sort_order, name);

create trigger marina_pricing_configs_set_updated_at
before update on public.marina_pricing_configs
for each row execute function private.set_updated_at();

create trigger pricing_seasons_set_updated_at
before update on public.pricing_seasons
for each row execute function private.set_updated_at();

create trigger pricing_length_rates_set_updated_at
before update on public.pricing_season_length_rates
for each row execute function private.set_updated_at();

create trigger pricing_meter_rates_set_updated_at
before update on public.pricing_season_meter_rates
for each row execute function private.set_updated_at();

create trigger marina_mandatory_fees_set_updated_at
before update on public.marina_mandatory_fees
for each row execute function private.set_updated_at();

alter table public.marina_pricing_configs enable row level security;
alter table public.pricing_seasons enable row level security;
alter table public.pricing_season_length_rates enable row level security;
alter table public.pricing_season_meter_rates enable row level security;
alter table public.marina_mandatory_fees enable row level security;

create policy marina_pricing_configs_select_member
on public.marina_pricing_configs for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy marina_pricing_configs_insert_admin
on public.marina_pricing_configs for insert to authenticated
with check ((select private.is_marina_admin(marina_id)));
create policy marina_pricing_configs_update_admin
on public.marina_pricing_configs for update to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));
create policy marina_pricing_configs_delete_admin
on public.marina_pricing_configs for delete to authenticated
using ((select private.is_marina_admin(marina_id)));

create policy pricing_seasons_select_member
on public.pricing_seasons for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy pricing_seasons_insert_admin
on public.pricing_seasons for insert to authenticated
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_seasons_update_admin
on public.pricing_seasons for update to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_seasons_delete_admin
on public.pricing_seasons for delete to authenticated
using ((select private.is_marina_admin(marina_id)));

create policy pricing_length_rates_select_member
on public.pricing_season_length_rates for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy pricing_length_rates_insert_admin
on public.pricing_season_length_rates for insert to authenticated
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_length_rates_update_admin
on public.pricing_season_length_rates for update to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_length_rates_delete_admin
on public.pricing_season_length_rates for delete to authenticated
using ((select private.is_marina_admin(marina_id)));

create policy pricing_meter_rates_select_member
on public.pricing_season_meter_rates for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy pricing_meter_rates_insert_admin
on public.pricing_season_meter_rates for insert to authenticated
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_meter_rates_update_admin
on public.pricing_season_meter_rates for update to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));
create policy pricing_meter_rates_delete_admin
on public.pricing_season_meter_rates for delete to authenticated
using ((select private.is_marina_admin(marina_id)));

create policy marina_mandatory_fees_select_member
on public.marina_mandatory_fees for select to authenticated
using ((select private.is_marina_member(marina_id)));
create policy marina_mandatory_fees_insert_admin
on public.marina_mandatory_fees for insert to authenticated
with check ((select private.is_marina_admin(marina_id)));
create policy marina_mandatory_fees_update_admin
on public.marina_mandatory_fees for update to authenticated
using ((select private.is_marina_admin(marina_id)))
with check ((select private.is_marina_admin(marina_id)));
create policy marina_mandatory_fees_delete_admin
on public.marina_mandatory_fees for delete to authenticated
using ((select private.is_marina_admin(marina_id)));

revoke all on table public.marina_pricing_configs from anon, authenticated;
revoke all on table public.pricing_seasons from anon, authenticated;
revoke all on table public.pricing_season_length_rates from anon, authenticated;
revoke all on table public.pricing_season_meter_rates from anon, authenticated;
revoke all on table public.marina_mandatory_fees from anon, authenticated;

grant select, insert, update, delete on table public.marina_pricing_configs to authenticated;
grant select, insert, update, delete on table public.pricing_seasons to authenticated;
grant select, insert, update, delete on table public.pricing_season_length_rates to authenticated;
grant select, insert, update, delete on table public.pricing_season_meter_rates to authenticated;
grant select, insert, update, delete on table public.marina_mandatory_fees to authenticated;

grant all on table public.marina_pricing_configs to service_role;
grant all on table public.pricing_seasons to service_role;
grant all on table public.pricing_season_length_rates to service_role;
grant all on table public.pricing_season_meter_rates to service_role;
grant all on table public.marina_mandatory_fees to service_role;

alter table public.bookings
add column price_currency text,
add column price_total_minor bigint,
add column price_snapshot jsonb,
add constraint bookings_price_snapshot_complete_check check (
  (price_currency is null and price_total_minor is null and price_snapshot is null)
  or
  (
    price_currency is not null
    and price_total_minor is not null
    and price_snapshot is not null
    and
    price_currency ~ '^[A-Z]{3}$'
    and price_total_minor >= 0
    and jsonb_typeof(price_snapshot) = 'object'
    and price_snapshot ?& array['version', 'currency', 'totalMinor']
    and (price_snapshot ->> 'version')::integer = 1
    and price_snapshot ->> 'currency' = price_currency
    and (price_snapshot ->> 'totalMinor')::bigint = price_total_minor
  )
);

create function private.protect_booking_price_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.price_snapshot is not null and (
    new.price_snapshot is distinct from old.price_snapshot
    or new.price_currency is distinct from old.price_currency
    or new.price_total_minor is distinct from old.price_total_minor
  ) then
    raise exception 'A booking price snapshot is immutable once set.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger bookings_protect_price_snapshot
before update on public.bookings
for each row execute function private.protect_booking_price_snapshot();

comment on column public.bookings.price_snapshot is
  'Immutable server-calculated V1 price breakdown. Nullable until public booking creation exists in Phase 5.';
