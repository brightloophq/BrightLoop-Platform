-- Sprint 1F: convert an approved scanner package into the canonical, private
-- sales proposal model. Conversion is a single transaction and is unique per
-- scanner run. No client delivery or acceptance occurs here.

alter table public.proposals
  add column currency text not null default 'USD',
  add column discount_minor bigint not null default 0,
  add column valid_until date,
  alter column subtotal type bigint,
  alter column deposit type bigint,
  alter column total type bigint;

alter table public.proposals
  add constraint proposals_currency_iso check (currency ~ '^[A-Z]{3}$'),
  add constraint proposals_discount_nonnegative check (discount_minor >= 0);

-- The old policy exposed drafts to client sessions despite the portal's comment
-- claiming otherwise. Keep every historical draft private; clients only see a
-- proposal after an explicit sent transition.
drop policy "proposals_select" on public.proposals;
create policy "proposals_select" on public.proposals
  for select to authenticated
  using (
    public.bl_is_internal()
    or (client_id = public.bl_client_id()
      and status in ('sent', 'viewed', 'accepted', 'change_requested', 'revised', 'expired'))
  );

create table public.scanner_sales_conversions (
  id                     text primary key,
  run_id                 text not null unique references public.intelligence_runs (id) on delete restrict,
  client_id              text not null references public.clients (id) on delete restrict,
  proposal_id            text not null unique references public.proposals (id) on delete restrict,
  idempotency_key        text not null unique,
  source_binding         jsonb not null,
  client_safe_snapshot   jsonb not null,
  prospect_identity      jsonb not null default '{}'::jsonb,
  converted_by           text not null references public.users (id) on delete restrict,
  converted_at           timestamptz not null default now(),
  constraint scanner_sales_conversion_snapshot_object check (jsonb_typeof(client_safe_snapshot) = 'object'),
  constraint scanner_sales_conversion_binding_object check (jsonb_typeof(source_binding) = 'object')
);
comment on table public.scanner_sales_conversions is
  'Immutable idempotency and provenance mapping from one approved scanner run to its canonical private proposal.';

alter table public.scanner_sales_conversions enable row level security;
create policy "scanner_sales_conversions_internal_read" on public.scanner_sales_conversions
  for select to authenticated using (public.bl_is_internal());
revoke all on public.scanner_sales_conversions from public, anon, authenticated, service_role;
grant select on public.scanner_sales_conversions to authenticated;

create or replace function public.bl_scanner_sales_conversion_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'scanner_sales_conversions is append-only' using errcode = '55000';
end;
$$;
create trigger scanner_sales_conversions_no_mutation
  before update or delete on public.scanner_sales_conversions
  for each row execute function public.bl_scanner_sales_conversion_immutable();
create trigger scanner_sales_conversions_no_truncate
  before truncate on public.scanner_sales_conversions
  for each statement execute function public.bl_scanner_sales_conversion_immutable();

