-- Sprint 1H: immutable commercial proposal revisions, publication head, and
-- client responses. The original conversion remains unique per scanner run.
begin;

-- Keep uniqueness per proposal and per conversion/proposal pair while allowing
-- several proposal publications to share the one immutable run conversion.
alter table public.scanner_sales_publications
  drop constraint scanner_sales_publications_conversion_id_key;
create unique index scanner_sales_publications_conversion_proposal_uidx
  on public.scanner_sales_publications(conversion_id, proposal_id);

create table public.scanner_sales_proposal_revisions (
  id text primary key,
  conversion_id text not null references public.scanner_sales_conversions(id) on delete restrict,
  proposal_id text not null unique references public.proposals(id) on delete restrict,
  predecessor_proposal_id text not null references public.proposals(id) on delete restrict,
  proposal_version_id text not null references public.proposal_versions(id) on delete restrict,
  narrative_version_id text not null references public.narrative_versions(id) on delete restrict,
  source_binding jsonb not null,
  client_safe_snapshot jsonb not null,
  created_by text not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint scanner_sales_revision_not_self check (proposal_id <> predecessor_proposal_id),
  constraint scanner_sales_revision_binding_object check (jsonb_typeof(source_binding) = 'object'),
  constraint scanner_sales_revision_snapshot_object check (jsonb_typeof(client_safe_snapshot) = 'object'),
  unique (conversion_id, proposal_id)
);
create index scanner_sales_revisions_lineage_idx
  on public.scanner_sales_proposal_revisions(conversion_id, created_at);
alter table public.scanner_sales_proposal_revisions enable row level security;
create policy scanner_sales_revisions_internal_read on public.scanner_sales_proposal_revisions
  for select to authenticated using (public.bl_role() in ('owner','admin','team_member'));
revoke all on public.scanner_sales_proposal_revisions from public, anon, authenticated, service_role;
grant select on public.scanner_sales_proposal_revisions to authenticated;

