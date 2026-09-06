-- =============================================================================
-- Canonical quote-owned commercial editing.
-- Pricing and editable scope live on quotes/quote_items, never scanner artifacts.
-- =============================================================================

alter table public.quote_items
  alter column unit_amount drop not null,
  alter column unit_amount drop default,
  alter column amount drop not null,
  alter column amount drop default;

-- Increment 3 seeded proposal-only items with zero placeholders. No commercial
-- editor existed yet, so these values are unpriced rather than deliberately free.
update public.quote_items qi
set unit_amount = null, amount = null
from public.quotes q
where q.id = qi.quote_id
  and q.commercial_mode = 'proposal_only'
  and qi.unit_amount = 0
  and qi.amount = 0;

alter table public.quotes
  add column recurring_total bigint not null default 0,
  add column recurring_cadence text,
  add column optional_one_time_total bigint not null default 0,
  add column optional_recurring_total bigint not null default 0,
  add constraint quotes_currency_format check (currency ~ '^[A-Z]{3}$'),
  add constraint quotes_commercial_totals_nonnegative check (
    subtotal >= 0 and discount >= 0 and total >= 0
    and recurring_total >= 0 and optional_one_time_total >= 0
    and optional_recurring_total >= 0
  ),
  add constraint quotes_recurring_cadence_valid check (
    recurring_cadence is null or recurring_cadence in ('weekly', 'monthly', 'quarterly', 'annual')
  );

alter table public.quote_items
  add constraint quote_items_quantity_valid check (quantity between 1 and 9999),
  add constraint quote_items_price_pair_valid check (
    (unit_amount is null and amount is null)
    or
    (unit_amount is not null and amount is not null and unit_amount >= 0 and amount >= 0 and amount = quantity * unit_amount)
  );

comment on column public.quote_items.unit_amount is
  'Nullable integer minor units: NULL means unpriced; zero means deliberately free.';
comment on column public.quote_items.amount is
  'Server-derived quantity * unit_amount; NULL exactly when unit_amount is NULL.';
comment on column public.quotes.recurring_total is
  'Committed recurring amount for the single quote cadence; separate from one-time total.';
comment on column public.quotes.optional_one_time_total is
  'Priced optional one-time items; excluded from committed subtotal/total.';
comment on column public.quotes.optional_recurring_total is
  'Priced optional recurring items; excluded from committed recurring_total.';

create or replace function public.bl_quote_commercial_consistent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_quote_id text := case when tg_table_name = 'quotes' then new.id else coalesce(new.quote_id, old.quote_id) end;
  v_item_cadence text;
  v_cadence_count integer;
  v_quote_cadence text;
begin
  select count(distinct qi.recurrence_cadence), max(qi.recurrence_cadence)
    into v_cadence_count, v_item_cadence
  from public.quote_items qi
  where qi.quote_id = v_quote_id and qi.pricing_type = 'recurring';

  if v_cadence_count > 1 then
    raise exception 'A quote may use only one recurring cadence' using errcode = '23514';
  end if;

  select q.recurring_cadence into v_quote_cadence from public.quotes q where q.id = v_quote_id;
  if found and v_quote_cadence is distinct from v_item_cadence then
    raise exception 'Quote recurring cadence must match its recurring items' using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger quote_items_commercial_consistent
  after insert or update or delete on public.quote_items
  deferrable initially deferred
  for each row execute function public.bl_quote_commercial_consistent();

create constraint trigger quotes_commercial_consistent
  after insert or update of recurring_cadence on public.quotes
  deferrable initially deferred
  for each row execute function public.bl_quote_commercial_consistent();

create or replace function public.bl_quote_currency_immutable_when_priced()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.currency is distinct from old.currency
     and exists (select 1 from public.quote_items qi where qi.quote_id = old.id and qi.unit_amount is not null) then
    raise exception 'Quote currency cannot change after pricing begins' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger quotes_currency_immutable_when_priced
  before update of currency on public.quotes
  for each row execute function public.bl_quote_currency_immutable_when_priced();

create or replace function public.bl_promoted_item_starts_unpriced()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source_work_item_id is not null and new.unit_amount = 0 and new.amount = 0
     and exists (select 1 from public.quotes q where q.id = new.quote_id and q.commercial_mode = 'proposal_only') then
    new.unit_amount := null;
    new.amount := null;
  end if;
  return new;
end;
$$;

