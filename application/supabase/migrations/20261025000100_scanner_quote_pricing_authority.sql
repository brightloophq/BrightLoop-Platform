-- Phase 9B: scanner pricing v2 aligns immutable scanner versions with the
-- canonical quote/issuance model. Historical scanner versions are not rewritten.
begin;

alter table public.quote_items
  add column selected boolean not null default false,
  add column was_optional boolean not null default false,
  add column internal_note text not null default '';
alter table public.proposal_items
  add column selected boolean not null default false,
  add column was_optional boolean not null default false;
alter table public.quote_items
  add constraint quote_items_selected_was_optional check (not selected or was_optional);
alter table public.proposal_items
  add constraint proposal_items_selected_was_optional check (not selected or was_optional);
alter table public.quotes add column scanner_source_binding jsonb;
alter table public.quotes add constraint quotes_scanner_source_binding_shape
  check (scanner_source_binding is null or jsonb_typeof(scanner_source_binding)='object');
create schema if not exists private;
revoke all on schema private from public,anon,authenticated,service_role;
create table private.scanner_quote_mutation_authorizations (
  transaction_id bigint not null,
  quote_id text not null,
  action text not null check(action in ('review','publish')),
  primary key(transaction_id,quote_id,action)
);
revoke all on private.scanner_quote_mutation_authorizations from public,anon,authenticated,service_role;
comment on column public.quote_items.selected is 'Explicit selection state for scanner optional scope, copied from its immutable source version.';
comment on column public.quote_items.was_optional is 'Original scanner optional classification, retained after optional scope is selected.';
comment on column public.quote_items.internal_note is 'Private scanner pricing note. Never included in a client snapshot.';
comment on column public.quotes.scanner_source_binding is 'Full version binding for the approved immutable scanner package that seeded this quote.';

-- New approval events retain the feature's full nested binding and add the two
-- scalar fields expected by main's existing promotion RPC. Conflicts fail closed.
create function public.bl_add_scanner_review_compatibility_coordinates()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare b jsonb;
begin
  if new.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    and jsonb_typeof(new.payload)='object' and jsonb_typeof(new.payload->'binding')='object' then
    b:=new.payload->'binding';
    if jsonb_typeof(b->'proposal') is distinct from 'object'
       or nullif(b->'proposal'->>'id','') is null or nullif(b->'proposal'->>'checksum','') is null
       or (new.payload ? 'proposalVersionId' and new.payload->>'proposalVersionId' is distinct from b->'proposal'->>'id')
       or (new.payload ? 'proposalChecksum' and new.payload->>'proposalChecksum' is distinct from b->'proposal'->>'checksum') then
      raise exception 'Review compatibility coordinates conflict with the immutable full binding' using errcode='23514';
    end if;
    new.payload:=new.payload||jsonb_build_object('proposalVersionId',b->'proposal'->>'id','proposalChecksum',b->'proposal'->>'checksum');
  end if;
  return new;
end $$;
create trigger aaa_runtime_events_review_compatibility_coordinates before insert on public.runtime_events
  for each row execute function public.bl_add_scanner_review_compatibility_coordinates();
revoke all on function public.bl_add_scanner_review_compatibility_coordinates() from public,anon,authenticated,service_role;

-- Seed a scanner-origin quote exclusively from an approved, current v2 version.
-- v1 rows remain immutable and readable, but cannot be promoted: an admin must
-- save a new pricing version and obtain fresh approval.
create function public.bl_seed_scanner_quote_from_version()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  r public.intelligence_runs%rowtype; v public.proposal_versions%rowtype; e public.runtime_events%rowtype;
  n public.narrative_versions%rowtype; a public.intelligence_artifacts%rowtype;
  b jsonb; p jsonb; one_time bigint; monthly bigint; opt_once bigint; opt_monthly bigint;
  discount bigint; committed_total bigint; counted integer; cadence text;