create table public.scanner_sales_offer_heads (
  conversion_id text primary key references public.scanner_sales_conversions(id) on delete restrict,
  proposal_id text not null unique references public.proposals(id) on delete restrict,
  publication_id text not null unique references public.scanner_sales_publications(id) on delete restrict,
  client_id text not null references public.clients(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (conversion_id, proposal_id)
);
alter table public.scanner_sales_offer_heads enable row level security;
create policy scanner_sales_offer_heads_internal_read on public.scanner_sales_offer_heads
  for select to authenticated using (public.bl_role() in ('owner','admin','team_member'));
revoke all on public.scanner_sales_offer_heads from public, anon, authenticated, service_role;
grant select on public.scanner_sales_offer_heads to authenticated;

-- Immutable response/event history. The mutable offer-head row is only a
-- transactionally maintained projection; this table and publication history
-- remain the audit source.
create table public.scanner_sales_client_responses (
  id text primary key,
  conversion_id text not null references public.scanner_sales_conversions(id) on delete restrict,
  proposal_id text not null references public.proposals(id) on delete restrict,
  client_id text not null references public.clients(id) on delete restrict,
  actor_user_id text not null references public.users(id) on delete restrict,
  response_kind text not null check (response_kind in ('change_requested','accepted','superseded')),
  proposal_version_id text not null references public.proposal_versions(id) on delete restrict,
  snapshot_checksum text not null check (snapshot_checksum ~ '^[0-9a-f]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  source_binding jsonb not null check (jsonb_typeof(source_binding) = 'object'),
  note text not null default '',
  created_at timestamptz not null default now()
);
create unique index scanner_sales_response_once_per_kind_uidx
  on public.scanner_sales_client_responses(proposal_id, response_kind);
create index scanner_sales_responses_lineage_idx
  on public.scanner_sales_client_responses(conversion_id, created_at);
alter table public.scanner_sales_client_responses enable row level security;
create policy scanner_sales_responses_internal_read on public.scanner_sales_client_responses
  for select to authenticated using (public.bl_role() in ('owner','admin','team_member'));
revoke all on public.scanner_sales_client_responses from public, anon, authenticated, service_role;
grant select on public.scanner_sales_client_responses to authenticated;

create function public.bl_scanner_sales_revision_immutable()
returns trigger language plpgsql as $$ begin
  raise exception 'Scanner sales revision history is append-only' using errcode = '55000';
end $$;
create trigger scanner_sales_revisions_no_mutation before update or delete
  on public.scanner_sales_proposal_revisions for each row execute function public.bl_scanner_sales_revision_immutable();
create trigger scanner_sales_revisions_no_truncate before truncate
  on public.scanner_sales_proposal_revisions for each statement execute function public.bl_scanner_sales_revision_immutable();
create trigger scanner_sales_responses_no_mutation before update or delete
  on public.scanner_sales_client_responses for each row execute function public.bl_scanner_sales_revision_immutable();
create trigger scanner_sales_responses_no_truncate before truncate
  on public.scanner_sales_client_responses for each statement execute function public.bl_scanner_sales_revision_immutable();
create trigger scanner_sales_offer_heads_no_delete before delete
  on public.scanner_sales_offer_heads for each row execute function public.bl_scanner_sales_revision_immutable();
create trigger scanner_sales_offer_heads_no_truncate before truncate
  on public.scanner_sales_offer_heads for each statement execute function public.bl_scanner_sales_revision_immutable();

-- The existing conversion trigger protects originals. Extend the same no-edit
-- rule to separately mapped revisions.
create or replace function public.bl_guard_converted_proposal_terms()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
begin
  if (exists (select 1 from public.scanner_sales_conversions c where c.proposal_id = old.id)
      or exists (select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id = old.id))
    and (new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit or new.total is distinct from old.total
      or new.currency is distinct from old.currency or new.discount_minor is distinct from old.discount_minor
      or new.valid_until is distinct from old.valid_until) then
    raise exception 'Scanner sales proposal terms are immutable; create a new reviewed proposal revision' using errcode = '55000';
  end if;
  if new.status = 'sent' and new.status is distinct from old.status
    and exists (select 1 from public.scanner_sales_conversions c where c.proposal_id = old.id)
    and not (old.status = 'draft' and exists (select 1 from public.scanner_sales_publications d
      where d.proposal_id = old.id and d.client_id = old.client_id)) then
    raise exception 'Converted proposals require the authorized publication operation' using errcode = '42501';
  end if;
  if new.status = 'sent' and new.status is distinct from old.status
    and exists (select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id = old.id)
    and not (old.status = 'draft' and exists (select 1 from public.scanner_sales_publications d
      where d.proposal_id = old.id and d.client_id = old.client_id)) then
    raise exception 'Revision proposals require the authorized publication operation' using errcode = '42501';
  end if;
  return new;
end $$;

-- Resolve exactly the same version identities used by commercial approval.
create function public.bl_scanner_sales_current_binding(p_run_id text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('schemaVersion',1,
    'proposal',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.proposal_versions where run_id=p_run_id order by version desc limit 1),
    'narrative',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.narrative_versions where run_id=p_run_id and audience='client' order by version desc limit 1),
    'report',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=p_run_id and kind='internal_intelligence_report' order by version desc limit 1),
    'competitor',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=p_run_id and kind='competitor_snapshot' order by version desc limit 1),
    'coreProposal',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=p_run_id and kind='proposal' order by version desc limit 1))
$$;
revoke all on function public.bl_scanner_sales_current_binding(text) from public, anon, authenticated, service_role;

