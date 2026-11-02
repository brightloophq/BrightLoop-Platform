-- Sprint 1H: client-facing immutable response boundary, including acceptance
-- replay and snapshot metadata for portal confirmations.
begin;

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
    or (v_publication.client_safe_snapshot->'pricing'->>'discountMinor')::bigint<>v_proposal.discount_minor
    or (v_publication.client_safe_snapshot->'pricing'->>'subtotalOneTimeMinor')::bigint<>v_proposal.subtotal
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

revoke all on function public.bl_client_scanner_proposal_contents() from public,anon,service_role;
revoke all on function public.bl_client_scanner_proposal_response(text,text,text,text) from public,anon,service_role;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
grant execute on function public.bl_client_scanner_proposal_response(text,text,text,text) to authenticated;
commit;
