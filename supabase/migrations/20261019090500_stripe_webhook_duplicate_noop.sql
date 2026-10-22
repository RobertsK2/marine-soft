create or replace function public.process_stripe_checkout_event(
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

  if not event_is_new then
    select outcome into event_outcome
    from public.stripe_webhook_events
    where stripe_event_id = target_event_id
    for update;

    if event_outcome <> 'critical_paid_without_booking' then
      return 'duplicate';
    end if;
  end if;

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