-- Create a private canonical proposal from a new priced proposal_versions row.
-- Intelligence/narrative/artifact bindings must match the predecessor; only the
-- commercial proposal version may change without a new scanner run.
create function public.bl_create_scanner_sales_revision(p_predecessor_proposal_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid(); v_role text := auth.jwt()->'app_metadata'->>'role'; v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype; v_revision public.scanner_sales_proposal_revisions%rowtype;
  v_parent_publication public.scanner_sales_publications%rowtype; v_parent public.proposals%rowtype;
  v_run public.intelligence_runs%rowtype; v_pkg public.proposal_versions%rowtype; v_narrative public.narrative_versions%rowtype;
  v_report public.intelligence_artifacts%rowtype; v_competitor public.intelligence_artifacts%rowtype; v_core public.intelligence_artifacts%rowtype;
  v_review public.runtime_events%rowtype; v_binding jsonb; v_envelope jsonb; v_pricing jsonb; v_snapshot jsonb;
  v_lines jsonb; v_new_id text; v_revision_id text; v_currency text; v_expiry date; v_subtotal bigint; v_total bigint;
  v_discount bigint; v_recurring bigint; v_parent_binding jsonb; v_now timestamptz := now();
begin
  if auth.role()<>'authenticated' or v_auth is null or v_role not in ('owner','admin') then
    raise exception using errcode='42501',message='Owner or admin authorization required';
  end if;
  select u.id into v_actor from public.users u where u.auth_user_id=v_auth and u.role::text=v_role and u.status='active';
  if v_actor is null then raise exception using errcode='42501',message='Active owner or admin identity required'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id=p_predecessor_proposal_id;
  if not found then select c.* into v_conversion from public.scanner_sales_proposal_revisions r join public.scanner_sales_conversions c on c.id=r.conversion_id where r.proposal_id=p_predecessor_proposal_id; end if;
  if v_conversion.id is null then raise exception using errcode='22023',message='Proposal has no scanner conversion lineage'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||v_conversion.run_id,0));
  select * into v_run from public.intelligence_runs r where r.id=v_conversion.run_id for update;
  select * into v_parent from public.proposals p where p.id=p_predecessor_proposal_id for update;
  select * into v_parent_publication from public.scanner_sales_publications d where d.proposal_id=p_predecessor_proposal_id;
  if v_parent.id is null or v_parent_publication.id is null or v_parent.client_id<>v_conversion.client_id then
    raise exception using errcode='40001',message='A published lineage offer is required';
  end if;
  if not exists(select 1 from public.scanner_sales_offer_heads h where h.conversion_id=v_conversion.id and h.proposal_id=p_predecessor_proposal_id) then
    raise exception using errcode='40001',message='Only the current published offer can be revised';
  end if;
  if v_parent.status='accepted' or exists(select 1 from public.scanner_sales_client_responses e where e.proposal_id=p_predecessor_proposal_id and e.response_kind='accepted') then
    raise exception using errcode='55000',message='Accepted offers cannot be revised; amendment workflow requires separate approval';
  end if;
  if v_run.status<>'completed' or v_run.client_id<>v_conversion.client_id then raise exception using errcode='40001',message='Scanner intelligence is unavailable'; end if;
  select * into v_pkg from public.proposal_versions p where p.run_id=v_run.id order by p.version desc limit 1;
  select * into v_narrative from public.narrative_versions n where n.run_id=v_run.id and n.audience='client' order by n.version desc limit 1;
  select * into v_report from public.intelligence_artifacts a where a.run_id=v_run.id and a.kind='internal_intelligence_report' order by a.version desc limit 1;
  select * into v_competitor from public.intelligence_artifacts a where a.run_id=v_run.id and a.kind='competitor_snapshot' order by a.version desc limit 1;
  select * into v_core from public.intelligence_artifacts a where a.run_id=v_run.id and a.kind='proposal' order by a.version desc limit 1;
  v_binding:=public.bl_scanner_sales_current_binding(v_run.id);
  v_parent_binding:=v_parent_publication.source_binding;
  if (v_binding-'proposal') is distinct from (v_parent_binding-'proposal') then
    raise exception using errcode='40001',message='Scanner intelligence or narrative sources changed; refresh and review those sources before preparing a revision';
  end if;
  if v_pkg.id is null or v_narrative.id is null or v_report.id is null or v_report.validation_status<>'valid'
    or v_pkg.envelope->>'status'<>'draft_ready' or v_pkg.envelope->>'commercialState'<>'priced'
    or v_narrative.envelope->>'status'<>'ready' or (v_competitor.id is not null and v_competitor.validation_status='invalid')
    or (v_core.id is not null and v_core.validation_status='invalid') then
    raise exception using errcode='40001',message='Current intelligence or commercial package is incomplete';
  end if;
  select * into v_review from public.runtime_events e where e.run_id=v_run.id and e.aggregate_type='intelligence_run'
    and e.aggregate_id=v_run.id and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested') order by e.sequence desc limit 1;
  if v_review.id is null or v_review.event_type<>'runtime.review.approved' or v_review.payload->'binding' is distinct from v_binding then
    raise exception using errcode='40001',message='A fresh approval bound to the current commercial version is required';
  end if;
  v_envelope:=v_pkg.envelope; v_pricing:=v_envelope->'pricing';
  if v_pricing->>'currency' is distinct from v_parent.currency or v_pricing->>'currency' !~ '^[A-Z]{3}$' then
    raise exception using errcode='22023',message='Revision currency must match the predecessor currency';
  end if;
  v_currency:=v_pricing->>'currency';
  begin v_expiry:=(v_pricing->>'validUntil')::date; exception when others then raise exception using errcode='22023',message='A valid expiry is required'; end;
  if v_expiry<current_date or jsonb_typeof(v_pricing->'items') is distinct from 'array' or jsonb_array_length(v_pricing->'items')=0 then
    raise exception using errcode='22023',message='Complete, unexpired pricing is required';
  end if;
  v_discount:=(v_pricing->>'discountMinor')::bigint; v_subtotal:=(v_pricing->>'subtotalOneTimeMinor')::bigint;
  v_total:=(v_pricing->>'totalOneTimeMinor')::bigint; v_recurring:=(v_pricing->>'totalRecurringMonthlyMinor')::bigint;
  select coalesce(jsonb_agg(jsonb_build_object('label',w.value->>'title','description',w.value->>'solution',
      'quantity',(i.value->>'quantity')::int,'amount',((i.value->>'amountMinor')::bigint*(i.value->>'quantity')::int),
      'unitAmountMinor',(i.value->>'amountMinor')::bigint,'pricingType',i.value->>'pricingType','cadence',i.value->'cadence','optional',(i.value->>'optional')::boolean) order by w.ord),'[]'::jsonb)
    into v_lines from jsonb_array_elements(v_envelope->'recommendedWork') with ordinality w(value,ord)
      join jsonb_array_elements(v_pricing->'items') i(value) on i.value->>'sourceId'=w.value->>'sourceId';
  if jsonb_array_length(v_lines)<>jsonb_array_length(v_envelope->'recommendedWork')
    or (select coalesce(sum((x.value->>'amount')::numeric),0) from jsonb_array_elements(v_lines) x(value) where x.value->>'pricingType'='one_time')<>v_subtotal
    or greatest(0,v_subtotal-v_discount)<>v_total then
    raise exception using errcode='22023',message='Commercial totals do not reconcile with the priced scope';
  end if;
  v_snapshot:=jsonb_build_object('schemaVersion',1,'proposal',jsonb_build_object(
    'executiveSummary',v_envelope->'executiveSummary','observedSituation',v_envelope->'observedSituation',
    'keyIssues',coalesce((select jsonb_agg(jsonb_build_object('title',x.value->'title','detail',x.value->'detail')) from jsonb_array_elements(v_envelope->'keyIssues') x(value)),'[]'::jsonb),
    'opportunities',coalesce((select jsonb_agg(jsonb_build_object('title',x.value->'title','detail',x.value->'detail')) from jsonb_array_elements(v_envelope->'opportunities') x(value)),'[]'::jsonb),
    'scope',v_lines,'proposedNextStep',v_envelope->'proposedNextStep'),
    'narrative',v_parent_publication.client_safe_snapshot->'narrative',
    'pricing',jsonb_build_object('currency',v_currency,'discountMinor',v_discount,'subtotalOneTimeMinor',v_subtotal,
      'totalOneTimeMinor',v_total,'totalRecurringMonthlyMinor',v_recurring,'validUntil',v_expiry));
  v_new_id:='sp_'||replace(gen_random_uuid()::text,'-',''); v_revision_id:='ssr_'||replace(gen_random_uuid()::text,'-','');
  insert into public.proposals(id,client_id,line_items,subtotal,deposit,total,status,currency,discount_minor,valid_until)
  values(v_new_id,v_conversion.client_id,v_lines,v_subtotal,0,v_total,'draft',v_currency,v_discount,v_expiry);
  insert into public.scanner_sales_proposal_revisions(id,conversion_id,proposal_id,predecessor_proposal_id,
    proposal_version_id,narrative_version_id,source_binding,client_safe_snapshot,created_by,created_at)
  values(v_revision_id,v_conversion.id,v_new_id,p_predecessor_proposal_id,v_pkg.id,v_narrative.id,v_binding,v_snapshot,v_actor,v_now);
  return jsonb_build_object('proposalId',v_new_id,'predecessorProposalId',p_predecessor_proposal_id,
    'proposalVersionId',v_pkg.id,'sourceBinding',v_binding,'snapshotChecksum',encode(digest(convert_to(v_snapshot::text,'UTF8'),'sha256'),'hex'));
