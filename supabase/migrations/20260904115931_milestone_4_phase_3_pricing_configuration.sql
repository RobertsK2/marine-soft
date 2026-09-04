alter table public.audit_events
drop constraint audit_events_entity_type_check,
add constraint audit_events_entity_type_check
  check (entity_type in ('booking', 'berth', 'payment', 'assignment', 'marina', 'pricing'));

-- The admin UI writes atomically and records one meaningful audit event through
-- replace_marina_pricing_configuration. Existing table grants and tenant RLS stay intact.

create function private.pricing_configuration_snapshot(target_marina_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when config.marina_id is null then null else jsonb_build_object(
    'currency', config.currency,
    'model', config.model,
    'taxBehavior', config.tax_behavior,
    'taxRateBps', config.tax_rate_bps,
    'seasons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', seasons.name,
        'startsOn', seasons.starts_on,
        'endsOn', seasons.ends_on,
        'meterRateMinor', meter_rates.nightly_rate_per_meter_minor,
        'lengthRates', coalesce((
          select jsonb_agg(jsonb_build_object(
            'minLengthM', length_rates.min_length_m,
            'maxLengthM', length_rates.max_length_m,
            'nightlyRateMinor', length_rates.nightly_rate_minor
          ) order by length_rates.min_length_m, length_rates.max_length_m)
          from public.pricing_season_length_rates length_rates
          where length_rates.season_id = seasons.id
            and length_rates.marina_id = target_marina_id
        ), '[]'::jsonb)
      ) order by seasons.starts_on, seasons.ends_on, seasons.name)
      from public.pricing_seasons seasons
      left join public.pricing_season_meter_rates meter_rates
        on meter_rates.season_id = seasons.id
       and meter_rates.marina_id = target_marina_id
      where seasons.marina_id = target_marina_id
    ), '[]'::jsonb),
    'fees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', fees.name,
        'type', fees.fee_type,
        'amountMinor', fees.amount_minor,
        'percentageBps', fees.percentage_bps
      ) order by fees.sort_order, fees.name)
      from public.marina_mandatory_fees fees
      where fees.marina_id = target_marina_id
    ), '[]'::jsonb)
  ) end
  from (select target_marina_id as requested_marina_id) requested
  left join public.marina_pricing_configs config
    on config.marina_id = requested.requested_marina_id;
$$;

revoke all on function private.pricing_configuration_snapshot(uuid)
from public, anon, authenticated, service_role;

create function private.capture_pricing_table_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_data jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  new_data jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data jsonb := coalesce(new_data, old_data);
  event_marina_id uuid := (row_data ->> 'marina_id')::uuid;
  event_actor_id uuid := (select auth.uid());
  event_actor_email text;
  event_type_name text;
  event_summary text;
begin
  if current_setting('berthio.pricing_batch_audit', true) = '1' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE'
    and (old_data - array['updated_at']) = (new_data - array['updated_at']) then
    return new;
  end if;

  event_type_name := case tg_table_name
    when 'marina_pricing_configs' then 'pricing.base_changed'
    when 'pricing_seasons' then 'pricing.season_changed'
    when 'pricing_season_length_rates' then 'pricing.length_rate_changed'
    when 'pricing_season_meter_rates' then 'pricing.meter_rate_changed'
    when 'marina_mandatory_fees' then 'pricing.mandatory_fee_changed'
  end;
  event_summary := case tg_table_name
    when 'marina_pricing_configs' then 'Base pricing and VAT/tax configuration changed'
    when 'pricing_seasons' then 'Pricing season changed'
    when 'pricing_season_length_rates' then 'Vessel-length pricing interval changed'
    when 'pricing_season_meter_rates' then 'Per-meter nightly rate changed'
    when 'marina_mandatory_fees' then 'Mandatory pricing fee changed'
  end;
  select users.email into event_actor_email from auth.users users where users.id = event_actor_id;

  insert into public.audit_events(
    marina_id, event_type, entity_type, entity_id, actor_id, actor_email,
    actor_type, summary, before_data, after_data, metadata
  ) values (
    event_marina_id, event_type_name, 'pricing', event_marina_id,
    event_actor_id, event_actor_email,
    case when event_actor_id is null then 'system' else 'member' end,
    event_summary,
    old_data - array['id', 'created_at', 'updated_at'],
    new_data - array['id', 'created_at', 'updated_at'],
    jsonb_build_object('source_table', tg_table_name, 'operation', lower(tg_op))
  );
  return coalesce(new, old);
end;
$$;

revoke all on function private.capture_pricing_table_audit_event()
from public, anon, authenticated, service_role;

create trigger marina_pricing_configs_capture_audit
after insert or update or delete on public.marina_pricing_configs
for each row execute function private.capture_pricing_table_audit_event();
create trigger pricing_seasons_capture_audit
after insert or update or delete on public.pricing_seasons
for each row execute function private.capture_pricing_table_audit_event();
create trigger pricing_length_rates_capture_audit
after insert or update or delete on public.pricing_season_length_rates
for each row execute function private.capture_pricing_table_audit_event();
create trigger pricing_meter_rates_capture_audit
after insert or update or delete on public.pricing_season_meter_rates
for each row execute function private.capture_pricing_table_audit_event();
create trigger marina_mandatory_fees_capture_audit
after insert or update or delete on public.marina_mandatory_fees
for each row execute function private.capture_pricing_table_audit_event();

