-- =============================================================================
-- 0018 — Sales & activation spine (Sprint 6). Closes the loop:
--   proposal (sent) → client accepts → contract signed + countersigned →
--   deposit invoice paid → member becomes client_active.
--
-- TWO THINGS THIS FIXES / ADDS:
--
-- 1. PRE-SEND VISIBILITY GATE (the same lesson as the draft-quote gate).
--    proposals/contracts/invoices were readable by the owning client REGARDLESS
--    of status. But a proposal is born `draft` (e.g. from a quote conversion), a
--    contract `pending`, an invoice `draft` — none of which the client should see
--    until BrightLoop sends it. We retighten each client read policy to hide the
--    pre-send state. Internal roles still see everything.
--
-- 2. CLIENT ACTION RPCs. Like quotes, proposals/contracts carry money, so the
--    client never gets a broad UPDATE policy (which can't restrict columns).
--    accept / request-changes / sign go through SECURITY DEFINER RPCs that touch
--    only status (+ signature/notes), check participation + own-org + legal move,
--    and audit. Countersign + payment truth stay server-side (internal/webhook).
--
-- 3. ACTIVATION. member → client_active is gated on BOTH an active contract AND a
--    paid deposit invoice, done atomically in bl_activate_client (audited). The
--    payment webhook calls it; it is a no-op until both conditions hold.
-- =============================================================================

-- ---- 1. retighten client read gates ----------------------------------------
drop policy if exists "proposals_select" on public.proposals;
create policy "proposals_select" on public.proposals
  for select to authenticated
  using (public.bl_is_internal() or (client_id = public.bl_client_id() and status <> 'draft'));

drop policy if exists "contracts_select" on public.contracts;
create policy "contracts_select" on public.contracts
  for select to authenticated
  using (public.bl_is_internal() or (client_id = public.bl_client_id() and status <> 'pending'));

drop policy if exists "invoices_select" on public.invoices;
create policy "invoices_select" on public.invoices
  for select to authenticated
  using (public.bl_is_finance() or (client_id = public.bl_client_id() and status <> 'draft'));

-- ---- 2a. client proposal action --------------------------------------------
create or replace function public.bl_client_proposal_action(p_proposal_id text, p_action text, p_note text default '')
returns public.proposal_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text; v_client_id text; v_from public.proposal_status; v_pclient text; v_to public.proposal_status;
begin
  select u.id, u.client_id into v_user_id, v_client_id from public.users u where u.auth_user_id = auth.uid();
  if v_user_id is null then raise exception 'No user' using errcode = '42501'; end if;
  if public.bl_role() <> 'client_admin' then raise exception 'Only a client admin may act on a proposal' using errcode = '42501'; end if;

  select p.status, p.client_id into v_from, v_pclient from public.proposals p where p.id = p_proposal_id;
  if v_from is null then raise exception 'Proposal not found' using errcode = 'P0002'; end if;
  if v_pclient <> v_client_id then raise exception 'Not your proposal' using errcode = '42501'; end if;

  v_to := case p_action
    when 'view'   then 'viewed'
    when 'accept' then 'accepted'
    when 'change' then 'change_requested'
    else null end;
  if v_to is null then raise exception 'Unknown action %', p_action using errcode = '22023'; end if;
  if p_action = 'view' and v_from <> 'sent' then return v_from; end if;

  if not exists (select 1 from public.state_transitions st where st.machine = 'proposal' and st.from_state = v_from::text and st.to_state = v_to::text) then
    raise exception 'Illegal proposal move % -> %', v_from, v_to using errcode = '23514';
  end if;

  insert into public.transition_log (machine, entity_type, entity_id, from_state, to_state, actor_id, reason, at)
  values ('proposal', 'proposals', p_proposal_id, v_from::text, v_to::text, v_user_id, 'client ' || p_action, now());

  update public.proposals
     set status = v_to,
         viewed_at = case when p_action = 'view' then now() else viewed_at end,
         decided_at = case when p_action in ('accept', 'change') then now() else decided_at end,
         change_note = case when p_action = 'change' then nullif(p_note, '') else change_note end
   where id = p_proposal_id;
  return v_to;
end;
$$;
revoke execute on function public.bl_client_proposal_action(text, text, text) from anon;

-- ---- 2b. client contract signature -----------------------------------------
create or replace function public.bl_client_contract_sign(p_contract_id text, p_signature text)
returns public.contract_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id text; v_client_id text; v_from public.contract_status; v_cclient text;
begin
  select u.id, u.client_id into v_user_id, v_client_id from public.users u where u.auth_user_id = auth.uid();
  if v_user_id is null then raise exception 'No user' using errcode = '42501'; end if;
  if public.bl_role() <> 'client_admin' then raise exception 'Only a client admin may sign' using errcode = '42501'; end if;
  if length(coalesce(trim(p_signature), '')) = 0 then raise exception 'Signature required' using errcode = '22023'; end if;

  select c.status, c.client_id into v_from, v_cclient from public.contracts c where c.id = p_contract_id;
  if v_from is null then raise exception 'Contract not found' using errcode = 'P0002'; end if;
  if v_cclient <> v_client_id then raise exception 'Not your contract' using errcode = '42501'; end if;
  if v_from <> 'sent' then raise exception 'Contract is not awaiting your signature' using errcode = '23514'; end if;

  insert into public.transition_log (machine, entity_type, entity_id, from_state, to_state, actor_id, reason, at)
  values ('contract', 'contracts', p_contract_id, 'sent', 'signed_client', v_user_id, 'client signed', now());

  update public.contracts
     set status = 'signed_client', client_signature = trim(p_signature), signed_at = now()
   where id = p_contract_id;
  return 'signed_client';
end;
$$;
revoke execute on function public.bl_client_contract_sign(text, text) from anon;

-- ---- 3. activation ---------------------------------------------------------
-- Eligibility: an ACTIVE contract AND a PAID deposit invoice for the client.
create or replace function public.bl_can_activate(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from public.contracts c where c.client_id = p_client_id and c.status = 'active')
    and exists (select 1 from public.invoices i where i.client_id = p_client_id and i.type = 'deposit' and i.status = 'paid');
$$;

-- Atomic, audited member → client_active. No-op unless the client is `member`
-- AND bl_can_activate holds. Returns true only when it actually activated.
create or replace function public.bl_activate_client(p_client_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_life text;
begin
  select lifecycle into v_life from public.clients where id = p_client_id;
  if v_life is null then return false; end if;
  if v_life = 'client_active' then return false; end if;      -- already active
  if v_life <> 'member' then return false; end if;            -- only member → active
  if not public.bl_can_activate(p_client_id) then return false; end if;

  insert into public.transition_log (machine, entity_type, entity_id, from_state, to_state, actor_id, reason, at)
  values ('clientLifecycle', 'clients', p_client_id, 'member', 'client_active', null, 'contract active + deposit paid', now());

  update public.clients set lifecycle = 'client_active' where id = p_client_id;
  return true;
end;
$$;
revoke execute on function public.bl_activate_client(text) from anon;
revoke execute on function public.bl_can_activate(text) from anon;

comment on function public.bl_client_proposal_action(text, text, text) is
  'Only client write path to a proposal. SECURITY DEFINER, status-only, audited; participant own-org + legal move.';
comment on function public.bl_client_contract_sign(text, text) is
  'Only client signature path. SECURITY DEFINER; sent → signed_client, records client_signature, audited.';
comment on function public.bl_activate_client(text) is
  'Atomic member → client_active, gated on active contract + paid deposit. Called by the payment webhook.';