begin
  if new.commercial_mode<>'proposal_only' or new.source_run_id is null then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||new.source_run_id,0));
  select * into r from public.intelligence_runs where id=new.source_run_id for update;
  select * into v from public.proposal_versions where id=new.source_proposal_version_id and run_id=new.source_run_id;
  select * into n from public.narrative_versions where run_id=new.source_run_id and audience='client' order by version desc limit 1;
  select * into a from public.intelligence_artifacts where run_id=new.source_run_id and kind='internal_intelligence_report' order by version desc limit 1;
  if r.id is null or r.status<>'completed' or v.id is null or v.status<>'needs_review'
     or v.envelope->>'status'<>'draft_ready' or v.envelope->>'commercialState'<>'priced'
     or n.id is null or n.envelope->>'status'<>'ready' or jsonb_typeof(n.envelope->'sections') is distinct from 'array'
     or jsonb_array_length(n.envelope->'sections')=0 or a.id is null or a.validation_status<>'valid' then
    raise exception 'Promotion requires a completed scan and current valid priced proposal, narrative, and report' using errcode='40001';
  end if;
  p:=v.envelope->'pricing';
  if jsonb_typeof(p) is distinct from 'object' or p->>'pricingModelVersion'<>'2'
     or jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items')=0
     or coalesce(p->>'currency','') !~ '^[A-Z]{3}$'
     or coalesce(p->>'validUntil','') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Legacy or incomplete pricing cannot be promoted; create and approve a new pricing version' using errcode='40001';
  end if;
  b:=public.bl_scanner_sales_current_binding(new.source_run_id);
  select * into e from public.runtime_events where aggregate_type='intelligence_run' and aggregate_id=new.source_run_id
    and run_id=new.source_run_id and event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    order by sequence desc limit 1;
  if e.id is null or e.event_type<>'runtime.review.approved' or e.payload->'binding' is distinct from b
     or b->'proposal'->>'id' is distinct from v.id or b->'proposal'->>'checksum' is distinct from v.checksum
     or new.source_review_event_id is distinct from e.id then
    raise exception 'Promotion requires exact current version-bound scanner approval' using errcode='40001';
  end if;
  if (select count(*) from jsonb_array_elements(v.envelope->'recommendedWork')) < 1
     or jsonb_array_length(p->'items')<>(select count(*) from jsonb_array_elements(v.envelope->'recommendedWork'))
     or jsonb_array_length(p->'items')<>(select count(distinct x.value->>'sourceId') from jsonb_array_elements(p->'items') x(value))
     or exists(select 1 from jsonb_array_elements(v.envelope->'recommendedWork') w(value)
       left join jsonb_array_elements(p->'items') x(value) on x.value->>'sourceId'=w.value->>'sourceId' where x.value is null)
     or exists(select 1 from jsonb_array_elements(p->'items') x(value) where
       coalesce(x.value->>'pricingType','') not in ('one_time','recurring')
       or coalesce(x.value->>'amountMinor','') !~ '^[0-9]+$'
       or coalesce(x.value->>'quantity','1') !~ '^[0-9]+$'
       or coalesce((x.value->>'quantity')::integer,0) not between 1 and 9999
       or (coalesce((x.value->>'selected')::boolean,false) and not coalesce((x.value->>'optional')::boolean,false))
       or (x.value->>'pricingType'='recurring' and x.value->>'cadence'<>'monthly')
       or (x.value->>'pricingType'='one_time' and x.value->'cadence' not in ('null'::jsonb,'""'::jsonb))) then
    raise exception 'Approved pricing lines do not exactly cover the scanner scope' using errcode='23514';
  end if;
  select coalesce(sum((x.value->>'amountMinor')::bigint*(x.value->>'quantity')::bigint)
      filter(where x.value->>'pricingType'='one_time' and (not coalesce((x.value->>'optional')::boolean,false) or coalesce((x.value->>'selected')::boolean,false))),0),
    coalesce(sum((x.value->>'amountMinor')::bigint*(x.value->>'quantity')::bigint)
      filter(where x.value->>'pricingType'='recurring' and x.value->>'cadence'='monthly'
        and (not coalesce((x.value->>'optional')::boolean,false) or coalesce((x.value->>'selected')::boolean,false))),0),
    coalesce(sum((x.value->>'amountMinor')::bigint*(x.value->>'quantity')::bigint)
      filter(where x.value->>'pricingType'='one_time' and coalesce((x.value->>'optional')::boolean,false) and not coalesce((x.value->>'selected')::boolean,false)),0),
    coalesce(sum((x.value->>'amountMinor')::bigint*(x.value->>'quantity')::bigint)
      filter(where x.value->>'pricingType'='recurring' and coalesce((x.value->>'optional')::boolean,false) and not coalesce((x.value->>'selected')::boolean,false)),0),
    count(distinct x.value->>'cadence') filter(where x.value->>'pricingType'='recurring'),
    max(x.value->>'cadence') filter(where x.value->>'pricingType'='recurring')
    into one_time,monthly,opt_once,opt_monthly,counted,cadence from jsonb_array_elements(p->'items') x(value);
  discount:=least(one_time,(p->>'discountMinor')::bigint); committed_total:=one_time-discount;
  if counted>1 or p->>'discountMinor' is null or p->>'subtotalOneTimeMinor' is null
     or p->>'totalOneTimeMinor' is null or p->>'totalRecurringMonthlyMinor' is null
     or (p->>'discountMinor')::bigint<0
     or (p->>'subtotalOneTimeMinor')::bigint<>one_time
     or (p->>'discountMinor')::bigint<>discount
     or (p->>'totalOneTimeMinor')::bigint<>committed_total
     or (p->>'totalRecurringMonthlyMinor')::bigint<>monthly then
    raise exception 'Approved v2 totals do not match required and selected optional line items' using errcode='23514';
  end if;
  new.scanner_source_binding:=b;
  new.currency:=p->>'currency'; new.discount:=discount; new.valid_until:=(p->>'validUntil')::date;
  new.subtotal:=one_time; new.total:=committed_total; new.recurring_total:=monthly;
  new.recurring_cadence:=cadence; new.optional_one_time_total:=opt_once; new.optional_recurring_total:=opt_monthly;
  new.client_note:=coalesce(p->>'commercialNotes','');
  return new;
end $$;
create trigger quotes_scanner_version_seed before insert on public.quotes
  for each row execute function public.bl_seed_scanner_quote_from_version();

