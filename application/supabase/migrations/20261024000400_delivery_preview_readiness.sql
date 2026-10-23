-- Keep admin eligibility in step with the authoritative publication checks.
begin;
create or replace function public.bl_scanner_sales_delivery_preview(p_proposal_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_auth uuid := auth.uid();
  v_role text := auth.jwt() -> 'app_metadata' ->> 'role';
  v_actor text;
  v_proposal public.proposals%rowtype;
  v_conversion public.scanner_sales_conversions%rowtype;
  v_client public.clients%rowtype;
  v_run public.intelligence_runs%rowtype;
  v_current_proposal public.proposal_versions%rowtype;
  v_current_narrative public.narrative_versions%rowtype;
  v_current_report public.intelligence_artifacts%rowtype;
  v_recipients jsonb;
  v_reason text;
  v_binding jsonb;
  v_review public.runtime_events%rowtype;
  v_failure boolean;
begin
  if auth.role() <> 'authenticated' or v_auth is null or v_role not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'Owner or admin authorization required';
  end if;
  select u.id into v_actor from public.users u
    where u.auth_user_id = v_auth and u.role::text = v_role and u.status = 'active';
  if v_actor is null then raise exception using errcode = '42501', message = 'Active owner or admin identity required'; end if;
  select * into v_proposal from public.proposals p where p.id = p_proposal_id;
  if not found then raise exception using errcode = 'P0002', message = 'Proposal not found'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id = p_proposal_id;
  if not found then raise exception using errcode = '22023', message = 'Proposal is not a scanner conversion'; end if;
  select * into v_client from public.clients c where c.id = v_proposal.client_id;
  select * into v_run from public.intelligence_runs r where r.id = v_conversion.run_id;
  select * into v_current_proposal from public.proposal_versions p where p.run_id = v_conversion.run_id order by p.version desc limit 1;
  select * into v_current_narrative from public.narrative_versions n where n.run_id = v_conversion.run_id and n.audience='client' order by n.version desc limit 1;
  select * into v_current_report from public.intelligence_artifacts a where a.run_id = v_conversion.run_id and a.kind='internal_intelligence_report' order by a.version desc limit 1;
  select jsonb_build_object(
    'schemaVersion',1,
    'proposal',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.proposal_versions where run_id=v_conversion.run_id order by version desc limit 1),
    'narrative',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.narrative_versions where run_id=v_conversion.run_id and audience='client' order by version desc limit 1),
    'report',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='internal_intelligence_report' order by version desc limit 1),
    'competitor',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='competitor_snapshot' order by version desc limit 1),
    'coreProposal',(select jsonb_build_object('id',id,'version',version,'checksum',checksum) from public.intelligence_artifacts where run_id=v_conversion.run_id and kind='proposal' order by version desc limit 1)
  ) into v_binding;
  select * into v_review from public.runtime_events e where e.run_id=v_conversion.run_id
    and e.aggregate_type='intelligence_run' and e.aggregate_id=v_conversion.run_id
    and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested')
    order by e.sequence desc limit 1;
  select exists (select 1 from (
    select distinct on (e.stage) e.event_type from public.runtime_events e where e.run_id=v_conversion.run_id
      and e.stage in ('competitor_intelligence','proposal_generation','narrative_generation')
      and e.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed',
        'runtime.commercial.stage_completed','runtime.commercial.enqueued') order by e.stage,e.sequence desc
  ) latest where latest.event_type in ('runtime.commercial.stage_failed','runtime.job.dead_lettered','runtime.commercial.enqueue_failed')) into v_failure;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'email',u.email) order by u.email),'[]'::jsonb)
    into v_recipients from public.users u join auth.users au on au.id=u.auth_user_id
    where u.client_id=v_conversion.client_id and u.role in ('client_admin','client_member')
      and u.status='active' and u.auth_user_id is not null and au.email_confirmed_at is not null;

  if v_run.status <> 'completed' or v_run.client_id is distinct from v_conversion.client_id then
    v_reason := 'The scanner run is incomplete or belongs to another client.';
  elsif v_conversion.source_binding is distinct from v_binding or v_review.id is null
    or v_review.event_type <> 'runtime.review.approved' or v_review.payload -> 'binding' is distinct from v_binding then
    v_reason := 'The approved source versions changed. Re-review and reconvert the package.';
  elsif v_current_proposal.envelope ->> 'status' <> 'draft_ready'
    or v_current_proposal.envelope ->> 'commercialState' <> 'priced'
    or v_current_narrative.envelope ->> 'status' <> 'ready'
    or v_current_report.validation_status <> 'valid' then
    v_reason := 'Required proposal, narrative, or report artifacts are incomplete.';
  elsif v_failure then
    v_reason := 'An unresolved commercial workflow failure blocks publication.';
  elsif v_client.lifecycle not in ('member','client_active','post_launch','renewed') then
    v_reason := 'The client account has not completed onboarding.';
  elsif jsonb_array_length(v_recipients)=0 then
    v_reason := 'No active, authenticated portal recipient is linked to this client.';
  elsif v_proposal.currency <> 'USD' then
    v_reason := 'Only USD proposals can be published until invoice currency support is available.';
  elsif v_proposal.valid_until is null or v_proposal.valid_until < current_date then
    v_reason := 'Commercial terms are missing an expiry or have expired.';
  elsif v_proposal.status <> 'draft' and not exists (select 1 from public.scanner_sales_publications d where d.proposal_id=p_proposal_id) then
    v_reason := 'This proposal is no longer a private draft.';
  end if;
  return jsonb_build_object('proposalId',v_proposal.id,'clientId',v_conversion.client_id,'company',v_client.company,
    'status',v_proposal.status,'currency',v_proposal.currency,'subtotalMinor',v_proposal.subtotal,
    'discountMinor',v_proposal.discount_minor,'totalMinor',v_proposal.total,'depositMinor',v_proposal.deposit,
    'validUntil',v_proposal.valid_until,'lineItems',v_proposal.line_items,'recipients',v_recipients,
    'eligible',v_reason is null,'reason',v_reason,
    'published',exists(select 1 from public.scanner_sales_publications d where d.proposal_id=p_proposal_id));
end;
$$;
commit;
