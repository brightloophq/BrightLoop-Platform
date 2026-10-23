-- Sprint 1H follow-up guards: enforce revision freshness and snapshot integrity
-- at the database boundary, including privileged insert paths.
begin;

create unique index scanner_sales_revision_version_uidx
  on public.scanner_sales_proposal_revisions(conversion_id, proposal_version_id);

create function public.bl_guard_scanner_sales_revision_insert()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_head public.scanner_sales_offer_heads%rowtype; v_parent_pub public.scanner_sales_publications%rowtype;
  v_conversion public.scanner_sales_conversions%rowtype; v_version public.proposal_versions%rowtype;
begin
  select * into v_conversion from public.scanner_sales_conversions c where c.id=new.conversion_id;
  select * into v_head from public.scanner_sales_offer_heads h where h.conversion_id=new.conversion_id for update;
  select * into v_parent_pub from public.scanner_sales_publications d where d.proposal_id=new.predecessor_proposal_id;
  select * into v_version from public.proposal_versions p where p.id=new.proposal_version_id;
  if v_conversion.id is null or v_head.proposal_id is distinct from new.predecessor_proposal_id
    or v_parent_pub.id is null or v_version.run_id is distinct from v_conversion.run_id
    or new.source_binding->'proposal'->>'id' is distinct from new.proposal_version_id
    or new.proposal_version_id is not distinct from v_parent_pub.source_binding->'proposal'->>'id' then
    raise exception 'Revision must be a new commercial version of the current published scanner lineage' using errcode='40001';
  end if;
  return new;
end $$;
create trigger scanner_sales_revision_insert_guard before insert on public.scanner_sales_proposal_revisions
  for each row execute function public.bl_guard_scanner_sales_revision_insert();

create function public.bl_guard_scanner_revision_publication()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_revision public.scanner_sales_proposal_revisions%rowtype; v_conversion public.scanner_sales_conversions%rowtype;
  v_proposal public.proposals%rowtype; v_run public.intelligence_runs%rowtype; v_binding jsonb;
begin
  select * into v_revision from public.scanner_sales_proposal_revisions r where r.proposal_id=new.proposal_id;
  if v_revision.id is null then return new; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.id=v_revision.conversion_id;
  select * into v_proposal from public.proposals p where p.id=new.proposal_id;
  select * into v_run from public.intelligence_runs r where r.id=v_conversion.run_id;
  v_binding:=public.bl_scanner_sales_current_binding(v_conversion.run_id);
  if v_run.status<>'completed' or v_run.client_id<>v_conversion.client_id
    or v_binding is distinct from v_revision.source_binding
    or not exists(select 1 from public.runtime_events e where e.run_id=v_conversion.run_id
      and e.event_type='runtime.review.approved' and e.payload->'binding'=v_revision.source_binding) then
    raise exception 'Revision requires completed current sources and an exact version-bound approval' using errcode='40001';
  end if;
  if not exists(select 1 from public.proposal_versions p where p.id=v_revision.proposal_version_id
      and p.run_id=v_conversion.run_id and p.envelope->>'status'='draft_ready'
      and p.envelope->>'commercialState'='priced')
    or not exists(select 1 from public.narrative_versions n where n.id=v_revision.narrative_version_id
      and n.run_id=v_conversion.run_id and n.audience='client' and n.envelope->>'status'='ready')
    or not exists(select 1 from public.intelligence_artifacts a where a.run_id=v_conversion.run_id
      and a.kind='internal_intelligence_report' and a.validation_status='valid') then
    raise exception 'Revision package or required client artifacts are incomplete' using errcode='40001';
  end if;
  if v_proposal.currency<>'USD' or v_proposal.valid_until is null or v_proposal.valid_until<current_date
    or v_proposal.deposit<>0
    or v_revision.client_safe_snapshot->'pricing'->>'currency' is distinct from v_proposal.currency
    or (v_revision.client_safe_snapshot->'pricing'->>'validUntil')::date is distinct from v_proposal.valid_until
    or (v_revision.client_safe_snapshot->'pricing'->>'discountMinor')::bigint is distinct from v_proposal.discount_minor
    or (v_revision.client_safe_snapshot->'pricing'->>'subtotalOneTimeMinor')::bigint is distinct from v_proposal.subtotal
    or (v_revision.client_safe_snapshot->'pricing'->>'totalOneTimeMinor')::bigint is distinct from v_proposal.total
    or v_revision.client_safe_snapshot->'proposal'->'scope' is distinct from v_proposal.line_items then
    raise exception 'Revision publication terms do not match the immutable client snapshot' using errcode='40001';
  end if;
  return new;
