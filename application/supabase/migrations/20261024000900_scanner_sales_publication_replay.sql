-- Preserve original publication diagnostics and make repeated successor publish
-- calls return the immutable publication while it remains the current offer.
begin;

create or replace function public.bl_guard_converted_proposal_terms()
returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if exists(select 1 from public.scanner_sales_conversions c where c.proposal_id=old.id)
    and (new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit or new.total is distinct from old.total or new.currency is distinct from old.currency
      or new.discount_minor is distinct from old.discount_minor or new.valid_until is distinct from old.valid_until) then
    raise exception 'Converted proposal terms are derived from immutable reviewed versions' using errcode='55000';
  end if;
  if exists(select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id=old.id)
    and (new.line_items is distinct from old.line_items or new.subtotal is distinct from old.subtotal
      or new.deposit is distinct from old.deposit or new.total is distinct from old.total or new.currency is distinct from old.currency
      or new.discount_minor is distinct from old.discount_minor or new.valid_until is distinct from old.valid_until) then
    raise exception 'Scanner sales proposal terms are immutable; create a new reviewed proposal revision' using errcode='55000';
  end if;
  if new.status='sent' and new.status is distinct from old.status
    and (exists(select 1 from public.scanner_sales_conversions c where c.proposal_id=old.id)
      or exists(select 1 from public.scanner_sales_proposal_revisions r where r.proposal_id=old.id))
    and not (old.status='draft' and exists(select 1 from public.scanner_sales_publications d where d.proposal_id=old.id and d.client_id=old.client_id)) then
    raise exception 'Scanner sales offers require the authorized publication operation' using errcode='42501';
  end if;
  return new;
end $$;

create or replace function public.bl_publish_scanner_sales_proposal(
  p_proposal_id text,p_expected_client_id text,p_recipient_user_id text,p_expected_currency text,
  p_expected_total_minor bigint,p_expected_valid_until date
) returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_auth uuid:=auth.uid(); v_role text:=auth.jwt()->'app_metadata'->>'role'; v_actor text;
  v_conversion public.scanner_sales_conversions%rowtype; v_revision public.scanner_sales_proposal_revisions%rowtype;
  v_publication public.scanner_sales_publications%rowtype; v_head public.scanner_sales_offer_heads%rowtype;
  v_parent public.proposals%rowtype; v_parent_publication public.scanner_sales_publications%rowtype;
  v_proposal public.proposals%rowtype; v_recipient public.users%rowtype; v_client public.clients%rowtype;
  v_current_binding jsonb; v_review public.runtime_events%rowtype; v_result jsonb; v_now timestamptz:=now(); v_replayed boolean:=false;
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
  select * into v_client from public.clients c where c.id=v_conversion.client_id for share;
  if v_client.lifecycle not in ('member','client_active','post_launch','renewed') then raise exception using errcode='40001',message='The client account has not completed onboarding.'; end if;
  select u.* into v_recipient from public.users u join auth.users au on au.id=u.auth_user_id
    where u.id=p_recipient_user_id and u.client_id=v_conversion.client_id and u.role in ('client_admin','client_member')
      and u.status='active' and u.auth_user_id is not null and au.email_confirmed_at is not null;
  if not found then raise exception using errcode='40001',message='The selected recipient is not an active authenticated user for this client.'; end if;

  if v_revision.id is null then
    if v_head.proposal_id is not null and v_head.proposal_id<>p_proposal_id then raise exception using errcode='40001',message='This offer has been superseded'; end if;
    v_result:=public.bl_publish_scanner_sales_proposal_original(p_proposal_id,p_expected_client_id,p_recipient_user_id,p_expected_currency,p_expected_total_minor,p_expected_valid_until);
    v_replayed:=coalesce((v_result->>'replayed')::boolean,false);
    select * into v_publication from public.scanner_sales_publications d where d.proposal_id=p_proposal_id;
    if v_publication.id is null then raise exception using errcode='40001',message='Publication did not create an audit record'; end if;
    insert into public.scanner_sales_offer_heads(conversion_id,proposal_id,publication_id,client_id,updated_at)
      values(v_conversion.id,p_proposal_id,v_publication.id,v_conversion.client_id,v_now)
      on conflict(conversion_id) do update set proposal_id=excluded.proposal_id,publication_id=excluded.publication_id,updated_at=excluded.updated_at
      where public.scanner_sales_offer_heads.proposal_id=excluded.proposal_id;
  else
    select * into v_publication from public.scanner_sales_publications d where d.proposal_id=p_proposal_id;
    if found then
      if v_head.proposal_id<>p_proposal_id or v_publication.client_id<>v_conversion.client_id
        or v_publication.recipient_user_id<>p_recipient_user_id or v_publication.source_binding is distinct from v_revision.source_binding then
        raise exception using errcode='40001',message='Revision was already published with different terms or is no longer current';
      end if;
      v_replayed:=true;
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
          v_parent_publication.source_binding->'proposal'->>'id',encode(extensions.digest(convert_to(v_parent_publication.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
          v_parent_publication.client_safe_snapshot,v_parent_publication.source_binding,'Superseded by '||p_proposal_id,v_now);
      update public.proposals set status='revised' where id=v_parent.id;
      insert into public.transition_log(machine,entity_type,entity_id,from_state,to_state,actor_id,reason,at)
        values('proposal','proposals',p_proposal_id,'draft','sent',v_actor,'portal publication',v_now);
      update public.proposals set status='sent',sent_at=v_now where id=p_proposal_id;
      update public.scanner_sales_offer_heads set proposal_id=p_proposal_id,publication_id=v_publication.id,updated_at=v_now where conversion_id=v_conversion.id;
    end if;
  end if;
  return jsonb_build_object('published',true,'replayed',v_replayed,'proposalId',p_proposal_id,'clientId',v_conversion.client_id,
    'recipientUserId',v_recipient.id,'recipientName',v_recipient.name,'recipientEmail',v_recipient.email,'publishedAt',v_publication.published_at);
end $$;

revoke all on function public.bl_guard_converted_proposal_terms() from public,anon,authenticated,service_role;
revoke all on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) from public,anon,service_role;
grant execute on function public.bl_publish_scanner_sales_proposal(text,text,text,text,bigint,date) to authenticated;
commit;
