-- Order published offers using the authoritative lineage head, then stable
-- publication and proposal identifiers for deterministic portal display.
begin;

create or replace function public.bl_client_scanner_proposal_contents()
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare
  v_auth uuid:=auth.uid();
  v_claim_client text:=nullif(auth.jwt()->'app_metadata'->>'client_id','');
  v_claim_role text:=auth.jwt()->'app_metadata'->>'role';
  v_user public.users%rowtype;
begin
  if auth.role()<>'authenticated' or v_auth is null or v_claim_role not in ('client_admin','client_member') then
    raise exception using errcode='42501',message='Authenticated client account required';
  end if;
  select * into v_user from public.users u
    where u.auth_user_id=v_auth and u.client_id=v_claim_client and u.role::text=v_claim_role and u.status='active';
  if not found then raise exception using errcode='42501',message='Client identity is unavailable'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'proposalId',p.id,'snapshot',d.client_safe_snapshot,'depositMinor',p.deposit,
      'snapshotChecksum',encode(digest(convert_to(d.client_safe_snapshot::text,'UTF8'),'sha256'),'hex'),
      'isCurrent',h.proposal_id=p.id,'superseded',h.proposal_id is distinct from p.id
    ) order by (h.proposal_id=p.id) desc,d.published_at desc,p.id desc)
    from public.scanner_sales_publications d
    join public.proposals p on p.id=d.proposal_id
    left join public.scanner_sales_offer_heads h on h.conversion_id=d.conversion_id
    where d.client_id=v_user.client_id and p.client_id=v_user.client_id
      and p.status in ('sent','viewed','accepted','change_requested','revised','expired')
  ),'[]'::jsonb);
end $$;

revoke all on function public.bl_client_scanner_proposal_contents() from public,anon,service_role;
grant execute on function public.bl_client_scanner_proposal_contents() to authenticated;
commit;