end $$;
create trigger scanner_sales_revision_publication_guard before insert on public.scanner_sales_publications
  for each row execute function public.bl_guard_scanner_revision_publication();

create function public.bl_guard_scanner_client_response()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_publication public.scanner_sales_publications%rowtype; v_checksum text; v_conversion public.scanner_sales_conversions%rowtype;
begin
  select * into v_publication from public.scanner_sales_publications d where d.proposal_id=new.proposal_id;
  select * into v_conversion from public.scanner_sales_conversions c where c.id=new.conversion_id;
  if v_publication.id is null or v_publication.conversion_id<>new.conversion_id or v_publication.client_id<>new.client_id
    or new.proposal_version_id is distinct from v_publication.source_binding->'proposal'->>'id'
    or new.snapshot is distinct from v_publication.client_safe_snapshot or new.source_binding is distinct from v_publication.source_binding then
    raise exception 'Client response must bind the exact immutable published snapshot' using errcode='40001';
  end if;
  v_checksum:=encode(digest(convert_to(v_publication.client_safe_snapshot::text,'UTF8'),'sha256'),'hex');
  if new.snapshot_checksum is distinct from v_checksum
    or not exists(select 1 from public.runtime_events e where e.run_id=v_conversion.run_id
      and e.event_type='runtime.review.approved' and e.payload->'binding'=v_publication.source_binding) then
    raise exception 'Client response requires the published snapshot and its version-bound approval' using errcode='40001';
  end if;
  if new.response_kind='accepted' and ((new.snapshot->'pricing'->>'validUntil')::date<current_date
    or new.snapshot->'pricing'->>'currency'<>'USD') then
    raise exception 'Expired or unsupported published offer cannot be accepted' using errcode='40001';
  end if;
  return new;
end $$;
create trigger scanner_sales_client_response_guard before insert on public.scanner_sales_client_responses
  for each row execute function public.bl_guard_scanner_client_response();

create or replace function public.bl_client_scanner_proposal_contents()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_auth uuid:=auth.uid(); v_claim_client text:=nullif(auth.jwt()->'app_metadata'->>'client_id','');
  v_claim_role text:=auth.jwt()->'app_metadata'->>'role'; v_user public.users%rowtype;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_claim_role not in ('client_admin','client_member') then raise exception using errcode='42501',message='Authenticated client account required'; end if;
  select * into v_user from public.users u where u.auth_user_id=v_auth and u.client_id=v_claim_client and u.role::text=v_claim_role and u.status='active';
  if not found then raise exception using errcode='42501',message='Client identity is unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('proposalId',p.id,'snapshot',d.client_safe_snapshot,'depositMinor',p.deposit,
    'snapshotChecksum',encode(digest(convert_to(d.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
    'isCurrent',h.proposal_id=p.id,'superseded',h.proposal_id is distinct from p.id) order by d.published_at desc)
    from public.scanner_sales_publications d join public.proposals p on p.id=d.proposal_id
    left join public.scanner_sales_offer_heads h on h.conversion_id=d.conversion_id
    where d.client_id=v_user.client_id and p.client_id=v_user.client_id
      and p.status in ('sent','viewed','accepted','change_requested','revised','expired')), '[]'::jsonb);
end $$;

