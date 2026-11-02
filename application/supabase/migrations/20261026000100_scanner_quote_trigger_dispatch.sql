-- Avoid resolving quote_items-only fields from a polymorphic trigger record
-- while handling a quotes row. The original CASE expression referenced NEW.id
-- and NEW.quote_id in one expression and failed on deployments where PostgreSQL
-- resolved the absent field against the active trigger's record shape.
create or replace function public.bl_quote_commercial_consistent()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_quote_id text;
  v_item_cadence text;
  v_cadence_count integer;
  v_quote_cadence text;
begin
  if tg_table_name = 'quotes' then
    v_quote_id := new.id;
  elsif tg_op = 'DELETE' then
    v_quote_id := old.quote_id;
  else
    v_quote_id := new.quote_id;
  end if;

  select count(distinct qi.recurrence_cadence), max(qi.recurrence_cadence)
    into v_cadence_count, v_item_cadence
  from public.quote_items qi
  where qi.quote_id = v_quote_id and qi.pricing_type = 'recurring';

  if v_cadence_count > 1 then
    raise exception 'A quote may use only one recurring cadence' using errcode = '23514';
  end if;

  select q.recurring_cadence into v_quote_cadence
  from public.quotes q where q.id = v_quote_id;
  if found and v_quote_cadence is distinct from v_item_cadence then
    raise exception 'Quote recurring cadence must match its recurring items' using errcode = '23514';
  end if;
  return null;
end;
$$;

create or replace function public.bl_guard_scanner_quote_item_terms()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  qid text;
begin
  if tg_op = 'DELETE' then
    qid := old.quote_id;
  else
    qid := new.quote_id;
  end if;

  if exists (
    select 1 from public.quotes q
    where q.id = qid and q.commercial_mode = 'proposal_only' and q.source_run_id is not null
  ) then
    raise exception 'Scanner quote items are immutable; create a new scanner commercial version' using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Keep the revision RPC's local quote_id variable distinct from the column
-- when checking for an existing revision. This is a forward-only replacement
-- because the earlier function is already in the merged migration history.
create or replace function public.bl_create_scanner_sales_revision(p_predecessor_proposal_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  au uuid:=auth.uid(); role_name text:=auth.jwt()->'app_metadata'->>'role'; actor_id text;
  conv public.scanner_sales_conversions%rowtype; parent public.proposals%rowtype; parent_pub public.scanner_sales_publications%rowtype;
  head public.scanner_sales_offer_heads%rowtype; runrow public.intelligence_runs%rowtype;
  pkg public.proposal_versions%rowtype; narrative public.narrative_versions%rowtype; reviewrow public.runtime_events%rowtype;
  binding jsonb; key text; quote_id text; promoted record; q public.quotes%rowtype; revision_id text;
begin
  if auth.role()<>'authenticated' or au is null or role_name not in ('owner','admin') then raise exception using errcode='42501'; end if;
  select id into actor_id from public.users where auth_user_id=au and role::text=role_name and status='active';
  if actor_id is null then raise exception using errcode='42501',message='Active owner/admin identity required'; end if;
  select * into conv from public.scanner_sales_conversions where proposal_id=p_predecessor_proposal_id;
  if conv.id is null then select c.* into conv from public.scanner_sales_proposal_revisions r join public.scanner_sales_conversions c on c.id=r.conversion_id where r.proposal_id=p_predecessor_proposal_id; end if;
  if conv.id is null then raise exception using errcode='P0002',message='Published scanner conversion not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||conv.run_id,0));
  select * into conv from public.scanner_sales_conversions where id=conv.id for update;
  select * into head from public.scanner_sales_offer_heads where conversion_id=conv.id for update;
  select * into parent from public.proposals where id=p_predecessor_proposal_id for update;
  select * into parent_pub from public.scanner_sales_publications where proposal_id=parent.id;
  if head.proposal_id is distinct from parent.id or parent_pub.id is null then raise exception using errcode='40001',message='Only the current published offer can be revised'; end if;
  if exists(select 1 from public.scanner_sales_client_responses where proposal_id=parent.id and response_kind='accepted') then
    raise exception using errcode='55000',message='Accepted offers cannot be superseded';
  end if;
  select * into runrow from public.intelligence_runs where id=conv.run_id for update;
  select * into pkg from public.proposal_versions where run_id=conv.run_id order by version desc limit 1;
  select * into narrative from public.narrative_versions where run_id=conv.run_id and audience='client' order by version desc limit 1;
  binding:=public.bl_scanner_sales_current_binding(conv.run_id);
  if runrow.status<>'completed' or binding-'proposal' is distinct from parent_pub.source_binding-'proposal' then
    raise exception using errcode='40001',message='Scanner intelligence or narrative changed; refresh the scan before preparing a revision';
  end if;
  select * into reviewrow from public.runtime_events where run_id=conv.run_id and aggregate_type='intelligence_run'
    and aggregate_id=conv.run_id and event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested') order by sequence desc limit 1;
  if pkg.id is null or narrative.id is null or reviewrow.event_type<>'runtime.review.approved'
     or reviewrow.payload->'binding' is distinct from binding
     or pkg.envelope->'pricing'->>'pricingModelVersion'<>'2' then
    raise exception using errcode='40001',message='A fresh approval for a v2 commercial version is required';
  end if;
  key:='promo:'||conv.run_id||':'||pkg.id||':'||reviewrow.id;
  quote_id:='qte_'||replace(gen_random_uuid()::text,'-','');
  select * into promoted from public.bl_promote_scanner_package(conv.run_id,pkg.id,reviewrow.id,key,quote_id);
  quote_id:=promoted.quote_id;
  select * into q from public.quotes where id=quote_id for update;
  if q.client_id is distinct from conv.client_id then
    if q.client_id is not null or q.lead_id is null then raise exception using errcode='23514',message='Revision quote client differs from the conversion'; end if;
    perform * from public.bl_bind_proposal_quote_client(q.id,conv.client_id,q.updated_at);
    select * into q from public.quotes where id=q.id;
  end if;
  select revisions.id into revision_id
    from public.scanner_sales_quote_revisions as revisions
    where revisions.quote_id=q.id;
  if revision_id is null then
    insert into public.scanner_sales_quote_revisions(id,conversion_id,quote_id,predecessor_proposal_id,predecessor_quote_id,
      proposal_version_id,narrative_version_id,source_binding,created_by)
    values('sqr_'||replace(gen_random_uuid()::text,'-',''),conv.id,q.id,parent.id,parent.source_quote_id,pkg.id,narrative.id,binding,actor_id)
    returning id into revision_id;
  end if;
  return jsonb_build_object('quoteId',q.id,'predecessorProposalId',parent.id,'proposalVersionId',pkg.id,
    'outcome',promoted.outcome,'revisionId',revision_id);
end $$;