end $$;

-- Keep the original publication implementation as a private helper. The public
-- RPC serializes every publish through the lineage row and advances one head.
alter function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date)
  rename to bl_publish_scanner_sales_proposal_original;
revoke all on function public.bl_publish_scanner_sales_proposal_original(text,text,text,text,bigint,date) from public,anon,authenticated,service_role;

-- Backfill the current pointer from already-published original conversions.
insert into public.scanner_sales_offer_heads(conversion_id,proposal_id,publication_id,client_id,updated_at)
select d.conversion_id,d.proposal_id,d.id,d.client_id,d.published_at
from public.scanner_sales_publications d
on conflict (conversion_id) do nothing;

create function public.bl_publish_scanner_sales_proposal(
  p_proposal_id text,p_expected_client_id text,p_recipient_user_id text,p_expected_currency text,
  p_expected_total_minor bigint,p_expected_valid_until date
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype; v_revision public.scanner_sales_proposal_revisions%rowtype;
  v_publication public.scanner_sales_publications%rowtype; v_head public.scanner_sales_offer_heads%rowtype;
  v_parent public.proposals%rowtype; v_proposal public.proposals%rowtype; v_recipient public.users%rowtype;
  v_current_binding jsonb; v_review public.runtime_events%rowtype; v_checksum text; v_now timestamptz:=now();
  v_result jsonb; v_parent_publication public.scanner_sales_publications%rowtype;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_role not in ('owner','admin') then raise exception using errcode='42501',message='Owner or admin authorization required'; end if;
  select u.id into v_actor from public.users u where u.auth_user_id=v_auth and u.role::text=v_role and u.status='active';
  if v_actor is null then raise exception using errcode='42501',message='Active owner or admin identity required'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id=p_proposal_id;
  if not found then select c.* into v_conversion from public.scanner_sales_proposal_revisions r join public.scanner_sales_conversions c on c.id=r.conversion_id where r.proposal_id=p_proposal_id; end if;
  if v_conversion.id is null then raise exception using errcode='22023',message='Proposal is not a scanner sales lineage offer'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||v_conversion.run_id,0));
  select * into v_conversion from public.scanner_sales_conversions c where c.id=v_conversion.id for update;
  select * into v_head from public.scanner_sales_offer_heads h where h.conversion_id=v_conversion.id for update;
  select * into v_proposal from public.proposals p where p.id=p_proposal_id for update;
  select * into v_revision from public.scanner_sales_proposal_revisions r where r.proposal_id=p_proposal_id;
  if v_proposal.id is null or v_proposal.client_id<>v_conversion.client_id or p_expected_client_id<>v_conversion.client_id then raise exception using errcode='40001',message='Proposal or client changed'; end if;
  select u.* into v_recipient from public.users u join auth.users au on au.id=u.auth_user_id
    where u.id=p_recipient_user_id and u.client_id=v_conversion.client_id and u.role in ('client_admin','client_member')
      and u.status='active' and au.email_confirmed_at is not null;
  if not found then raise exception using errcode='40001',message='Recipient is not an active authenticated member of this client'; end if;
  if v_revision.id is null then
    if v_head.proposal_id is not null and v_head.proposal_id<>p_proposal_id then raise exception using errcode='40001',message='This offer has been superseded'; end if;
    v_result:=public.bl_publish_scanner_sales_proposal_original(p_proposal_id,p_expected_client_id,p_recipient_user_id,p_expected_currency,p_expected_total_minor,p_expected_valid_until);
    select * into v_publication from public.scanner_sales_publications d where d.proposal_id=p_proposal_id;
  else
    if v_head.proposal_id is null or v_revision.predecessor_proposal_id<>v_head.proposal_id then raise exception using errcode='40001',message='Revision is not the approved successor of the current offer'; end if;
    select * into v_parent from public.proposals p where p.id=v_head.proposal_id for update;
    select * into v_parent_publication from public.scanner_sales_publications d where d.proposal_id=v_head.proposal_id;
    if v_parent.status='accepted' or exists(select 1 from public.scanner_sales_client_responses e where e.proposal_id=v_parent.id and e.response_kind='accepted') then
      raise exception using errcode='55000',message='Accepted offers cannot be superseded; amendment workflow requires separate approval';
    end if;
    if v_proposal.status<>'draft' then raise exception using errcode='40001',message='Only a private revision draft can be published'; end if;
    v_current_binding:=public.bl_scanner_sales_current_binding(v_conversion.run_id);
    if v_current_binding is distinct from v_revision.source_binding then raise exception using errcode='40001',message='Revision sources changed after review'; end if;
    select * into v_review from public.runtime_events e where e.run_id=v_conversion.run_id and e.aggregate_type='intelligence_run' and e.aggregate_id=v_conversion.run_id
      and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested') order by e.sequence desc limit 1;
    if v_review.event_type<>'runtime.review.approved' or v_review.payload->'binding' is distinct from v_revision.source_binding then raise exception using errcode='40001',message='Fresh version-bound approval is required'; end if;
    if v_proposal.currency<>'USD' or v_proposal.valid_until is null or v_proposal.valid_until<current_date
      or p_expected_currency<>v_proposal.currency or p_expected_total_minor<>v_proposal.total or p_expected_valid_until is distinct from v_proposal.valid_until
      or v_revision.client_safe_snapshot->'pricing'->>'currency'<>v_proposal.currency
      or (v_revision.client_safe_snapshot->'pricing'->>'totalOneTimeMinor')::bigint<>v_proposal.total
      or v_revision.client_safe_snapshot->'proposal'->'scope' is distinct from v_proposal.line_items then
      raise exception using errcode='40001',message='Revision terms are stale, expired, unsupported, or differ from the confirmed snapshot';
    end if;
    insert into public.scanner_sales_publications(id,conversion_id,proposal_id,client_id,recipient_user_id,published_by,source_binding,client_safe_snapshot,published_at)
      values('spb_'||replace(gen_random_uuid()::text,'-',''),v_conversion.id,p_proposal_id,v_conversion.client_id,v_recipient.id,v_actor,v_revision.source_binding,v_revision.client_safe_snapshot,v_now)
      returning * into v_publication;
    insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
      values('proposal','proposals',v_parent.id,v_parent.status::text,'revised',v_actor,'superseded by published commercial revision',v_now);
    insert into public.scanner_sales_client_responses(id,conversion_id,proposal_id,client_id,actor_user_id,response_kind,proposal_version_id,snapshot_checksum,snapshot,source_binding,note,created_at)
      values('scr_'||replace(gen_random_uuid()::text,'-',''),v_conversion.id,v_parent.id,v_conversion.client_id,v_actor,'superseded',
        v_parent_publication.source_binding->'proposal'->>'id',
        encode(digest(convert_to(v_parent_publication.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
        v_parent_publication.client_safe_snapshot,v_parent_publication.source_binding,'Superseded by '||p_proposal_id,v_now);
    update public.proposals set status='revised' where id=v_parent.id;
    insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
      values('proposal','proposals',p_proposal_id,'draft','sent',v_actor,'portal publication',v_now);
    update public.proposals set status='sent',sent_at=v_now where id=p_proposal_id;
    update public.scanner_sales_offer_heads set proposal_id=p_proposal_id,publication_id=v_publication.id,updated_at=v_now where conversion_id=v_conversion.id;
  end if;
  if v_revision.id is null then
    insert into public.scanner_sales_offer_heads(conversion_id,proposal_id,publication_id,client_id,updated_at)
    values(v_conversion.id,p_proposal_id,v_publication.id,v_conversion.client_id,v_now)
    on conflict(conversion_id) do update set proposal_id=excluded.proposal_id,publication_id=excluded.publication_id,updated_at=excluded.updated_at;
  end if;
  return jsonb_build_object('published',true,'replayed',v_publication.published_at<v_now,'proposalId',p_proposal_id,
    'clientId',v_conversion.client_id,'recipientUserId',v_recipient.id,'recipientName',v_recipient.name,'recipientEmail',v_recipient.email,'publishedAt',v_publication.published_at);
end $$;

insert into public.state_transitions(machine,from_state,to_state) values
  ('proposal','sent','revised'),('proposal','viewed','revised'),('proposal','change_requested','revised')
on conflict(machine,from_state,to_state) do nothing;

-- Client action RPC: only client admins may act; one lock serializes accept and
-- successor publication. Change requests append an event but leave the head intact.
create function public.bl_client_scanner_proposal_response(
  p_proposal_id text,p_action text,p_expected_snapshot_checksum text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_client text; v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype; v_publication public.scanner_sales_publications%rowtype;
  v_proposal public.proposals%rowtype; v_head public.scanner_sales_offer_heads%rowtype; v_binding jsonb;
  v_version text; v_checksum text; v_response public.scanner_sales_client_responses%rowtype; v_now timestamptz:=now(); v_to text;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_role<>'client_admin' then raise exception using errcode='42501',message='Authenticated client admin required'; end if;
  select u.id,u.client_id into v_actor,v_client from public.users u where u.auth_user_id=v_auth and u.role::text=v_role and u.status='active';
  if v_actor is null or v_client is null then raise exception using errcode='42501',message='Active client identity required'; end if;
  select * into v_proposal from public.proposals p where p.id=p_proposal_id;
  if v_proposal.id is null then raise exception using errcode='P0002',message='Proposal not found'; end if;
  if v_proposal.client_id<>v_client then raise exception using errcode='42501',message='Proposal belongs to another client'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id=p_proposal_id;
  if not found then select c.* into v_conversion from public.scanner_sales_proposal_revisions r join public.scanner_sales_conversions c on c.id=r.conversion_id where r.proposal_id=p_proposal_id; end if;
  if v_conversion.id is null then raise exception using errcode='P0002',message='Proposal uses the legacy response path'; end if;
  perform pg_advisory_xact_lock(hashtextextended('auxion-commercial-review:'||v_conversion.run_id,0));
  select * into v_conversion from public.scanner_sales_conversions c where c.id=v_conversion.id for update;
  select * into v_head from public.scanner_sales_offer_heads h where h.conversion_id=v_conversion.id for update;
  select * into v_publication from public.scanner_sales_publications d where d.proposal_id=p_proposal_id;
  select * into v_proposal from public.proposals p where p.id=p_proposal_id for update;
  if v_publication.id is null or v_head.proposal_id<>p_proposal_id or v_proposal.status not in ('sent','viewed','change_requested') then raise exception using errcode='40001',message='Only the current published offer can receive a response'; end if;
  v_checksum:=encode(digest(convert_to(v_publication.client_safe_snapshot::text,'UTF8'),'sha256'),'hex');
  if p_expected_snapshot_checksum is distinct from v_checksum then raise exception using errcode='40001',message='Published terms changed; reload before responding'; end if;
  if v_publication.client_id<>v_client or v_publication.source_binding->'proposal' is null then raise exception using errcode='42501',message='Published proposal identity is invalid'; end if;
  v_version:=v_publication.source_binding->'proposal'->>'id';
  if v_publication.client_safe_snapshot->'pricing'->>'currency'<>'USD'
    or (v_publication.client_safe_snapshot->'pricing'->>'validUntil')::date<current_date
    or v_publication.client_safe_snapshot->'proposal'->'scope' is distinct from v_proposal.line_items
    or (v_publication.client_safe_snapshot->'pricing'->>'totalOneTimeMinor')::bigint<>v_proposal.total
    or v_publication.client_safe_snapshot->'pricing'->>'currency'<>v_proposal.currency then
    raise exception using errcode='40001',message='Published terms are expired or no longer match the canonical proposal';
  end if;
  if p_action not in ('accept','change') then raise exception using errcode='22023',message='Unknown proposal response'; end if;
  select * into v_response from public.scanner_sales_client_responses e where e.proposal_id=p_proposal_id and e.response_kind=case when p_action='accept' then 'accepted' else 'change_requested' end;
  if found then return jsonb_build_object('ok',true,'replayed',true,'status',case when p_action='accept' then 'accepted' else 'change_requested' end); end if;
  if p_action='accept' then
    if exists(select 1 from public.scanner_sales_client_responses e where e.proposal_id=p_proposal_id and e.response_kind='change_requested') then raise exception using errcode='40001',message='This offer has a change request and cannot be accepted'; end if;
    v_to:='accepted';
  else
    if length(trim(coalesce(p_note,'')))<5 or length(p_note)>2000 then raise exception using errcode='22023',message='Please describe the requested change (5 to 2000 characters)'; end if;
    v_to:='change_requested';
  end if;
  if not exists(select 1 from public.state_transitions st where st.machine='proposal' and st.from_state=v_proposal.status::text and st.to_state=v_to) then raise exception using errcode='23514',message='Proposal cannot move to the requested response state'; end if;
  insert into public.scanner_sales_client_responses(id,conversion_id,proposal_id,client_id,actor_user_id,response_kind,proposal_version_id,snapshot_checksum,snapshot,source_binding,note,created_at)
    values('scr_'||replace(gen_random_uuid()::text,'-',''),v_conversion.id,p_proposal_id,v_client,v_actor,v_to,v_version,v_checksum,v_publication.client_safe_snapshot,v_publication.source_binding,coalesce(trim(p_note),''),v_now);
  insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
    values('proposal','proposals',p_proposal_id,v_proposal.status::text,v_to,v_actor,case when p_action='accept' then 'client accepted published snapshot' else 'client requested changes' end,v_now);
  update public.proposals set status=v_to::public.proposal_status,decided_at=v_now,change_note=case when p_action='change' then trim(p_note) else change_note end where id=p_proposal_id;
  return jsonb_build_object('ok',true,'replayed',false,'status',v_to,'proposalId',p_proposal_id,'snapshotChecksum',v_checksum);
end $$;

-- Scanner-origin actions cannot use the status-only legacy RPC to accept or ask
-- for changes without the snapshot-bound ledger. Legacy proposals are unchanged.
create or replace function public.bl_client_proposal_action(p_proposal_id text,p_action text,p_note text default '')
returns public.proposal_status language plpgsql security definer set search_path=public as $$
declare v_user_id text; v_client_id text; v_from public.proposal_status; v_pclient text; v_to public.proposal_status;
begin
  select u.id,u.client_id into v_user_id,v_client_id from public.users u where u.auth_user_id=auth.uid();
  if v_user_id is null then raise exception using errcode='42501',message='No user'; end if;
  if public.bl_role()<>'client_admin' then raise exception using errcode='42501',message='Only a client admin may act on a proposal'; end if;
  select p.status,p.client_id into v_from,v_pclient from public.proposals p where p.id=p_proposal_id;
  if v_from is null then raise exception using errcode='P0002',message='Proposal not found'; end if;
  if v_pclient<>v_client_id then raise exception using errcode='42501',message='Not your proposal'; end if;
  if p_action in ('accept','change') and (exists(select 1 from public.scanner_sales_conversions c where c.proposal_id=p_proposal_id)
    or exists(select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id=p_proposal_id)) then
    raise exception using errcode='42501',message='Use the snapshot-bound scanner proposal response action';
  end if;
  v_to:=case p_action when 'view' then 'viewed' when 'accept' then 'accepted' when 'change' then 'change_requested' else null end;
  if v_to is null then raise exception using errcode='22023',message='Unknown proposal action'; end if;
  if p_action='view' and v_from<>'sent' then return v_from; end if;
  if not exists(select 1 from public.state_transitions st where st.machine='proposal' and st.from_state=v_from::text and st.to_state=v_to::text) then raise exception using errcode='23514',message='Illegal proposal move'; end if;
  insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at) values('proposal','proposals',p_proposal_id,v_from::text,v_to::text,v_user_id,'client '||p_action,now());
  update public.proposals set status=v_to,viewed_at=case when p_action='view' then now() else viewed_at end,
    decided_at=case when p_action in ('accept','change') then now() else decided_at end,
    change_note=case when p_action='change' then nullif(p_note,'') else change_note end where id=p_proposal_id;
  return v_to;
end $$;

-- Original proposals continue through the old implementation, but the offer
-- head is now required and revisions use a separate guarded branch above.
-- Client snapshots include immutable checksum and current/superseded state.
create or replace function public.bl_client_scanner_proposal_contents()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_auth uuid:=auth.uid(); v_claim_client text:=nullif(auth.jwt()->'app_metadata'->>'client_id','');
  v_claim_role text:=auth.jwt()->'app_metadata'->>'role'; v_user public.users%rowtype;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_claim_role not in ('client_admin','client_member') then raise exception using errcode='42501',message='Authenticated client account required'; end if;
  select * into v_user from public.users u where u.auth_user_id=v_auth and u.client_id=v_claim_client and u.role::text=v_claim_role and u.status='active';
  if not found then raise exception using errcode='42501',message='Client identity is unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('proposalId',p.id,'snapshot',d.client_safe_snapshot,
    'depositMinor',p.deposit,'snapshotChecksum',encode(digest(convert_to(d.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
    'isCurrent',h.proposal_id=p.id,'superseded',h.proposal_id is distinct from p.id)
    order by d.published_at desc) from public.scanner_sales_publications d join public.proposals p on p.id=d.proposal_id
    left join public.scanner_sales_offer_heads h on h.conversion_id=d.conversion_id
    where d.client_id=v_user.client_id and p.client_id=v_user.client_id
      and p.status in ('sent','viewed','accepted','change_requested','revised','expired')), '[]'::jsonb);
end $$;

-- Seed initial publication heads for new publishes by invoking this trigger
-- helper from the public RPC wrapper. Existing heads were backfilled above.
revoke all on function public.bl_create_scanner_sales_revision(text) from public,anon,service_role;
revoke all on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_response(text,text,text,text) from public,anon,service_role;
revoke all on function public.bl_client_proposal_action(text,text,text) from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_contents() from public,anon,service_role;
grant execute on function public.bl_create_scanner_sales_revision(text) to authenticated;
grant execute on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) to authenticated;
grant execute on function public.bl_client_scanner_proposal_response(text,text,text,text) to authenticated;
grant execute on function public.bl_client_proposal_action(text,text,text) to authenticated;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
revoke all on function public.bl_scanner_sales_revision_immutable() from public,anon,authenticated,service_role;
commit;