-- Recreate the client response RPC with accepted-state replay. The current-offer
-- lock plus unique response index makes concurrent accepts converge on one row.
create or replace function public.bl_client_scanner_proposal_response(
  p_proposal_id text,p_action text,p_expected_snapshot_checksum text,p_note text default ''
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_client text; v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype; v_publication public.scanner_sales_publications%rowtype;
  v_proposal public.proposals%rowtype; v_head public.scanner_sales_offer_heads%rowtype;
  v_version text; v_checksum text; v_response public.scanner_sales_client_responses%rowtype;
  v_now timestamptz:=now(); v_to text;
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
  if v_publication.id is null or v_head.proposal_id<>p_proposal_id or v_proposal.status not in ('sent','viewed','change_requested','accepted') then
    raise exception using errcode='40001',message='Only the current published offer can receive a response';
  end if;
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
  select * into v_response from public.scanner_sales_client_responses e where e.proposal_id=p_proposal_id
    and e.response_kind=case when p_action='accept' then 'accepted' else 'change_requested' end;
  if found then return jsonb_build_object('ok',true,'replayed',true,'status',case when p_action='accept' then 'accepted' else 'change_requested' end); end if;
  if p_action='accept' then
    if v_proposal.status='accepted' or exists(select 1 from public.scanner_sales_client_responses e where e.proposal_id=p_proposal_id and e.response_kind='change_requested') then
      raise exception using errcode='40001',message='This offer cannot be accepted in its current state';
    end if;
    v_to:='accepted';
  else
    if v_proposal.status='accepted' then raise exception using errcode='40001',message='An accepted offer cannot receive a change request'; end if;
    if length(trim(coalesce(p_note,'')))<5 or length(p_note)>2000 then raise exception using errcode='22023',message='Please describe the requested change (5 to 2000 characters)'; end if;
    v_to:='change_requested';
  end if;
  if not exists(select 1 from public.state_transitions st where st.machine='proposal' and st.from_state=v_proposal.status::text and st.to_state=v_to) then
    raise exception using errcode='23514',message='Proposal cannot move to the requested response state';
  end if;
  insert into public.scanner_sales_client_responses(id,conversion_id,proposal_id,client_id,actor_user_id,response_kind,proposal_version_id,snapshot_checksum,snapshot,source_binding,note,created_at)
    values('scr_'||replace(gen_random_uuid()::text,'-',''),v_conversion.id,p_proposal_id,v_client,v_actor,v_to,v_version,v_checksum,v_publication.client_safe_snapshot,v_publication.source_binding,coalesce(trim(p_note),''),v_now);
  insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
    values('proposal','proposals',p_proposal_id,v_proposal.status::text,v_to,v_actor,case when p_action='accept' then 'client accepted published snapshot' else 'client requested changes' end,v_now);
  update public.proposals set status=v_to::public.proposal_status,decided_at=v_now,change_note=case when p_action='change' then trim(p_note) else change_note end where id=p_proposal_id;
  return jsonb_build_object('ok',true,'replayed',false,'status',v_to,'proposalId',p_proposal_id,'snapshotChecksum',v_checksum);
end $$;

-- Resolve admin history without granting direct reads to client sessions.
create or replace function public.bl_scanner_sales_revision_context(p_proposal_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_conversion public.scanner_sales_conversions%rowtype;
  v_revision public.scanner_sales_proposal_revisions%rowtype; v_head public.scanner_sales_offer_heads%rowtype;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_role not in ('owner','admin','team_member') then raise exception using errcode='42501',message='Internal role required'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.proposal_id=p_proposal_id;
  select * into v_revision from public.scanner_sales_proposal_revisions r where r.proposal_id=p_proposal_id;
  if v_conversion.id is null and v_revision.id is not null then select * into v_conversion from public.scanner_sales_conversions c where c.id=v_revision.conversion_id; end if;
  if v_conversion.id is null then return jsonb_build_object('isScannerProposal',false); end if;
  select * into v_head from public.scanner_sales_offer_heads h where h.conversion_id=v_conversion.id;
  return jsonb_build_object('isScannerProposal',true,'conversionId',v_conversion.id,'runId',v_conversion.run_id,
    'headProposalId',v_head.proposal_id,'predecessorProposalId',v_revision.predecessor_proposal_id,'isCurrent',v_head.proposal_id=p_proposal_id,
    'history',coalesce((select jsonb_agg(jsonb_build_object('proposalId',p.id,'status',p.status,'predecessorProposalId',r.predecessor_proposal_id,
      'createdAt',coalesce(r.created_at,d.published_at),'publishedAt',d.published_at,'current',h.proposal_id=p.id,
      'response',coalesce((select jsonb_agg(jsonb_build_object('kind',e.response_kind,'note',e.note,'createdAt',e.created_at,'actorId',e.actor_user_id) order by e.created_at)
        from public.scanner_sales_client_responses e where e.proposal_id=p.id),'[]'::jsonb)) order by coalesce(r.created_at,d.published_at))
      from public.scanner_sales_publications d join public.proposals p on p.id=d.proposal_id
      left join public.scanner_sales_proposal_revisions r on r.proposal_id=p.id
      left join public.scanner_sales_offer_heads h on h.conversion_id=d.conversion_id where d.conversion_id=v_conversion.id),'[]'::jsonb));
end $$;

create function public.bl_scanner_sales_revision_preview(p_proposal_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_revision public.scanner_sales_proposal_revisions%rowtype;
  v_conversion public.scanner_sales_conversions%rowtype; v_proposal public.proposals%rowtype; v_head public.scanner_sales_offer_heads%rowtype;
  v_client public.clients%rowtype; v_binding jsonb; v_review public.runtime_events%rowtype; v_recipients jsonb; v_reason text;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_role not in ('owner','admin') then raise exception using errcode='42501',message='Owner or admin authorization required'; end if;
  select * into v_revision from public.scanner_sales_proposal_revisions r where r.proposal_id=p_proposal_id;
  if v_revision.id is null then raise exception using errcode='22023',message='Proposal is not a commercial revision'; end if;
  select * into v_conversion from public.scanner_sales_conversions c where c.id=v_revision.conversion_id;
  select * into v_proposal from public.proposals p where p.id=p_proposal_id;
  select * into v_head from public.scanner_sales_offer_heads h where h.conversion_id=v_conversion.id;
  select * into v_client from public.clients c where c.id=v_conversion.client_id;
  v_binding:=public.bl_scanner_sales_current_binding(v_conversion.run_id);
  select * into v_review from public.runtime_events e where e.run_id=v_conversion.run_id and e.aggregate_type='intelligence_run'
    and e.aggregate_id=v_conversion.run_id and e.event_type in ('runtime.review.approved','runtime.review.rejected','runtime.review.revision_requested') order by e.sequence desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'email',u.email) order by u.email),'[]'::jsonb) into v_recipients
    from public.users u join auth.users au on au.id=u.auth_user_id where u.client_id=v_conversion.client_id and u.role in ('client_admin','client_member') and u.status='active' and au.email_confirmed_at is not null;
  if v_head.proposal_id is distinct from v_revision.predecessor_proposal_id then v_reason:='This revision is not based on the current offer.';
  elsif v_binding is distinct from v_revision.source_binding or v_review.event_type<>'runtime.review.approved' or v_review.payload->'binding' is distinct from v_binding then v_reason:='Fresh approval for the current commercial version is required.';
  elsif v_client.lifecycle not in ('member','client_active','post_launch','renewed') then v_reason:='The client account has not completed onboarding.';
  elsif jsonb_array_length(v_recipients)=0 then v_reason:='No active authenticated portal recipient is linked to this client.';
  elsif v_proposal.currency<>'USD' then v_reason:='Only USD proposals can be published until invoice currency support is available.';
  elsif v_proposal.valid_until is null or v_proposal.valid_until<current_date then v_reason:='Commercial terms are missing an expiry or have expired.';
  elsif v_proposal.status<>'draft' then v_reason:='This proposal is no longer a private draft.';
  end if;
  return jsonb_build_object('proposalId',v_proposal.id,'clientId',v_conversion.client_id,'company',v_client.company,'status',v_proposal.status,
    'currency',v_proposal.currency,'subtotalMinor',v_proposal.subtotal,'discountMinor',v_proposal.discount_minor,'totalMinor',v_proposal.total,
    'depositMinor',v_proposal.deposit,'validUntil',v_proposal.valid_until,'lineItems',v_proposal.line_items,'recipients',v_recipients,
    'eligible',v_reason is null,'reason',v_reason,'published',exists(select 1 from public.scanner_sales_publications d where d.proposal_id=p_proposal_id),
    'isCurrent',v_head.proposal_id=p_proposal_id,'predecessorProposalId',v_revision.predecessor_proposal_id,
    'snapshotChecksum',encode(digest(convert_to(v_revision.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'));
end $$;

revoke all on function public.bl_guard_scanner_sales_revision_insert() from public,anon,authenticated,service_role;
revoke all on function public.bl_guard_scanner_revision_publication() from public,anon,authenticated,service_role;
revoke all on function public.bl_guard_scanner_client_response() from public,anon,authenticated,service_role;
revoke all on function public.bl_scanner_sales_revision_preview(text) from public,anon,service_role;
revoke all on function public.bl_scanner_sales_revision_context(text) from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_contents() from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_response(text,text,text,text) from public,anon,service_role;
grant execute on function public.bl_scanner_sales_revision_preview(text) to authenticated;
grant execute on function public.bl_scanner_sales_revision_context(text) to authenticated;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
grant execute on function public.bl_client_scanner_proposal_response(text,text,text,text) to authenticated;
commit;
