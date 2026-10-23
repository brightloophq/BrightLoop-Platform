-- Recompute the immutable approved USD projection at the publication boundary.
-- Scanner pricing has no deposit field yet, so converted proposals must retain 0.
begin;

create function public.bl_validate_scanner_sales_publication_amounts()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare
  v_snapshot jsonb;
  v_item jsonb;
  v_unit numeric;
  v_quantity numeric;
  v_amount numeric;
  v_discount numeric;
  v_one_time numeric := 0;
  v_recurring numeric := 0;
begin
  if old.status <> 'draft' or new.status <> 'sent'
    or not exists (select 1 from public.scanner_sales_conversions c where c.proposal_id = old.id) then
    return new;
  end if;
  select c.client_safe_snapshot into v_snapshot from public.scanner_sales_conversions c where c.proposal_id = old.id;
  if jsonb_typeof(new.line_items) is distinct from 'array' or jsonb_array_length(new.line_items) = 0 then
    raise exception 'Approved proposal has no valid line items' using errcode = '40001';
  end if;
  for v_item in select value from jsonb_array_elements(new.line_items) loop
    if jsonb_typeof(v_item -> 'unitAmountMinor') <> 'number'
      or jsonb_typeof(v_item -> 'amount') <> 'number'
      or jsonb_typeof(v_item -> 'quantity') <> 'number'
      or jsonb_typeof(v_item -> 'optional') <> 'boolean'
      or v_item ->> 'pricingType' not in ('one_time','recurring') then
      raise exception 'Approved line item is malformed' using errcode = '40001';
    end if;
    v_unit := (v_item ->> 'unitAmountMinor')::numeric;
    v_amount := (v_item ->> 'amount')::numeric;
    v_quantity := (v_item ->> 'quantity')::numeric;
    if v_unit < 0 or v_unit <> trunc(v_unit) or v_unit > 9007199254740991
      or v_quantity < 1 or v_quantity > 9999 or v_quantity <> trunc(v_quantity)
      or v_amount <> v_unit * v_quantity or v_amount > 9007199254740991 then
      raise exception 'Approved line amount or quantity is invalid' using errcode = '40001';
    end if;
    if v_item ->> 'pricingType' = 'recurring' then
      if v_item ->> 'cadence' <> 'monthly' then raise exception 'Recurring cadence is invalid' using errcode = '40001'; end if;
      v_recurring := v_recurring + v_amount;
    else
      v_one_time := v_one_time + v_amount;
    end if;
  end loop;
  v_discount := new.discount_minor::numeric;
  if new.currency <> 'USD' or new.deposit <> 0 or v_discount < 0 or v_discount <> trunc(v_discount)
    or v_one_time <> new.subtotal or greatest(0, v_one_time - v_discount) <> new.total
    or v_snapshot #>> '{pricing,currency}' <> new.currency
    or (v_snapshot #>> '{pricing,discountMinor}')::numeric <> v_discount
    or (v_snapshot #>> '{pricing,subtotalOneTimeMinor}')::numeric <> v_one_time
    or (v_snapshot #>> '{pricing,totalOneTimeMinor}')::numeric <> new.total
    or (v_snapshot #>> '{pricing,totalRecurringMonthlyMinor}')::numeric <> v_recurring
    or v_snapshot #> '{proposal,scope}' is distinct from new.line_items
    or (v_snapshot #>> '{pricing,validUntil}')::date is distinct from new.valid_until then
    raise exception 'Approved commercial totals do not match the canonical proposal' using errcode = '40001';
  end if;
  return new;
end;
$$;

create trigger proposals_scanner_publication_amount_guard
  before update on public.proposals
  for each row execute function public.bl_validate_scanner_sales_publication_amounts();
revoke all on function public.bl_validate_scanner_sales_publication_amounts() from public, anon, authenticated, service_role;
commit;