create trigger quote_items_promoted_start_unpriced
  before insert on public.quote_items
  for each row execute function public.bl_promoted_item_starts_unpriced();

create or replace function public.bl_save_quote_commercial(
  p_quote_id text,
  p_expected_updated_at timestamptz,
  p_title text,
  p_client_note text,
  p_currency text,
  p_discount bigint,
  p_valid_until date,
  p_items jsonb
)
returns table (
  quote_id text,
  updated_at timestamptz,
  subtotal bigint,
  discount bigint,
  total bigint,
  recurring_total bigint,
  recurring_cadence text,
  optional_one_time_total bigint,
  optional_recurring_total bigint,
  pricing_complete boolean,
  item_count integer
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quote public.quotes%rowtype;
  v_item jsonb;
  v_id text;
  v_label text;
  v_description text;
  v_quantity integer;
  v_unit_amount bigint;
  v_pricing_type text;
  v_cadence text;
  v_optional boolean;
  v_sort integer;
  v_keep_ids text[] := array[]::text[];
  v_seen_ids text[] := array[]::text[];
  v_subtotal bigint;
  v_discount bigint;
  v_total bigint;
  v_recurring_total bigint;
  v_recurring_cadence text;
  v_optional_one_time_total bigint;
  v_optional_recurring_total bigint;
  v_complete boolean;
  v_item_count integer;
  v_updated_at timestamptz;
begin
  if public.bl_role() not in ('owner', 'admin') then
    raise exception 'Commercial quote editing requires clients.update' using errcode = '42501';
  end if;

  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if v_quote.updated_at is distinct from p_expected_updated_at then
    raise exception 'Quote was updated by another editor' using errcode = '40001';
  end if;
  if v_quote.commercial_mode = 'proposal_only' and v_quote.status not in ('draft', 'internal_review') then
    raise exception 'Proposal-only quote is not editable in status %', v_quote.status using errcode = '23514';
  end if;
  if v_quote.commercial_mode = 'legacy_client_quote' and v_quote.status not in ('draft', 'internal_review', 'revised') then
    raise exception 'Legacy quote is not editable in status %', v_quote.status using errcode = '23514';
  end if;
  if nullif(btrim(p_title), '') is null then raise exception 'Quote title is required' using errcode = '22023'; end if;
  if p_currency !~ '^[A-Z]{3}$' then raise exception 'Currency must be three uppercase letters' using errcode = '22023'; end if;
  if p_currency is distinct from v_quote.currency
     and exists (select 1 from public.quote_items qi where qi.quote_id = p_quote_id and qi.unit_amount is not null) then
    raise exception 'Quote currency cannot change after pricing begins' using errcode = '23514';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be an array' using errcode = '22023'; end if;

  for v_item, v_sort in
    select value, (ordinality - 1)::integer
    from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Each item must be an object' using errcode = '22023'; end if;
    v_id := nullif(btrim(v_item->>'id'), '');
    v_label := nullif(btrim(v_item->>'label'), '');
    v_description := coalesce(v_item->>'description', '');
    if v_label is null then raise exception 'Item label is required' using errcode = '22023'; end if;
    if coalesce(v_item->>'quantity', '') !~ '^[0-9]+$' then raise exception 'Item quantity must be an integer' using errcode = '22023'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity not between 1 and 9999 then raise exception 'Item quantity is out of range' using errcode = '22023'; end if;

    if not (v_item ? 'unitAmount') or jsonb_typeof(v_item->'unitAmount') = 'null' then
      v_unit_amount := null;
    else
      if (v_item->>'unitAmount') !~ '^[0-9]+$' then raise exception 'Unit amount must be a non-negative integer or null' using errcode = '22023'; end if;
      v_unit_amount := (v_item->>'unitAmount')::bigint;
    end if;
    v_pricing_type := coalesce(v_item->>'pricingType', 'one_time');
    v_cadence := nullif(v_item->>'recurrenceCadence', '');
    v_optional := coalesce((v_item->>'optional')::boolean, false);
    if v_pricing_type not in ('one_time', 'recurring') then raise exception 'Invalid pricing type' using errcode = '22023'; end if;
    if (v_pricing_type = 'one_time' and v_cadence is not null)
       or (v_pricing_type = 'recurring' and coalesce(v_cadence, '') not in ('weekly', 'monthly', 'quarterly', 'annual')) then
      raise exception 'Invalid recurrence cadence' using errcode = '22023';
    end if;

    if v_id is not null then
      if v_id = any(v_seen_ids) then raise exception 'Duplicate quote item id' using errcode = '22023'; end if;
      if not exists (select 1 from public.quote_items qi where qi.id = v_id and qi.quote_id = p_quote_id) then
        raise exception 'Unknown quote item id' using errcode = '22023';
      end if;
      v_seen_ids := array_append(v_seen_ids, v_id);
      update public.quote_items qi set
        label = v_label, description = v_description, quantity = v_quantity,
        unit_amount = v_unit_amount,
        amount = case when v_unit_amount is null then null else v_quantity * v_unit_amount end,
        sort = v_sort, pricing_type = v_pricing_type,
        recurrence_cadence = v_cadence, optional = v_optional
      where qi.id = v_id and qi.quote_id = p_quote_id;
    else
      v_id := 'qit_' || md5(p_quote_id || ':' || v_sort::text || ':' || clock_timestamp()::text || ':' || random()::text);
      insert into public.quote_items (
        id, quote_id, label, description, module_id, quantity, unit_amount, amount,
        sort, source_work_item_id, source_evidence_refs, pricing_type, recurrence_cadence, optional
      ) values (
        v_id, p_quote_id, v_label, v_description, null, v_quantity, v_unit_amount,
        case when v_unit_amount is null then null else v_quantity * v_unit_amount end,
        v_sort, null, '[]'::jsonb, v_pricing_type, v_cadence, v_optional
      );
    end if;
    v_keep_ids := array_append(v_keep_ids, v_id);
  end loop;

  delete from public.quote_items qi
  where qi.quote_id = p_quote_id and not (qi.id = any(v_keep_ids));

  select
    coalesce(sum(qi.amount) filter (where qi.pricing_type = 'one_time' and not qi.optional and qi.amount is not null), 0),
    coalesce(sum(qi.amount) filter (where qi.pricing_type = 'recurring' and not qi.optional and qi.amount is not null), 0),
    max(qi.recurrence_cadence) filter (where qi.pricing_type = 'recurring'),
    coalesce(sum(qi.amount) filter (where qi.pricing_type = 'one_time' and qi.optional and qi.amount is not null), 0),
    coalesce(sum(qi.amount) filter (where qi.pricing_type = 'recurring' and qi.optional and qi.amount is not null), 0),
    count(*)::integer,
    count(*) > 0 and count(*) filter (where not qi.optional and qi.unit_amount is null) = 0,
    count(distinct qi.recurrence_cadence) filter (where qi.pricing_type = 'recurring')
  into v_subtotal, v_recurring_total, v_recurring_cadence,
       v_optional_one_time_total, v_optional_recurring_total,
       v_item_count, v_complete, v_sort
  from public.quote_items qi where qi.quote_id = p_quote_id;

  if v_sort > 1 then raise exception 'A quote may use only one recurring cadence' using errcode = '23514'; end if;
  v_discount := least(greatest(coalesce(p_discount, 0), 0), v_subtotal);
  v_total := v_subtotal - v_discount;
  v_updated_at := clock_timestamp();

  update public.quotes set
    title = btrim(p_title), client_note = coalesce(p_client_note, ''), currency = p_currency,
    discount = v_discount, valid_until = p_valid_until,
    subtotal = v_subtotal, total = v_total,
    recurring_total = v_recurring_total, recurring_cadence = v_recurring_cadence,
    optional_one_time_total = v_optional_one_time_total,
    optional_recurring_total = v_optional_recurring_total,
    updated_at = v_updated_at
  where id = p_quote_id;

  return query select p_quote_id, v_updated_at, v_subtotal, v_discount, v_total,
    v_recurring_total, v_recurring_cadence, v_optional_one_time_total,
    v_optional_recurring_total, v_complete, v_item_count;
end;
$$;

revoke execute on function public.bl_save_quote_commercial(text,timestamptz,text,text,text,bigint,date,jsonb) from public, anon;
grant execute on function public.bl_save_quote_commercial(text,timestamptz,text,text,text,bigint,date,jsonb) to authenticated;

comment on function public.bl_save_quote_commercial(text,timestamptz,text,text,text,bigint,date,jsonb) is
  'Atomic, optimistic-concurrency quote scope/pricing save. Totals and item amounts are server-derived; scanner lineage is never accepted as input.';