-- Replace the original unpriced placeholders with the exact approved line terms.
-- This trigger validates scope text and provenance before copying price/status.
create function public.bl_seed_scanner_quote_item_from_version()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare q public.quotes%rowtype; v public.proposal_versions%rowtype; w jsonb; p jsonb; was_optional boolean; is_selected boolean;
begin
  select * into q from public.quotes where id=new.quote_id;
  if q.commercial_mode<>'proposal_only' or q.source_run_id is null then return new; end if;
  select * into v from public.proposal_versions where id=q.source_proposal_version_id and run_id=q.source_run_id;
  select x.value into w from jsonb_array_elements(v.envelope->'recommendedWork') x(value) where x.value->>'sourceId'=new.source_work_item_id;
  select x.value into p from jsonb_array_elements(v.envelope->'pricing'->'items') x(value) where x.value->>'sourceId'=new.source_work_item_id;
  if w is null or p is null or new.label is distinct from w->>'title'
     or new.description is distinct from coalesce(w->>'solution','')
     or new.source_evidence_refs is distinct from coalesce(w->'evidenceIds','[]'::jsonb) then
    raise exception 'Promoted quote item differs from approved scope or provenance' using errcode='23514';
  end if;
  if exists(select 1 from public.quote_items where quote_id=new.quote_id and source_work_item_id=new.source_work_item_id) then
    raise exception 'Promoted scanner work item already exists on quote' using errcode='23505';
  end if;
  was_optional:=coalesce((p->>'optional')::boolean,false); is_selected:=was_optional and coalesce((p->>'selected')::boolean,false);
  new.quantity:=(p->>'quantity')::integer; new.unit_amount:=(p->>'amountMinor')::bigint;
  new.amount:=new.quantity*new.unit_amount; new.pricing_type:=p->>'pricingType';
  new.recurrence_cadence:=nullif(p->'cadence'#>>'{}',''); new.was_optional:=was_optional;
  new.selected:=is_selected; new.optional:=was_optional and not is_selected;
  new.internal_note:=coalesce(p->>'adminNotes','');
  return new;
end $$;
create trigger zzz_quote_items_scanner_version_seed before insert on public.quote_items
  for each row execute function public.bl_seed_scanner_quote_item_from_version();

create function public.bl_guard_scanner_quote_terms()
returns trigger language plpgsql security definer set search_path=pg_catalog,private,public as $$
begin
  if old.commercial_mode='proposal_only' and old.source_run_id is not null then
    if row(new.commercial_approved_at,new.commercial_approved_by,new.commercial_approved_state)
       is distinct from row(old.commercial_approved_at,old.commercial_approved_by,old.commercial_approved_state)
       and not exists(select 1 from private.scanner_quote_mutation_authorizations a
         where a.transaction_id=txid_current() and a.quote_id=old.id and a.action='review') then
      raise exception 'Scanner quote approval must use the authorized review operation' using errcode='42501';
    end if;
    if new.status='approved' and new.status is distinct from old.status
       and not exists(select 1 from private.scanner_quote_mutation_authorizations a
         where a.transaction_id=txid_current() and a.quote_id=old.id and a.action='review') then
      raise exception 'Scanner quote approval must use the authorized review operation' using errcode='42501';
    end if;
    if new.status='issued' and new.status is distinct from old.status
       and not exists(select 1 from private.scanner_quote_mutation_authorizations a
         where a.transaction_id=txid_current() and a.quote_id=old.id and a.action='publish') then
      raise exception 'Scanner quote issuance must use explicit authorized publication' using errcode='42501';
    end if;
  end if;
  if old.commercial_mode='proposal_only' and old.source_run_id is not null and (
    new.title is distinct from old.title or new.client_note is distinct from old.client_note
    or new.currency is distinct from old.currency or new.discount is distinct from old.discount
    or new.valid_until is distinct from old.valid_until or new.subtotal is distinct from old.subtotal
    or new.total is distinct from old.total or new.recurring_total is distinct from old.recurring_total
    or new.recurring_cadence is distinct from old.recurring_cadence
    or new.optional_one_time_total is distinct from old.optional_one_time_total
    or new.optional_recurring_total is distinct from old.optional_recurring_total
    or new.scanner_source_binding is distinct from old.scanner_source_binding) then
    raise exception 'Scanner quote terms are immutable; create and approve a new scanner commercial version' using errcode='55000';
  end if;
  return new;
end $$;
create trigger quotes_scanner_terms_immutable before update on public.quotes
  for each row execute function public.bl_guard_scanner_quote_terms();

-- Scanner quote approval goes through the same owner/admin state machine as
-- ordinary proposal_only quotes, with an internal transaction-local guard so
-- direct table updates (including service-role writes) cannot forge the gate.
create or replace function public.bl_review_proposal_quote(p_quote_id text,p_expected_updated_at timestamptz,p_action text)
returns table(quote_id text,status public.quote_status,updated_at timestamptz)
language plpgsql security definer set search_path=public,private,pg_temp as $$
declare q public.quotes%rowtype; uid text; target public.quote_status; stamp timestamptz:=clock_timestamp();
  current_binding jsonb; latest_review public.runtime_events%rowtype;
begin
  if auth.role()<>'authenticated' or public.bl_role() not in ('owner','admin') then raise exception 'Quote approval requires an authenticated owner/admin' using errcode='42501'; end if;
  select u.id into uid from public.users as u
    where u.auth_user_id=auth.uid() and u.role::text=public.bl_role() and u.status='active';
  if uid is null then raise exception 'Active internal user required' using errcode='42501'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if not found then raise exception 'Quote not found' using errcode='P0002'; end if;
  if q.commercial_mode<>'proposal_only' then raise exception 'Only proposal-only quotes use canonical approval' using errcode='23514'; end if;
  if q.updated_at is distinct from p_expected_updated_at then raise exception 'Quote was updated by another editor' using errcode='40001'; end if;
  if p_action='approve' and q.status='internal_review' then target:='approved';
  elsif p_action='revoke' and q.status='approved' then target:='internal_review';
  else raise exception 'Illegal canonical quote review action' using errcode='23514'; end if;
  if target='approved' and q.source_run_id is not null then
    current_binding:=public.bl_scanner_sales_current_binding(q.source_run_id);
    select * into latest_review from public.runtime_events where run_id=q.source_run_id and aggregate_type='intelligence_run'
      and aggregate_id=q.source_run_id and event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
      order by sequence desc limit 1;
    if q.scanner_source_binding is distinct from current_binding or latest_review.id is null or latest_review.event_type<>'runtime.review.approved'
       or latest_review.payload->'binding' is distinct from current_binding then
      raise exception 'Scanner approval is stale; create and approve a current commercial version' using errcode='40001';
    end if;
  end if;
  if target='approved' and (not exists(select 1 from public.quote_items qi where qi.quote_id=q.id)
    or exists(select 1 from public.quote_items qi where qi.quote_id=q.id and not qi.optional and qi.unit_amount is null)) then
    raise exception 'Required commercial scope must be fully priced before approval' using errcode='23514';
  end if;
  if q.source_run_id is not null then
    insert into private.scanner_quote_mutation_authorizations(transaction_id,quote_id,action)
      values(txid_current(),q.id,'review');
  end if;
  insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
  values('quote','quotes',q.id,q.status::text,target::text,uid,'commercial '||p_action,stamp);
  update public.quotes set status=target,
    commercial_approved_at=case when target='approved' then stamp else null end,
    commercial_approved_by=case when target='approved' then uid else null end,
    commercial_approved_state=case when target='approved' then stamp else null end,
    updated_at=stamp where id=q.id;
  if q.source_run_id is not null then
    delete from private.scanner_quote_mutation_authorizations as authz where authz.transaction_id=txid_current() and authz.quote_id=q.id and authz.action='review';
  end if;
  return query select q.id,target,stamp;
end $$;
create function public.bl_guard_scanner_quote_item_terms()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
declare qid text:=coalesce(new.quote_id,old.quote_id);
begin
  if exists(select 1 from public.quotes where id=qid and commercial_mode='proposal_only' and source_run_id is not null) then
    raise exception 'Scanner quote items are immutable; create a new scanner commercial version' using errcode='55000';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
create trigger quote_items_scanner_terms_immutable before update or delete on public.quote_items
  for each row execute function public.bl_guard_scanner_quote_item_terms();

create function public.bl_reject_scanner_quote_delete()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if old.commercial_mode='proposal_only' and old.source_run_id is not null then
    raise exception 'Scanner quote history is immutable' using errcode='55000';
  end if;
  return old;
end $$;
create trigger quotes_scanner_history_no_delete before delete on public.quotes
  for each row execute function public.bl_reject_scanner_quote_delete();

-- Canonical issuance preserves the optional classification and explicit choice
-- on proposal_items. The issuer's existing total calculation remains correct:
-- selected options are represented as committed (optional=false), unselected
-- options remain in the separate optional totals.
create function public.bl_copy_quote_optional_choice_to_proposal_item()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare qid text;
begin
  select source_quote_id into qid from public.proposals where id=new.proposal_id and proposal_kind='canonical_issued';
  if qid is not null then
    select selected,was_optional into new.selected,new.was_optional from public.quote_items
      where quote_id=qid and label=new.label and description=new.description and quantity=new.quantity
        and unit_amount=new.unit_amount and amount=new.amount and sort=new.sort limit 1;
    -- Source work-item identifiers and evidence references are internal scanner
    -- provenance. Keep them on the private quote, never on client-readable rows.
    new.source_work_item_id:=null;
    new.source_evidence_refs:='[]'::jsonb;
  end if;
  return new;
end $$;
create trigger zzz_proposal_item_optional_choice before insert on public.proposal_items
  for each row execute function public.bl_copy_quote_optional_choice_to_proposal_item();
create function public.bl_copy_quote_choice_to_proposal_snapshot()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare qid text;
begin
  if new.proposal_kind='canonical_issued' then
    qid:=new.source_quote_id;
    select coalesce(jsonb_agg(jsonb_build_object('label',label,'description',description,'quantity',quantity,
      'unit_amount',unit_amount,'amount',amount,'sort',sort,'pricing_type',pricing_type,
      'recurrence_cadence',recurrence_cadence,'optional',optional,'selected',selected,'was_optional',was_optional)
      order by sort),'[]'::jsonb) into new.line_items from public.quote_items where quote_id=qid;
  end if;
  return new;
end $$;
create trigger zzz_proposal_snapshot_optional_choice before insert on public.proposals
  for each row execute function public.bl_copy_quote_choice_to_proposal_snapshot();

-- An issued scanner quote is valid only when the same transaction also records
-- the authorized publication/conversion mapping. This prevents direct calls to
-- the legacy issuer from exposing scanner quotes.
create function public.bl_require_scanner_quote_publication()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
  if new.status='issued' and old.status is distinct from new.status and new.source_run_id is not null
     and not exists(select 1 from public.scanner_sales_conversions c join public.scanner_sales_publications d
       on d.conversion_id=c.id and d.proposal_id=new.proposal_id
       where c.run_id=new.source_run_id and c.proposal_id=new.proposal_id) then
    raise exception 'Scanner quote issuance requires explicit atomic portal publication' using errcode='42501';
  end if;
  return null;
end $$;
create constraint trigger quotes_scanner_publication_required after update of status on public.quotes
  deferrable initially deferred for each row execute function public.bl_require_scanner_quote_publication();

-- Direct proposal creation is retired. The stable function name remains as a
-- denied compatibility surface; scanner proposals are only promoted to quotes.
create or replace function public.bl_convert_scanner_package(p_run_id text,p_idempotency_key text)
returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'Direct scanner proposal conversion is retired; use bl_promote_scanner_package' using errcode='0A000';
end $$;
revoke all on function public.bl_convert_scanner_package(text,text) from public,anon,authenticated,service_role;

revoke all on function public.bl_seed_scanner_quote_from_version() from public,anon,authenticated,service_role;
revoke all on function public.bl_seed_scanner_quote_item_from_version() from public,anon,authenticated,service_role;
revoke all on function public.bl_guard_scanner_quote_terms() from public,anon,authenticated,service_role;
revoke all on function public.bl_guard_scanner_quote_item_terms() from public,anon,authenticated,service_role;
revoke all on function public.bl_reject_scanner_quote_delete() from public,anon,authenticated,service_role;
revoke all on function public.bl_copy_quote_optional_choice_to_proposal_item() from public,anon,authenticated,service_role;
revoke all on function public.bl_copy_quote_choice_to_proposal_snapshot() from public,anon,authenticated,service_role;
revoke all on function public.bl_require_scanner_quote_publication() from public,anon,authenticated,service_role;

-- Append-only lineage for private scanner quote revisions. Canonical proposal
-- rows are created later, atomically with publication.
create table public.scanner_sales_quote_revisions (
  id text primary key,
  conversion_id text not null references public.scanner_sales_conversions(id) on delete restrict,
  quote_id text not null unique references public.quotes(id) on delete restrict,
  predecessor_proposal_id text not null references public.proposals(id) on delete restrict,
  -- The initial feature branch produced direct canonical proposals before main's
  -- quote-backed authority was merged. Keep that historical provenance link
  -- nullable so a forward-only migration can revise those records safely.
  predecessor_quote_id text references public.quotes(id) on delete restrict,
  proposal_version_id text not null references public.proposal_versions(id) on delete restrict,
  narrative_version_id text not null references public.narrative_versions(id) on delete restrict,
  source_binding jsonb not null check(jsonb_typeof(source_binding)='object'),
  created_by text not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.scanner_sales_quote_revisions enable row level security;
create policy scanner_sales_quote_revisions_internal_read on public.scanner_sales_quote_revisions
  for select to authenticated using(public.bl_role() in ('owner','admin','team_member'));
revoke all on public.scanner_sales_quote_revisions from public,anon,authenticated,service_role;
grant select on public.scanner_sales_quote_revisions to authenticated;
create function public.bl_scanner_quote_revision_immutable()
returns trigger language plpgsql set search_path=pg_catalog as $$ begin raise exception 'Scanner quote revision lineage is append-only' using errcode='55000'; end $$;
create trigger scanner_sales_quote_revisions_no_mutation before update or delete on public.scanner_sales_quote_revisions
  for each row execute function public.bl_scanner_quote_revision_immutable();
create trigger scanner_sales_quote_revisions_no_truncate before truncate on public.scanner_sales_quote_revisions
  for each statement execute function public.bl_scanner_quote_revision_immutable();
revoke all on function public.bl_scanner_quote_revision_immutable() from public,anon,authenticated,service_role;

create function public.bl_scanner_quote_publication_preview(p_quote_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quotes%rowtype; c public.clients%rowtype; r public.intelligence_runs%rowtype;
  v public.proposal_versions%rowtype; n public.narrative_versions%rowtype; reportrow public.intelligence_artifacts%rowtype;
  competitorrow public.intelligence_artifacts%rowtype; recipients jsonb; reason text; actor_id text;
  decision public.runtime_events%rowtype; binding jsonb; failure boolean;
begin
  if auth.role()<>'authenticated' or auth.jwt()->'app_metadata'->>'role' not in ('owner','admin') then raise exception using errcode='42501'; end if;
  select id into actor_id from public.users where auth_user_id=auth.uid() and role::text=auth.jwt()->'app_metadata'->>'role' and status='active';
  if actor_id is null then raise exception using errcode='42501',message='Active owner/admin identity required'; end if;
  select * into q from public.quotes where id=p_quote_id;
  if q.id is null or q.commercial_mode<>'proposal_only' or q.source_run_id is null then raise exception using errcode='P0002'; end if;
  select * into c from public.clients where id=q.client_id;
  select * into r from public.intelligence_runs where id=q.source_run_id;
  select * into v from public.proposal_versions where id=q.source_proposal_version_id and run_id=q.source_run_id;
  select * into n from public.narrative_versions where run_id=q.source_run_id and audience='client' order by version desc limit 1;
  select * into reportrow from public.intelligence_artifacts where run_id=q.source_run_id and kind='internal_intelligence_report' order by version desc limit 1;
  select * into competitorrow from public.intelligence_artifacts where run_id=q.source_run_id and kind='competitor_snapshot' order by version desc limit 1;
  binding:=public.bl_scanner_sales_current_binding(q.source_run_id);
  select * into decision from public.runtime_events where run_id=q.source_run_id and aggregate_type='intelligence_run'
    and aggregate_id=q.source_run_id and event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    order by sequence desc limit 1;
  select exists(select 1 from (select distinct on(stage) event_type from public.runtime_events where run_id=q.source_run_id
    and stage in ('competitor_intelligence','proposal_generation','narrative_generation')
    and event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed',
      'runtime.commercial.stage_completed','runtime.commercial.enqueued') order by stage,sequence desc) latest
    where latest.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed')) into failure;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'email',u.email) order by u.email),'[]'::jsonb)
    into recipients from public.users u join auth.users au on au.id=u.auth_user_id
    where u.client_id=q.client_id and u.role in ('client_admin','client_member') and u.status='active'
      and au.email_confirmed_at is not null;
  if q.status<>'approved' or q.commercial_approved_state is distinct from q.updated_at then reason:='A separately approved commercial quote is required.';
  elsif r.status<>'completed' or not (r.client_id is not distinct from q.client_id or
      (r.client_id is null and r.lead_id is not null and r.lead_id is not distinct from q.lead_id and q.client_id is not null)) then reason:='The scanner run is incomplete or does not match the quote owner.';
  elsif v.id is null or v.envelope->>'status'<>'draft_ready' or v.envelope->>'commercialState'<>'priced'
      or n.id is null or n.envelope->>'status'<>'ready' or reportrow.id is null or reportrow.validation_status<>'valid'
      or competitorrow.validation_status='invalid' then reason:='Required scanner artifacts are missing, stale, or invalid.';
  elsif competitorrow.id is null and not exists(select 1 from public.runtime_events where run_id=q.source_run_id and stage='competitor_intelligence' and event_type='runtime.commercial.stage_completed') then reason:='Competitor intelligence is incomplete.';
  elsif failure then reason:='An unresolved scanner stage failure blocks publication.';
  elsif c.lifecycle not in ('member','client_active','post_launch','renewed') then reason:='Client onboarding is incomplete.';
  elsif jsonb_array_length(recipients)=0 then reason:='No active authenticated portal recipient is linked to this client.';
  elsif q.currency<>'USD' then reason:='Only USD proposals can be published.';
  elsif q.valid_until is null or q.valid_until<current_date then reason:='Commercial terms are missing an expiry or have expired.';
  elsif q.scanner_source_binding is distinct from binding then reason:='Scanner sources changed after approval.';
  elsif v.envelope->'pricing'->>'pricingModelVersion'<>'2' then reason:='This historical pricing version uses incompatible optional-item totals; create and approve a new commercial version.';
  elsif q.source_proposal_version_id is distinct from q.scanner_source_binding->'proposal'->>'id'
     or q.scanner_source_binding->'proposal'->>'checksum' is null then reason:='The quote no longer matches the approved version.';
  elsif decision.id is null or decision.event_type<>'runtime.review.approved' or decision.payload->'binding' is distinct from q.scanner_source_binding then reason:='Fresh source-bound scanner approval is required.';
  end if;
  return jsonb_build_object('quoteId',q.id,'clientId',q.client_id,'status',q.status,'currency',q.currency,
    'subtotalMinor',q.subtotal,'discountMinor',q.discount,'totalMinor',q.total,'recurringMinor',q.recurring_total,
    'optionalOneTimeMinor',q.optional_one_time_total,'optionalRecurringMinor',q.optional_recurring_total,
    'validUntil',q.valid_until,'recipients',recipients,'eligible',reason is null,'reason',reason);
end $$;

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
  select id into revision_id from public.scanner_sales_quote_revisions where quote_id=q.id;
  if revision_id is null then
    insert into public.scanner_sales_quote_revisions(id,conversion_id,quote_id,predecessor_proposal_id,predecessor_quote_id,
      proposal_version_id,narrative_version_id,source_binding,created_by)
    values('sqr_'||replace(gen_random_uuid()::text,'-',''),conv.id,q.id,parent.id,parent.source_quote_id,pkg.id,narrative.id,binding,actor_id)
    returning id into revision_id;
  end if;
  return jsonb_build_object('quoteId',q.id,'predecessorProposalId',parent.id,'proposalVersionId',pkg.id,
    'outcome',promoted.outcome,'revisionId',revision_id);
end $$;

-- Keep the legacy issuance implementation private so only the guarded wrapper
-- for ordinary quotes and the atomic scanner publication RPC can invoke it.
alter function public.bl_issue_canonical_proposal(text,timestamptz) rename to bl_issue_canonical_proposal_legacy;
revoke all on function public.bl_issue_canonical_proposal_legacy(text,timestamptz) from public,anon,authenticated,service_role;
create function public.bl_issue_canonical_proposal(p_quote_id text,p_expected_updated_at timestamptz)
returns table(proposal_id text,proposal_number text,outcome text,item_count integer)
language plpgsql security definer set search_path=public,pg_temp as $$
declare q public.quotes%rowtype; actor_id text;
begin
  if auth.role()<>'authenticated' or auth.uid() is null or public.bl_role() not in ('owner','admin') then
    raise exception 'Proposal issuance requires an authenticated owner/admin' using errcode='42501';
  end if;
  select id into actor_id from public.users where auth_user_id=auth.uid()
    and role::text=public.bl_role() and status='active';
  if actor_id is null then raise exception 'Active internal user required' using errcode='42501'; end if;
  select * into q from public.quotes where id=p_quote_id;
  if q.source_run_id is not null then raise exception 'Scanner quotes issue only through explicit publication' using errcode='42501'; end if;
  return query select * from public.bl_issue_canonical_proposal_legacy(p_quote_id,p_expected_updated_at);
end $$;
revoke all on function public.bl_issue_canonical_proposal(text,timestamptz) from public,anon,service_role;
grant execute on function public.bl_issue_canonical_proposal(text,timestamptz) to authenticated;

create function public.bl_publish_scanner_quote(
  p_quote_id text,p_expected_updated_at timestamptz,p_expected_client_id text,p_recipient_user_id text,
  p_expected_currency text,p_expected_total_minor bigint,p_expected_valid_until date
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  au uuid:=auth.uid(); role_name text:=auth.jwt()->'app_metadata'->>'role'; actor_id text;
  q public.quotes%rowtype; runrow public.intelligence_runs%rowtype; pkg public.proposal_versions%rowtype;
  narr public.narrative_versions%rowtype; reportrow public.intelligence_artifacts%rowtype;
  competitorrow public.intelligence_artifacts%rowtype; coreproposal public.intelligence_artifacts%rowtype;
  reviewrow public.runtime_events%rowtype;
  recipient public.users%rowtype; clientrow public.clients%rowtype; conv public.scanner_sales_conversions%rowtype;
  quote_revision public.scanner_sales_quote_revisions%rowtype; parent public.proposals%rowtype; head public.scanner_sales_offer_heads%rowtype;
  pub public.scanner_sales_publications%rowtype; parent_pub public.scanner_sales_publications%rowtype;
  issued record; proposalrow public.proposals%rowtype; binding jsonb; snapshot jsonb; v_publication_id text; v_conversion_id text;
  is_replay boolean:=false; now_at timestamptz:=clock_timestamp(); latest_failure boolean;
begin
  if auth.role()<>'authenticated' or au is null or role_name not in ('owner','admin') then raise exception using errcode='42501',message='Owner/admin authorization required'; end if;
  select id into actor_id from public.users where auth_user_id=au and role::text=role_name and status='active';
  if actor_id is null then raise exception using errcode='42501',message='Active owner/admin identity required'; end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.commercial_mode<>'proposal_only' or q.source_run_id is null then raise exception using errcode='P0002',message='Scanner quote not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||q.source_run_id,0));
  select * into q from public.quotes where id=p_quote_id for update;
  select * into runrow from public.intelligence_runs where id=q.source_run_id for update;
  select * into pkg from public.proposal_versions where id=q.source_proposal_version_id and run_id=q.source_run_id;
  select * into narr from public.narrative_versions where run_id=q.source_run_id and audience='client' order by version desc limit 1;
  select * into reportrow from public.intelligence_artifacts where run_id=q.source_run_id and kind='internal_intelligence_report' order by version desc limit 1;
  select * into competitorrow from public.intelligence_artifacts where run_id=q.source_run_id and kind='competitor_snapshot' order by version desc limit 1;
  select * into coreproposal from public.intelligence_artifacts where run_id=q.source_run_id and kind='proposal' order by version desc limit 1;
  binding:=public.bl_scanner_sales_current_binding(q.source_run_id);
  select * into reviewrow from public.runtime_events where run_id=q.source_run_id and aggregate_type='intelligence_run'
    and aggregate_id=q.source_run_id and event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested') order by sequence desc limit 1;
  select * into clientrow from public.clients where id=q.client_id for share;
  select * into recipient from public.users u join auth.users au2 on au2.id=u.auth_user_id
    where u.id=p_recipient_user_id and u.client_id=q.client_id and u.role in ('client_admin','client_member')
      and u.status='active' and au2.email_confirmed_at is not null;
  if not found then raise exception using errcode='40001',message='Recipient must be active, authenticated, and belong to the quote client'; end if;
  if p_expected_client_id is distinct from q.client_id or p_expected_currency is distinct from q.currency
     or p_expected_total_minor is distinct from q.total or p_expected_valid_until is distinct from q.valid_until then
    raise exception using errcode='40001',message='Confirmed quote details are stale';
  end if;
  -- A transport retry after commit must return the same publication. The quote
  -- timestamp changes during issuance, so the original approval timestamp is
  -- the durable pre-publication precondition for an idempotent replay.
  if q.status='issued' and q.proposal_id is not null then
    select * into pub from public.scanner_sales_publications where proposal_id=q.proposal_id;
    select * into head from public.scanner_sales_offer_heads where proposal_id=q.proposal_id;
    if pub.id is not null and head.proposal_id=q.proposal_id and pub.recipient_user_id=recipient.id
       and pub.client_id=q.client_id and p_expected_updated_at=q.commercial_approved_state
       and pub.source_binding is not distinct from q.scanner_source_binding then
      return jsonb_build_object('published',true,'replayed',true,'quoteId',q.id,'proposalId',q.proposal_id,
        'clientId',q.client_id,'recipientUserId',recipient.id,'publishedAt',pub.published_at);
    end if;
    raise exception using errcode='40001',message='Quote was already published or superseded; reload its current state';
  end if;
  if q.updated_at is distinct from p_expected_updated_at then raise exception using errcode='40001',message='Confirmed quote details are stale'; end if;
  if q.status<>'approved' or q.commercial_approved_state is distinct from q.updated_at then raise exception using errcode='40001',message='Separate current commercial quote approval is required'; end if;
  if q.client_id is null or clientrow.lifecycle not in ('member','client_active','post_launch','renewed') then raise exception using errcode='40001',message='An onboarded client account is required'; end if;
  if runrow.status<>'completed' or not (
       runrow.client_id is not distinct from q.client_id
       or (runrow.client_id is null and runrow.lead_id is not null and runrow.lead_id is not distinct from q.lead_id and q.client_id is not null)
     ) or pkg.id is null or pkg.id is distinct from q.source_proposal_version_id
     or pkg.envelope->'pricing'->>'pricingModelVersion'<>'2'
     or narr.id is null or narr.envelope->>'status'<>'ready' or reportrow.id is null or reportrow.validation_status<>'valid'
     or competitorrow.validation_status='invalid' or coreproposal.validation_status='invalid'
     or q.scanner_source_binding is distinct from binding or reviewrow.event_type<>'runtime.review.approved'
     or reviewrow.payload->'binding' is distinct from binding then raise exception using errcode='40001',message='Current scanner sources and full version-bound approval are required'; end if;
  if q.currency<>'USD' or q.valid_until is null or q.valid_until<current_date then raise exception using errcode='40001',message='Only valid, unexpired USD terms can be published'; end if;
  select exists(select 1 from (select distinct on(stage) event_type from public.runtime_events where run_id=q.source_run_id
    and stage in ('competitor_intelligence','proposal_generation','narrative_generation') order by stage,sequence desc) x
    where x.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed')) into latest_failure;
  if latest_failure then raise exception using errcode='40001',message='An unresolved scanner stage failure blocks publication'; end if;
  if competitorrow.id is null
     and not exists(select 1 from public.runtime_events where run_id=q.source_run_id and stage='competitor_intelligence' and event_type='runtime.commercial.stage_completed') then
    raise exception using errcode='40001',message='Competitor intelligence is incomplete';
  end if;
  select * into quote_revision from public.scanner_sales_quote_revisions where quote_id=q.id;
  select * into conv from public.scanner_sales_conversions where run_id=q.source_run_id for update;
  if quote_revision.id is null and conv.id is not null then raise exception using errcode='40001',message='A successor quote requires immutable revision lineage'; end if;
  if quote_revision.id is not null then
    select * into head from public.scanner_sales_offer_heads where conversion_id=conv.id for update;
    if head.proposal_id is distinct from quote_revision.predecessor_proposal_id then raise exception using errcode='40001',message='Revision is not the successor of the current offer'; end if;
    select * into parent from public.proposals where id=head.proposal_id for update;
    if exists(select 1 from public.scanner_sales_client_responses where proposal_id=parent.id and response_kind='accepted') then
      raise exception using errcode='55000',message='Accepted offers cannot be superseded'; end if;
  elsif conv.id is not null then
    raise exception using errcode='40001',message='A scanner run already has its original conversion';
  end if;

  insert into private.scanner_quote_mutation_authorizations(transaction_id,quote_id,action)
    values(txid_current(),q.id,'publish');
  select * into issued from public.bl_issue_canonical_proposal_legacy(q.id,p_expected_updated_at);
  delete from private.scanner_quote_mutation_authorizations where transaction_id=txid_current() and quote_id=q.id and action='publish';
  select * into proposalrow from public.proposals where id=issued.proposal_id;
  snapshot:=jsonb_build_object('schemaVersion',2,
    'proposal',jsonb_build_object('executiveSummary',pkg.envelope->'executiveSummary','observedSituation',pkg.envelope->'observedSituation',
      'keyIssues',coalesce(pkg.envelope->'keyIssues','[]'::jsonb),'opportunities',coalesce(pkg.envelope->'opportunities','[]'::jsonb),
      'scope',proposalrow.line_items,'proposedNextStep',pkg.envelope->'proposedNextStep','clientNote',proposalrow.client_note),
    'narrative',narr.envelope->'sections',
    'pricing',jsonb_build_object('pricingModelVersion',2,'currency',q.currency,'discountMinor',q.discount,
      'subtotalOneTimeMinor',q.subtotal,'totalOneTimeMinor',q.total,'totalRecurringMonthlyMinor',q.recurring_total,
      'optionalOneTimeMinor',q.optional_one_time_total,'optionalRecurringMinor',q.optional_recurring_total,'validUntil',q.valid_until));

  if quote_revision.id is null then
    v_conversion_id:='scv_'||replace(gen_random_uuid()::text,'-','');
    insert into public.scanner_sales_conversions(id,run_id,client_id,proposal_id,idempotency_key,source_binding,
      client_safe_snapshot,prospect_identity,converted_by,converted_at)
    values(v_conversion_id,q.source_run_id,q.client_id,proposalrow.id,'scanner-quote:'||q.source_run_id,binding,snapshot,'{}'::jsonb,actor_id,now_at)
    returning id into v_conversion_id;
  else
    v_conversion_id:=quote_revision.conversion_id;
    insert into public.scanner_sales_proposal_revisions(id,conversion_id,proposal_id,predecessor_proposal_id,
      proposal_version_id,narrative_version_id,source_binding,client_safe_snapshot,created_by,created_at)
    values('ssr_'||replace(gen_random_uuid()::text,'-',''),v_conversion_id,proposalrow.id,quote_revision.predecessor_proposal_id,
      pkg.id,narr.id,binding,snapshot,actor_id,now_at);
    select * into parent_pub from public.scanner_sales_publications where proposal_id=parent.id;
    if parent_pub.id is null then raise exception using errcode='40001',message='Current predecessor publication evidence is missing'; end if;
    insert into public.scanner_sales_client_responses(id,conversion_id,proposal_id,client_id,actor_user_id,response_kind,
      proposal_version_id,snapshot_checksum,snapshot,source_binding,note,created_at)
    select 'scr_'||replace(gen_random_uuid()::text,'-',''),v_conversion_id,parent.id,q.client_id,actor_id,'superseded',
      parent_pub.source_binding->'proposal'->>'id',encode(extensions.digest(convert_to(parent_pub.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
      parent_pub.client_safe_snapshot,parent_pub.source_binding,'Superseded by published successor '||proposalrow.id,now_at
    from public.scanner_sales_publications parent_pub where parent_pub.proposal_id=parent.id;
  end if;
  v_publication_id:='spb_'||replace(gen_random_uuid()::text,'-','');
  insert into public.scanner_sales_publications(id,conversion_id,proposal_id,client_id,recipient_user_id,published_by,source_binding,client_safe_snapshot,published_at)
  values(v_publication_id,v_conversion_id,proposalrow.id,q.client_id,recipient.id,actor_id,binding,snapshot,now_at);
  if quote_revision.id is null then
    insert into public.scanner_sales_offer_heads(conversion_id,proposal_id,publication_id,client_id,updated_at)
      values(v_conversion_id,proposalrow.id,v_publication_id,q.client_id,now_at);
  else
    update public.scanner_sales_offer_heads h set proposal_id=proposalrow.id,publication_id=v_publication_id,updated_at=now_at where h.conversion_id=v_conversion_id;
  end if;
  return jsonb_build_object('published',true,'replayed',is_replay,'quoteId',q.id,'proposalId',proposalrow.id,
    'proposalNumber',proposalrow.proposal_number,'clientId',q.client_id,'recipientUserId',recipient.id,'publishedAt',now_at);
end $$;

-- The old feature publication RPC created scanner-derived direct proposals.
-- Keep its signature as a deny-only compatibility endpoint so no caller can
-- bypass quote approval and canonical issuance.
create or replace function public.bl_publish_scanner_sales_proposal(
  p_proposal_id text,p_expected_client_id text,p_recipient_user_id text,p_expected_currency text,
  p_expected_total_minor bigint,p_expected_valid_until date
) returns jsonb language plpgsql security invoker set search_path=public as $$
begin
  raise exception 'Direct scanner proposal publication is retired; publish its approved proposal_only quote' using errcode='0A000';
end $$;
revoke all on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) from public,anon,authenticated,service_role;

-- RLS policy subqueries cannot see the internal-only offer-head table under a
-- client role. Resolve that one boolean through a tightly scoped definer helper,
-- while deriving the client from both signed claims and the active user record.
create or replace function public.bl_client_can_read_scanner_offer(p_proposal_id text,p_client_id text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,auth as $$
  select auth.role()='authenticated'
    and auth.uid() is not null
    and public.bl_role() in ('client_admin','client_member')
    and public.bl_client_id()=p_client_id
    and exists(select 1 from public.users u where u.auth_user_id=auth.uid()
      and u.client_id=p_client_id and u.role::text=public.bl_role() and u.status='active')
    and exists(select 1 from public.scanner_sales_offer_heads h
      where h.proposal_id=p_proposal_id and h.client_id=p_client_id)
$$;
revoke all on function public.bl_client_can_read_scanner_offer(text,text) from public,anon,service_role;
grant execute on function public.bl_client_can_read_scanner_offer(text,text) to authenticated;

-- Canonical issuance marks quote-backed proposals as `issued`, an immutable
-- proposal status. The mutable offer-head projection controls which lineage
-- member remains visible; prior issued offers stay in the internal audit trail.
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select to authenticated using (
  public.bl_is_internal() or (
    client_id=public.bl_client_id() and (
      (proposal_kind='legacy_sales' and status<>'draft')
      or (proposal_kind='canonical_issued' and status='issued' and (
        source_run_id is null
        or public.bl_client_can_read_scanner_offer(proposals.id,proposals.client_id)
      ))
    )
  )
);
drop policy if exists proposal_items_read on public.proposal_items;
create policy proposal_items_read on public.proposal_items for select to authenticated using (
  public.bl_role() in ('owner','admin') or exists (
    select 1 from public.proposals p where p.id=proposal_items.proposal_id and p.client_id=public.bl_client_id()
      and p.status='issued' and (p.proposal_kind='legacy_sales' or p.source_run_id is null or
        public.bl_client_can_read_scanner_offer(p.id,p.client_id))
  )
);

create or replace function public.bl_client_scanner_proposal_contents()
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare au uuid:=auth.uid(); claim_client text:=nullif(auth.jwt()->'app_metadata'->>'client_id','');
  claim_role text:=auth.jwt()->'app_metadata'->>'role'; usr public.users%rowtype;
begin
  if auth.role()<>'authenticated' or au is null or claim_role not in ('client_admin','client_member') then
    raise exception using errcode='42501',message='Authenticated client account required';
  end if;
  select * into usr from public.users where auth_user_id=au and client_id=claim_client and role::text=claim_role and status='active';
  if usr.id is null then raise exception using errcode='42501',message='Client identity is unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('proposalId',p.id,'snapshot',pub.client_safe_snapshot,
      'snapshotChecksum',encode(extensions.digest(convert_to(pub.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
      'isCurrent',true,'depositMinor',p.deposit,'responseStatus',(select e.response_kind from public.scanner_sales_client_responses e
        where e.proposal_id=p.id and e.response_kind in ('accepted','change_requested') order by e.created_at desc limit 1),
      'responseNote',(select e.note from public.scanner_sales_client_responses e where e.proposal_id=p.id
        and e.response_kind in ('accepted','change_requested') order by e.created_at desc limit 1)) order by pub.published_at desc)
    from public.scanner_sales_offer_heads h join public.scanner_sales_publications pub
      on pub.id=h.publication_id and pub.proposal_id=h.proposal_id
    join public.proposals p on p.id=h.proposal_id
    where h.client_id=usr.client_id and p.client_id=usr.client_id and p.proposal_kind='canonical_issued' and p.status='issued'
      and pub.client_id=usr.client_id), '[]'::jsonb);
end $$;

create or replace function public.bl_client_scanner_proposal_response(
  p_proposal_id text,p_action text,p_expected_snapshot_checksum text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare au uuid:=auth.uid(); role_name text:=auth.jwt()->'app_metadata'->>'role'; client_id text; actor_id text;
  conv public.scanner_sales_conversions%rowtype; pub public.scanner_sales_publications%rowtype; p public.proposals%rowtype;
  head public.scanner_sales_offer_heads%rowtype; existing public.scanner_sales_client_responses%rowtype; version_id text; checksum text; kind text;
begin
  if auth.role()<>'authenticated' or au is null or role_name<>'client_admin' or p_action not in ('accept','change') then raise exception using errcode='42501'; end if;
  select id,users.client_id into actor_id,client_id from public.users where auth_user_id=au and role::text=role_name and status='active';
  if actor_id is null or client_id is null then raise exception using errcode='42501'; end if;
  select * into p from public.proposals where id=p_proposal_id;
  if p.id is null or p.proposal_kind<>'canonical_issued' or p.client_id is distinct from client_id then raise exception using errcode='42501'; end if;
  select * into conv from public.scanner_sales_conversions where proposal_id=p.id;
  if conv.id is null then select c.* into conv from public.scanner_sales_proposal_revisions r join public.scanner_sales_conversions c on c.id=r.conversion_id where r.proposal_id=p.id; end if;
  if conv.id is null then raise exception using errcode='P0002',message='Scanner publication not found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||conv.run_id,0));
  select * into conv from public.scanner_sales_conversions where id=conv.id for update;
  select * into head from public.scanner_sales_offer_heads where conversion_id=conv.id for update;
  select * into pub from public.scanner_sales_publications where proposal_id=p.id;
  select * into p from public.proposals where id=p.id for update;
  if pub.id is null or head.proposal_id is distinct from p.id or p.status<>'issued' then raise exception using errcode='40001',message='Only the current published offer can receive a response'; end if;
  checksum:=encode(extensions.digest(convert_to(pub.client_safe_snapshot::text,'UTF8'),'sha256'),'hex');
  if p_expected_snapshot_checksum is distinct from checksum then raise exception using errcode='40001',message='Published terms changed; reload before responding'; end if;
  if pub.client_id is distinct from client_id or pub.source_binding->'proposal' is null
     or pub.client_safe_snapshot->'pricing'->>'currency'<>'USD'
     or (pub.client_safe_snapshot->'pricing'->>'validUntil')::date<current_date then
    raise exception using errcode='40001',message='Published offer is stale, expired, or unavailable'; end if;
  kind:=case when p_action='accept' then 'accepted' else 'change_requested' end;
  select * into existing from public.scanner_sales_client_responses where proposal_id=p.id and response_kind=kind;
  if found then return jsonb_build_object('ok',true,'replayed',true,'status',kind,'proposalId',p.id,'snapshotChecksum',checksum); end if;
  if p_action='change' and length(trim(coalesce(p_note,''))) not between 5 and 2000 then raise exception using errcode='22023',message='Change request must be 5 to 2000 characters'; end if;
  if p_action='accept' and exists(select 1 from public.scanner_sales_client_responses where proposal_id=p.id and response_kind='change_requested') then
    raise exception using errcode='40001',message='A changed offer must be republished before acceptance'; end if;
  version_id:=pub.source_binding->'proposal'->>'id';
  insert into public.scanner_sales_client_responses(id,conversion_id,proposal_id,client_id,actor_user_id,response_kind,
    proposal_version_id,snapshot_checksum,snapshot,source_binding,note,created_at)
  values('scr_'||replace(gen_random_uuid()::text,'-',''),conv.id,p.id,client_id,actor_id,kind,version_id,checksum,
    pub.client_safe_snapshot,pub.source_binding,coalesce(trim(p_note),''),clock_timestamp());
  return jsonb_build_object('ok',true,'replayed',false,'status',kind,'proposalId',p.id,'snapshotChecksum',checksum);
end $$;

-- Scanner clients use immutable publication evidence; drafts and internal quote
-- notes remain inaccessible. Legacy quote/proposal mutation functions are intact.
revoke all on function public.bl_scanner_quote_publication_preview(text) from public,anon,service_role;
revoke all on function public.bl_create_scanner_sales_revision(text) from public,anon,service_role;
revoke all on function public.bl_publish_scanner_quote(text,timestamptz,text,text,text,bigint,date) from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_contents() from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_response(text,text,text,text) from public,anon,service_role;
grant execute on function public.bl_scanner_quote_publication_preview(text) to authenticated;
grant execute on function public.bl_create_scanner_sales_revision(text) to authenticated;
grant execute on function public.bl_publish_scanner_quote(text,timestamptz,text,text,text,bigint,date) to authenticated;
grant execute on function public.bl_client_scanner_proposal_response(text,text,text,text) to authenticated;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
commit;
