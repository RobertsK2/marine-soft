create type public.booking_status as enum (
  'confirmed',
  'cancelled',
  'checked_in',
  'checked_out'
);

-- Phase 4 is manual-only. Future online and walk-in sources are intentionally
-- not added until those intake flows exist.
create type public.booking_source as enum ('manual');

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'BK-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
  )
    constraint bookings_reference_format_check
    check (reference ~ '^BK-[A-Z0-9]{10}$'),
  marina_id uuid not null references public.marinas (id) on delete cascade,
  arrival_date date not null,
  departure_date date not null,
  eta time without time zone not null,
  etd time without time zone not null,
  customer_name text not null
    constraint bookings_customer_name_check
    check (
      customer_name = btrim(customer_name)
      and char_length(customer_name) between 1 and 160
    ),
  customer_email text not null
    constraint bookings_customer_email_check
    check (
      customer_email = btrim(customer_email)
      and char_length(customer_email) between 3 and 254
    ),
  customer_phone text not null
    constraint bookings_customer_phone_check
    check (
      customer_phone = btrim(customer_phone)
      and char_length(customer_phone) between 5 and 40
    ),
  vessel_name text
    constraint bookings_vessel_name_check
    check (
      vessel_name is null
      or (
        vessel_name = btrim(vessel_name)
        and char_length(vessel_name) between 1 and 120
      )
    ),
  vessel_length_m numeric(6, 2) not null
    constraint bookings_vessel_length_positive_check
    check (vessel_length_m > 0),
  vessel_beam_m numeric(6, 2) not null
    constraint bookings_vessel_beam_positive_check
    check (vessel_beam_m > 0),
  vessel_draft_m numeric(6, 2) not null
    constraint bookings_vessel_draft_positive_check
    check (vessel_draft_m > 0),
  status public.booking_status not null default 'confirmed',
  source public.booking_source not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_stay_interval_check check (departure_date > arrival_date)
);

comment on constraint bookings_stay_interval_check on public.bookings is
  'Booking stays use [arrival_date, departure_date) interval semantics.';

create index bookings_marina_arrival_departure_idx
on public.bookings (marina_id, arrival_date, departure_date);

create index bookings_marina_status_arrival_idx
on public.bookings (marina_id, status, arrival_date);

create trigger bookings_set_updated_at
before update on public.bookings
for each row execute function private.set_updated_at();

alter table public.bookings enable row level security;

create policy bookings_select_member
on public.bookings for select
to authenticated
using ((select private.is_marina_member(marina_id)));

create policy bookings_insert_member
on public.bookings for insert
to authenticated
with check ((select private.is_marina_member(marina_id)));

create policy bookings_update_member
on public.bookings for update
to authenticated
using ((select private.is_marina_member(marina_id)))
with check ((select private.is_marina_member(marina_id)));

revoke all on table public.bookings from anon, authenticated;
grant select on table public.bookings to authenticated;
grant insert (
  marina_id,
  arrival_date,
  departure_date,
  eta,
  etd,
  customer_name,
  customer_email,
  customer_phone,
  vessel_name,
  vessel_length_m,
  vessel_beam_m,
  vessel_draft_m
) on table public.bookings to authenticated;
grant update (
  arrival_date,
  departure_date,
  eta,
  etd,
  customer_name,
  customer_email,
  customer_phone,
  vessel_name,
  vessel_length_m,
  vessel_beam_m,
  vessel_draft_m,
  status
) on table public.bookings to authenticated;

grant all on table public.bookings to service_role;