create function public.replace_marina_pricing_configuration(
  target_marina_id uuid,
  expected_updated_at timestamptz,
  requested_configuration jsonb
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
  config_exists boolean;
  old_configuration jsonb;
  new_configuration jsonb;
  requested_currency text;
  requested_model public.pricing_model;
  requested_tax_behavior public.tax_behavior;
  requested_tax_rate_bps integer;
  season jsonb;
  season_id uuid;
  rate jsonb;
  fee jsonb;
  fee_index integer := 0;
  previous_audit_suppression text := current_setting('berthio.pricing_batch_audit', true);
begin
  if caller_id is null or not (select private.is_marina_admin(target_marina_id)) then
    raise exception 'Marina admin access is required.' using errcode = '42501';
  end if;

  -- Serialize initial creation as well as updates for one marina.
  perform 1 from public.marinas where id = target_marina_id for update;
  if not found then
    raise exception 'Marina not found.' using errcode = 'P0002';
  end if;
  select configs.updated_at into current_updated_at
  from public.marina_pricing_configs configs
  where configs.marina_id = target_marina_id
  for update;
  config_exists := found;

  if (config_exists and expected_updated_at is distinct from current_updated_at)
    or (not config_exists and expected_updated_at is not null) then
    return query select 'conflict'::text, current_updated_at;
    return;
  end if;

  if jsonb_typeof(requested_configuration) <> 'object' then
    raise exception 'Pricing configuration must be an object.' using errcode = '22023';
  end if;
  requested_currency := requested_configuration ->> 'currency';
  if requested_currency is null or requested_currency !~ '^[A-Z]{3}$' then
    raise exception 'Pricing currency must be a three-letter uppercase code.' using errcode = '22023';
  end if;
  if requested_configuration ->> 'model' not in ('length_interval', 'per_meter') then
    raise exception 'Unsupported pricing model.' using errcode = '22023';
  end if;
  requested_model := (requested_configuration ->> 'model')::public.pricing_model;
  if requested_configuration ->> 'taxBehavior' not in ('exclusive', 'inclusive') then
    raise exception 'Unsupported VAT/tax behavior.' using errcode = '22023';
  end if;
  requested_tax_behavior := (requested_configuration ->> 'taxBehavior')::public.tax_behavior;
  if jsonb_typeof(requested_configuration -> 'taxRateBps') <> 'number'
    or requested_configuration ->> 'taxRateBps' !~ '^\d+$'
    or (requested_configuration ->> 'taxRateBps')::numeric not between 0 and 10000 then
    raise exception 'VAT/tax basis points are invalid.' using errcode = '22023';
  end if;
  requested_tax_rate_bps := (requested_configuration ->> 'taxRateBps')::integer;

  if jsonb_typeof(requested_configuration -> 'seasons') <> 'array'
    or jsonb_array_length(requested_configuration -> 'seasons') not between 1 and 52 then
    raise exception 'Pricing requires between 1 and 52 seasons.' using errcode = '22023';
  end if;
  if jsonb_typeof(requested_configuration -> 'fees') <> 'array'
    or jsonb_array_length(requested_configuration -> 'fees') > 50 then
    raise exception 'Mandatory fees must be an array of at most 50 items.' using errcode = '22023';
  end if;

  old_configuration := private.pricing_configuration_snapshot(target_marina_id);
  perform set_config('berthio.pricing_batch_audit', '1', true);

  if config_exists then
    update public.marina_pricing_configs set
      currency = requested_currency,
      model = requested_model,
      tax_behavior = requested_tax_behavior,
      tax_rate_bps = requested_tax_rate_bps
    where marina_id = target_marina_id;
  else
    insert into public.marina_pricing_configs(marina_id, currency, model, tax_behavior, tax_rate_bps)
    values (target_marina_id, requested_currency, requested_model, requested_tax_behavior, requested_tax_rate_bps);
  end if;

  delete from public.marina_mandatory_fees where marina_id = target_marina_id;
  delete from public.pricing_seasons where marina_id = target_marina_id;

  for season in select value from jsonb_array_elements(requested_configuration -> 'seasons') loop
    if jsonb_typeof(season) <> 'object'
      or char_length(btrim(coalesce(season ->> 'name', ''))) not between 1 and 80
      or coalesce(season ->> 'startsOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(season ->> 'endsOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (season ->> 'endsOn')::date <= (season ->> 'startsOn')::date then
      raise exception 'A pricing season has an invalid name or date interval.' using errcode = '22023';
    end if;

    insert into public.pricing_seasons(marina_id, name, starts_on, ends_on)
    values (target_marina_id, btrim(season ->> 'name'), (season ->> 'startsOn')::date, (season ->> 'endsOn')::date)
    returning id into season_id;

    if requested_model = 'per_meter' then
      if jsonb_typeof(season -> 'meterRateMinor') <> 'number'
        or season ->> 'meterRateMinor' !~ '^\d+$'
        or (season ->> 'meterRateMinor')::numeric > 9007199254740991 then
        raise exception 'A per-meter rate has an invalid minor-unit value.' using errcode = '22023';
      end if;
      insert into public.pricing_season_meter_rates(season_id, marina_id, nightly_rate_per_meter_minor)
      values (season_id, target_marina_id, (season ->> 'meterRateMinor')::bigint);
    else
      if jsonb_typeof(season -> 'lengthRates') <> 'array'
        or jsonb_array_length(season -> 'lengthRates') not between 1 and 100 then
        raise exception 'A fixed-price season requires between 1 and 100 length intervals.' using errcode = '22023';
      end if;
      for rate in select value from jsonb_array_elements(season -> 'lengthRates') loop
        if jsonb_typeof(rate) <> 'object'
          or coalesce(rate ->> 'minLengthM', '') !~ '^\d+(\.\d{1,2})?$'
          or coalesce(rate ->> 'maxLengthM', '') !~ '^\d+(\.\d{1,2})?$'
          or (rate ->> 'minLengthM')::numeric < 0
          or (rate ->> 'maxLengthM')::numeric <= (rate ->> 'minLengthM')::numeric
          or (rate ->> 'maxLengthM')::numeric > 99999.99
          or jsonb_typeof(rate -> 'nightlyRateMinor') <> 'number'
          or rate ->> 'nightlyRateMinor' !~ '^\d+$'
          or (rate ->> 'nightlyRateMinor')::numeric > 9007199254740991 then
          raise exception 'A length interval or its minor-unit price is invalid.' using errcode = '22023';
        end if;
        insert into public.pricing_season_length_rates(
          season_id, marina_id, min_length_m, max_length_m, nightly_rate_minor
        ) values (
          season_id, target_marina_id, (rate ->> 'minLengthM')::numeric,
          (rate ->> 'maxLengthM')::numeric, (rate ->> 'nightlyRateMinor')::bigint
        );
      end loop;
    end if;
  end loop;

  for fee in select value from jsonb_array_elements(requested_configuration -> 'fees') loop
    fee_index := fee_index + 1;
    if jsonb_typeof(fee) <> 'object'
      or char_length(btrim(coalesce(fee ->> 'name', ''))) not between 1 and 80
      or fee ->> 'type' not in ('per_booking', 'per_night', 'per_vessel', 'percentage') then
      raise exception 'A mandatory fee has an invalid name or type.' using errcode = '22023';
    end if;
    if fee ->> 'type' = 'percentage' then
      if jsonb_typeof(fee -> 'percentageBps') <> 'number'
        or fee ->> 'percentageBps' !~ '^\d+$'
        or (fee ->> 'percentageBps')::numeric not between 1 and 10000 then
        raise exception 'A percentage fee has invalid basis points.' using errcode = '22023';
      end if;
      insert into public.marina_mandatory_fees(marina_id, name, fee_type, percentage_bps, sort_order)
      values (target_marina_id, btrim(fee ->> 'name'), 'percentage', (fee ->> 'percentageBps')::integer, fee_index);
    else
      if jsonb_typeof(fee -> 'amountMinor') <> 'number'
        or fee ->> 'amountMinor' !~ '^\d+$'
        or (fee ->> 'amountMinor')::numeric > 9007199254740991 then
        raise exception 'A mandatory fee has an invalid minor-unit amount.' using errcode = '22023';
      end if;
      insert into public.marina_mandatory_fees(marina_id, name, fee_type, amount_minor, sort_order)
      values (
        target_marina_id, btrim(fee ->> 'name'), (fee ->> 'type')::public.mandatory_fee_type,
        (fee ->> 'amountMinor')::bigint, fee_index
      );
    end if;
  end loop;

  new_configuration := private.pricing_configuration_snapshot(target_marina_id);
  if old_configuration is distinct from new_configuration then
    select users.email into caller_email from auth.users users where users.id = caller_id;
    insert into public.audit_events(
      marina_id, event_type, entity_type, entity_id, actor_id, actor_email,
      actor_type, summary, before_data, after_data, metadata
    ) values (
      target_marina_id, 'pricing.configuration_updated', 'pricing', target_marina_id,
      caller_id, caller_email, 'member', 'Marina pricing configuration updated',
      old_configuration, new_configuration,
      jsonb_build_object('source_function', 'replace_marina_pricing_configuration')
    );
  end if;

  perform set_config('berthio.pricing_batch_audit', coalesce(previous_audit_suppression, ''), true);

  return query
  select 'updated'::text, configs.updated_at
  from public.marina_pricing_configs configs
  where configs.marina_id = target_marina_id;
end;
$$;

revoke all on function public.replace_marina_pricing_configuration(uuid, timestamptz, jsonb)
from public, anon, authenticated, service_role;
grant execute on function public.replace_marina_pricing_configuration(uuid, timestamptz, jsonb)
to authenticated;
