-- Extend the existing signed-guest projection without exposing internal IDs.
-- Existing callers keep the same input and receive the same fields plus the
-- optional arrival preference. No booking or payment data is rewritten.
drop function public.get_guest_booking(uuid);
create function public.get_guest_booking(target_grant_id uuid)
returns table (
  booking_reference text,
  marina_name text,
  arrival_date date,
  departure_date date,
  eta time without time zone,
  etd time without time zone,
  vessel_name text,
  vessel_length_m numeric,
  vessel_beam_m numeric,
  vessel_draft_m numeric,
  price_total_minor bigint,
  price_currency text,
  booking_status public.booking_status,
  access_expires_at timestamptz,
  balance_due_minor bigint,
  collection_method public.booking_collection_method,
  eta_window text
)
language sql stable security invoker set search_path = '' as $$
  select
    bookings.reference,
    marinas.name,
    bookings.arrival_date,
    bookings.departure_date,
    bookings.eta,
    bookings.etd,
    bookings.vessel_name,
    bookings.vessel_length_m,
    bookings.vessel_beam_m,
    bookings.vessel_draft_m,
    bookings.price_total_minor,
    bookings.price_currency,
    bookings.status,
    grants.expires_at,
    coalesce(balances.balance_due_minor,case when bookings.booking_payment_id is not null then 0 else bookings.price_total_minor end),
    coalesce(balances.collection_method,case when bookings.booking_payment_id is not null then 'berthio'::public.booking_collection_method else 'on_site'::public.booking_collection_method end),
    bookings.eta_window
  from public.guest_booking_access_grants grants
  join public.bookings bookings on bookings.id = grants.booking_id
  left join public.booking_payment_balances balances on balances.booking_id=bookings.id and balances.marina_id=bookings.marina_id
  join public.marinas marinas on marinas.id = bookings.marina_id
  where grants.id = target_grant_id
    and grants.revoked_at is null
    and grants.expires_at > statement_timestamp();
$$;
revoke all on function public.get_guest_booking(uuid) from public, anon, authenticated;
grant execute on function public.get_guest_booking(uuid) to service_role;