create or replace function public.bl_convert_scanner_package(p_run_id text, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_auth uuid := auth.uid();
  v_actor text;
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_run public.intelligence_runs%rowtype;
  v_proposal public.proposal_versions%rowtype;
  v_narrative public.narrative_versions%rowtype;
  v_report public.intelligence_artifacts%rowtype;
  v_competitor public.intelligence_artifacts%rowtype;
  v_core public.intelligence_artifacts%rowtype;
  v_review public.runtime_events%rowtype;
  v_binding jsonb;
  v_pricing jsonb;
  v_work jsonb;
  v_line jsonb;
  v_item jsonb;
  v_line_items jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_identity jsonb;
  v_company text;
  v_proposal_id text;
  v_conversion_id text;
  v_currency text;
  v_valid_until date;
  v_discount numeric;
  v_subtotal numeric := 0;
  v_total numeric;
  v_monthly numeric := 0;
  v_one_time numeric := 0;
  v_line_amount numeric;
  v_quantity integer;
  v_now timestamptz := now();
  v_existing public.scanner_sales_conversions%rowtype;
  v_failure boolean;
begin
  if auth.role() <> 'authenticated' or v_actor_auth is null or v_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Owner or admin authorization required';
  end if;
  if p_run_id is null or p_run_id = '' or p_idempotency_key is null
    or length(p_idempotency_key) < 16 or length(p_idempotency_key) > 128 then
    raise exception using errcode = '22023', message = 'Invalid conversion request';
  end if;
  select u.id into v_actor from public.users u
    where u.auth_user_id = v_actor_auth and u.role::text = v_role and u.status = 'active';
  if v_actor is null then
    raise exception using errcode = '42501', message = 'Authenticated owner or admin identity is unavailable';
  end if;

  -- Matches the lock used by version writers and approval binding validation.
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:' || p_run_id, 0));
  select * into v_run from public.intelligence_runs r where r.id = p_run_id for update;
  if not found or v_run.status <> 'completed' or v_run.client_id is null
    or not exists (select 1 from public.clients c where c.id = v_run.client_id) then
    raise exception using errcode = '40001', message = 'Scanner run is incomplete or unavailable';
  end if;

  select * into v_proposal from public.proposal_versions p
    where p.run_id = p_run_id order by p.version desc limit 1;
  select * into v_narrative from public.narrative_versions n
    where n.run_id = p_run_id and n.audience = 'client' order by n.version desc limit 1;
  select * into v_report from public.intelligence_artifacts a
    where a.run_id = p_run_id and a.kind = 'internal_intelligence_report' order by a.version desc limit 1;
  select * into v_competitor from public.intelligence_artifacts a
    where a.run_id = p_run_id and a.kind = 'competitor_snapshot' order by a.version desc limit 1;
  select * into v_core from public.intelligence_artifacts a
    where a.run_id = p_run_id and a.kind = 'proposal' order by a.version desc limit 1;
  if v_proposal.id is null or v_narrative.id is null or v_report.id is null
    or v_report.validation_status <> 'valid'
    or v_proposal.envelope ->> 'status' <> 'draft_ready'
    or v_narrative.envelope ->> 'status' <> 'ready'
    or jsonb_typeof(v_narrative.envelope -> 'sections') is distinct from 'array'
    or (v_core.id is not null and v_core.validation_status = 'invalid') then
    raise exception using errcode = '40001', message = 'Required current scanner artifacts are unavailable';
  end if;
  if jsonb_array_length(v_narrative.envelope -> 'sections') = 0 then
    raise exception using errcode = '40001', message = 'Client narrative is empty';
  end if;

  -- A missing competitor artifact is eligible only when the workflow recorded
  -- that its stage completed (including the insufficient-evidence outcome).
  if v_competitor.id is null and not exists (
    select 1 from public.runtime_events e where e.run_id = p_run_id
      and e.stage = 'competitor_intelligence'
      and e.event_type = 'runtime.commercial.stage_completed'
  ) then
    raise exception using errcode = '40001', message = 'Competitor intelligence is incomplete';
  end if;
  if v_competitor.id is not null and v_competitor.validation_status = 'invalid' then
    raise exception using errcode = '40001', message = 'Competitor intelligence is invalid';
  end if;

  -- Fail closed on a latest unresolved commercial failure for any stage.
  select exists (
    select 1 from (
      select distinct on (e.stage) e.event_type
      from public.runtime_events e
      where e.run_id = p_run_id and e.stage in (
        'competitor_intelligence', 'proposal_generation', 'narrative_generation'
      ) and e.event_type in (
        'runtime.commercial.stage_failed', 'runtime.job.dead_lettered',
        'runtime.commercial.enqueue_failed', 'runtime.commercial.stage_completed',
        'runtime.commercial.enqueued'
      ) order by e.stage, e.sequence desc
    ) latest where latest.event_type in (
      'runtime.commercial.stage_failed', 'runtime.job.dead_lettered', 'runtime.commercial.enqueue_failed'
    )
  ) into v_failure;
  if v_failure then
    raise exception using errcode = '40001', message = 'An unresolved commercial workflow failure blocks conversion';
  end if;

  v_binding := jsonb_build_object(
    'schemaVersion', 1,
    'proposal', jsonb_build_object('id', v_proposal.id, 'version', v_proposal.version, 'checksum', v_proposal.checksum),
    'narrative', jsonb_build_object('id', v_narrative.id, 'version', v_narrative.version, 'checksum', v_narrative.checksum),
    'report', jsonb_build_object('id', v_report.id, 'version', v_report.version, 'checksum', v_report.checksum),
    'competitor', case when v_competitor.id is null then null else jsonb_build_object('id', v_competitor.id, 'version', v_competitor.version, 'checksum', v_competitor.checksum) end,
    'coreProposal', case when v_core.id is null then null else jsonb_build_object('id', v_core.id, 'version', v_core.version, 'checksum', v_core.checksum) end
  );
  select * into v_review from public.runtime_events e where e.run_id = p_run_id
    and e.aggregate_type = 'intelligence_run' and e.aggregate_id = p_run_id
    and e.event_type in ('runtime.review.approved', 'runtime.review.rejected', 'runtime.review.revision_requested')
    order by e.sequence desc limit 1;
  if v_review.id is null or v_review.event_type <> 'runtime.review.approved'
    or v_review.payload -> 'binding' is distinct from v_binding then
    raise exception using errcode = '40001', message = 'No current approval is bound to this package';
  end if;

  v_pricing := v_proposal.envelope -> 'pricing';
  if v_proposal.envelope ->> 'commercialState' <> 'priced'
    or jsonb_typeof(v_pricing) is distinct from 'object'
    or jsonb_typeof(v_pricing -> 'items') is distinct from 'array'
    or not (v_pricing ->> 'validUntil' ~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception using errcode = '40001', message = 'Complete commercial pricing and expiry are required';
  end if;
  if jsonb_array_length(v_pricing -> 'items') = 0 then
    raise exception using errcode = '40001', message = 'Commercial pricing has no line items';
  end if;
  begin
    v_valid_until := (v_pricing ->> 'validUntil')::date;
  exception when others then
    raise exception using errcode = '40001', message = 'Commercial expiry date is invalid';
  end;
  if v_valid_until < current_date then
    raise exception using errcode = '40001', message = 'Commercial terms have expired';
  end if;
  v_currency := v_pricing ->> 'currency';
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception using errcode = '40001', message = 'Commercial currency is invalid';
  end if;
  if jsonb_typeof(v_pricing -> 'discountMinor') <> 'number' then
    raise exception using errcode = '40001', message = 'Commercial discount is invalid';
  end if;
  v_discount := (v_pricing ->> 'discountMinor')::numeric;
  if v_discount < 0 or v_discount <> trunc(v_discount) or v_discount > 9007199254740991 then
    raise exception using errcode = '40001', message = 'Commercial discount is invalid';
  end if;
  v_work := v_proposal.envelope -> 'recommendedWork';
  if jsonb_typeof(v_work) <> 'array' then
    raise exception using errcode = '40001', message = 'Proposal scope is invalid';
  end if;

  -- Recompute totals from canonical line inputs and fail closed on malformed,
  -- duplicate, orphaned, or missing required work. Numeric bounds match JS safe ints.
  for v_line in select value from jsonb_array_elements(v_pricing -> 'items') loop
    if not exists (select 1 from jsonb_array_elements(v_work) as w(value) where w.value ->> 'sourceId' = v_line ->> 'sourceId')
      or (select count(*) from jsonb_array_elements(v_pricing -> 'items') as x(value) where x.value ->> 'sourceId' = v_line ->> 'sourceId') <> 1
      or (v_line ->> 'pricingType' not in ('one_time', 'recurring'))
      or (v_line ->> 'pricingType' = 'recurring' and v_line ->> 'cadence' <> 'monthly')
      or jsonb_typeof(v_line -> 'amountMinor') <> 'number'
      or jsonb_typeof(v_line -> 'quantity') <> 'number'
      or jsonb_typeof(v_line -> 'optional') <> 'boolean' then
      raise exception using errcode = '40001', message = 'Commercial line items are invalid';
    end if;
    v_line_amount := (v_line ->> 'amountMinor')::numeric;
    v_quantity := (v_line ->> 'quantity')::integer;
    if v_line_amount < 0 or v_line_amount <> trunc(v_line_amount) or v_line_amount > 9007199254740991
      or v_quantity < 1 or v_quantity > 9999 or v_line_amount * v_quantity > 9007199254740991 then
      raise exception using errcode = '40001', message = 'Commercial line amounts or quantities are invalid';
    end if;
    if v_line ->> 'pricingType' = 'recurring' then v_monthly := v_monthly + v_line_amount * v_quantity;
    else v_one_time := v_one_time + v_line_amount * v_quantity; end if;
    select w.value into v_item from jsonb_array_elements(v_work) as w(value) where w.value ->> 'sourceId' = v_line ->> 'sourceId' limit 1;
    v_line_items := v_line_items || jsonb_build_array(jsonb_build_object(
      'label', v_item ->> 'title', 'description', v_item ->> 'solution',
      'quantity', v_quantity, 'amount', (v_line_amount * v_quantity)::bigint,
      'unitAmountMinor', v_line_amount::bigint, 'pricingType', v_line ->> 'pricingType',
      'cadence', v_line -> 'cadence', 'optional', (v_line ->> 'optional')::boolean
    ));
  end loop;
  if exists (
    select 1 from jsonb_array_elements(v_work) as w(value)
    where not exists (select 1 from jsonb_array_elements(v_pricing -> 'items') as x(value) where x.value ->> 'sourceId' = w.value ->> 'sourceId')
  ) then
    -- The completeness function regards unpriced work as required. Optionality is
    -- only known from the authoritative price line, so absence always blocks.
    raise exception using errcode = '40001', message = 'Required proposal scope is unpriced';
  end if;
  v_subtotal := v_one_time;
  v_total := greatest(0, v_one_time - v_discount);
  if v_subtotal > 9007199254740991 or v_total > 9007199254740991 or v_monthly > 9007199254740991
    or (v_pricing ->> 'subtotalOneTimeMinor')::numeric is distinct from v_subtotal
    or (v_pricing ->> 'totalOneTimeMinor')::numeric is distinct from v_total
    or (v_pricing ->> 'totalRecurringMonthlyMinor')::numeric is distinct from v_monthly then
    raise exception using errcode = '40001', message = 'Commercial totals do not match line items';
  end if;

  -- Keep prospect identity internal; only the approved narrative and allowlisted
  -- scope/pricing fields are copied into the immutable client-safe snapshot.
  select c.company into v_company from public.clients c where c.id = v_run.client_id;
  v_identity := jsonb_build_object(
    'businessName', coalesce(nullif(v_run.metadata ->> 'businessName', ''), v_company),
    'website', coalesce(v_run.metadata ->> 'rootUrl', v_run.metadata ->> 'targetUrl'),
    'contactName', v_run.metadata ->> 'contactName', 'email', v_run.metadata ->> 'email',
    'industry', coalesce(v_run.metadata ->> 'industry', (select c.industry from public.clients c where c.id = v_run.client_id))
  );
  v_snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'proposal', jsonb_build_object('executiveSummary', v_proposal.envelope -> 'executiveSummary',
      'observedSituation', v_proposal.envelope -> 'observedSituation',
      'keyIssues', coalesce((select jsonb_agg(jsonb_build_object('title', x.value -> 'title', 'detail', x.value -> 'detail')) from jsonb_array_elements(v_proposal.envelope -> 'keyIssues') as x(value)), '[]'::jsonb),
      'opportunities', coalesce((select jsonb_agg(jsonb_build_object('title', x.value -> 'title', 'detail', x.value -> 'detail')) from jsonb_array_elements(v_proposal.envelope -> 'opportunities') as x(value)), '[]'::jsonb),
      'scope', v_line_items, 'proposedNextStep', v_proposal.envelope -> 'proposedNextStep'),
    'narrative', coalesce((select jsonb_agg(jsonb_build_object('key', x -> 'key', 'heading', x -> 'heading', 'paragraphs', x -> 'paragraphs') order by ord)
      from jsonb_array_elements(v_narrative.envelope -> 'sections') with ordinality as s(x, ord)), '[]'::jsonb),
    'pricing', jsonb_build_object('currency', v_currency, 'discountMinor', v_discount::bigint,
      'subtotalOneTimeMinor', v_subtotal::bigint, 'totalOneTimeMinor', v_total::bigint,
      'totalRecurringMonthlyMinor', v_monthly::bigint, 'validUntil', v_valid_until)
  );

  -- Replays return the one existing conversion only while its source approval is
  -- still current; a revised package must not masquerade as a successful retry.
  select * into v_existing from public.scanner_sales_conversions c where c.run_id = p_run_id;
  if found then
    if v_existing.client_id <> v_run.client_id or v_existing.source_binding is distinct from v_binding then
      raise exception using errcode = '40001', message = 'Existing conversion is stale or belongs to another client';
    end if;
    return jsonb_build_object('conversionId', v_existing.id, 'proposalId', v_existing.proposal_id,
      'runId', v_existing.run_id, 'clientId', v_existing.client_id, 'convertedAt', v_existing.converted_at, 'replayed', true);
  end if;

  v_proposal_id := 'prp_' || replace(gen_random_uuid()::text, '-', '');
  v_conversion_id := 'scv_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.proposals(id, client_id, line_items, subtotal, deposit, total, status, currency, discount_minor, valid_until)
    values (v_proposal_id, v_run.client_id, v_line_items, v_subtotal::bigint, 0, v_total::bigint,
      'draft', v_currency, v_discount::bigint, v_valid_until);
  insert into public.scanner_sales_conversions(id, run_id, client_id, proposal_id, idempotency_key,
    source_binding, client_safe_snapshot, prospect_identity, converted_by, converted_at)
    values (v_conversion_id, p_run_id, v_run.client_id, v_proposal_id, p_idempotency_key,
      v_binding, v_snapshot, v_identity, v_actor, v_now);
  return jsonb_build_object('conversionId', v_conversion_id, 'proposalId', v_proposal_id,
    'runId', p_run_id, 'clientId', v_run.client_id, 'convertedAt', v_now, 'replayed', false);
exception when unique_violation then
  -- A concurrent different key can win the unique-run race. Return the winner
  -- only if it describes the exact same current source binding.
  select * into v_existing from public.scanner_sales_conversions c where c.run_id = p_run_id;
  if found and v_existing.client_id = v_run.client_id and v_existing.source_binding = v_binding then
    return jsonb_build_object('conversionId', v_existing.id, 'proposalId', v_existing.proposal_id,
      'runId', v_existing.run_id, 'clientId', v_existing.client_id, 'convertedAt', v_existing.converted_at, 'replayed', true);
  end if;
  raise exception using errcode = '40001', message = 'Conversion already exists or request was replayed with a different key';
end;
$$;

create or replace function public.bl_get_scanner_sales_conversion(p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_actor uuid := auth.uid();
  v_user text;
  v_conversion public.scanner_sales_conversions%rowtype;
begin
  if auth.role() <> 'authenticated' or v_actor is null or v_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Owner or admin authorization required';
  end if;
  select u.id into v_user from public.users u
    where u.auth_user_id = v_actor and u.role::text = v_role and u.status = 'active';
  if v_user is null then
    raise exception using errcode = '42501', message = 'Authenticated owner or admin identity is unavailable';
  end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.run_id = p_run_id;
  if not found then return null; end if;
  return jsonb_build_object('conversionId', v_conversion.id, 'proposalId', v_conversion.proposal_id,
    'runId', v_conversion.run_id, 'clientId', v_conversion.client_id,
    'convertedBy', v_conversion.converted_by, 'convertedAt', v_conversion.converted_at,
    'sourceBinding', v_conversion.source_binding);
end;
$$;

revoke all on function public.bl_convert_scanner_package(text, text) from public, anon, service_role;
grant execute on function public.bl_convert_scanner_package(text, text) to authenticated;
revoke all on function public.bl_get_scanner_sales_conversion(text) from public, anon, service_role;
grant execute on function public.bl_get_scanner_sales_conversion(text) to authenticated;
