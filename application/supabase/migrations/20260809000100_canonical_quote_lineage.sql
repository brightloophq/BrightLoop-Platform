-- =============================================================================
-- Canonical quote lineage + commercial mode.
--
-- Existing quotes remain client-facing legacy quotes. Future scanner promotion
-- will create proposal_only quotes: internal commercial working state pinned to
-- one immutable scanner proposal version and one append-only review event.
-- This migration does not promote a package, price scanner output, or issue a
-- relational proposal.
-- =============================================================================

alter table public.quotes
  alter column client_id drop not null,
  alter column conversation_id drop not null,
  add column commercial_mode text not null default 'legacy_client_quote',
  add column lead_id text references public.leads (id) on delete restrict,
  add column source_run_id text references public.intelligence_runs (id) on delete restrict,
  add column source_proposal_version_id text references public.proposal_versions (id) on delete restrict,
  add column source_review_event_id text references public.runtime_events (id) on delete restrict,
  add column promotion_key text;

alter table public.quotes
  add constraint quotes_commercial_mode_valid check (
    commercial_mode in ('legacy_client_quote', 'proposal_only')
  ),
  add constraint quotes_commercial_ownership_valid check (
    (
      commercial_mode = 'legacy_client_quote'
      and client_id is not null
      and conversation_id is not null
      and lead_id is null
    )
    or
    (
      commercial_mode = 'proposal_only'
      and (client_id is not null or lead_id is not null)
      and source_run_id is not null
      and source_proposal_version_id is not null
      and source_review_event_id is not null
    )
  );

create index quotes_lead_idx on public.quotes (lead_id, created_at desc)
  where lead_id is not null;
create index quotes_source_run_idx on public.quotes (source_run_id)
  where source_run_id is not null;
create unique index quotes_promotion_key_uidx on public.quotes (promotion_key)
  where promotion_key is not null;

comment on column public.quotes.commercial_mode is
  'legacy_client_quote preserves the conversation/client flow; proposal_only is internal commercial working state for later relational-proposal issuance.';
comment on column public.quotes.lead_id is
  'Immutable pre-client origin. A proposal_only quote may later bind client_id once without losing lead provenance.';
comment on column public.quotes.source_run_id is
  'Immutable lineage pointer to the originating intelligence run; populated by a future promotion operation.';
comment on column public.quotes.source_proposal_version_id is
  'Pins the exact immutable scanner proposal version used as source material.';
comment on column public.quotes.source_review_event_id is
  'Pins the exact append-only package review event authorizing future promotion.';
comment on column public.quotes.promotion_key is
  'Optional idempotency key reserved for the future scanner-package promotion operation.';

create or replace function public.bl_quote_lineage_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(
    new.commercial_mode,
    new.lead_id,
    new.source_run_id,
    new.source_proposal_version_id,
    new.source_review_event_id,
    new.promotion_key
  ) is distinct from row(
    old.commercial_mode,
    old.lead_id,
    old.source_run_id,
    old.source_proposal_version_id,
    old.source_review_event_id,
    old.promotion_key
  ) then
    raise exception 'Quote commercial mode and source lineage are immutable'
      using errcode = '23514';
  end if;

  if new.client_id is distinct from old.client_id then
    if not (
      old.commercial_mode = 'proposal_only'
      and old.client_id is null
      and old.lead_id is not null
      and new.client_id is not null
    ) then
      raise exception 'Quote client ownership is immutable after initial binding'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger quotes_lineage_immutable
  before update on public.quotes
  for each row execute function public.bl_quote_lineage_immutable();

alter table public.quote_items
  add column source_work_item_id text,
  add column source_evidence_refs jsonb not null default '[]'::jsonb,
  add column pricing_type text not null default 'one_time',
  add column recurrence_cadence text,
  add column optional boolean not null default false;

alter table public.quote_items
  add constraint quote_items_source_evidence_refs_array check (
    jsonb_typeof(source_evidence_refs) = 'array'
  ),
  add constraint quote_items_pricing_type_valid check (
    pricing_type in ('one_time', 'recurring')
  ),
  add constraint quote_items_recurrence_valid check (
    (pricing_type = 'one_time' and recurrence_cadence is null)
    or
    (pricing_type = 'recurring' and recurrence_cadence in ('weekly', 'monthly', 'quarterly', 'annual'))
  );

comment on column public.quote_items.source_work_item_id is
  'Opaque stable identifier from the pinned scanner proposal snapshot; intentionally not a relational FK.';
comment on column public.quote_items.source_evidence_refs is
  'Opaque evidence identifiers copied from scanner source material for lineage; not pricing truth.';
comment on column public.quote_items.pricing_type is
  'Commercial charge shape owned by the quote item: one_time or recurring.';
comment on column public.quote_items.recurrence_cadence is
  'Required cadence for recurring commercial items; absent for one-time items.';
comment on column public.quote_items.optional is
  'Whether the commercial item is optional in editable quote scope.';

create or replace function public.bl_quote_item_lineage_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if row(new.source_work_item_id, new.source_evidence_refs)
     is distinct from row(old.source_work_item_id, old.source_evidence_refs) then
    raise exception 'Quote item source lineage is immutable'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger quote_items_lineage_immutable
  before update on public.quote_items
  for each row execute function public.bl_quote_item_lineage_immutable();

-- proposal_only is internal even if it carries a client and conversation. Mode,
-- not nullable ownership or status alone, is the authoritative client boundary.
drop policy if exists "quotes_read" on public.quotes;
create policy "quotes_read" on public.quotes
  for select to authenticated
  using (
    public.bl_is_internal()
    or (
      commercial_mode = 'legacy_client_quote'
      and public.bl_in_conversation(conversation_id)
      and status not in ('draft', 'internal_review')
    )
  );

drop policy if exists "quote_items_read" on public.quote_items;
create policy "quote_items_read" on public.quote_items
  for select to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and (
          public.bl_is_internal()
          or (
            q.commercial_mode = 'legacy_client_quote'
            and public.bl_in_conversation(q.conversation_id)
            and q.status not in ('draft', 'internal_review')
          )
        )
    )
  );

create or replace function public.bl_client_quote_action(p_quote_id text, p_action text)
returns public.quote_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   text;
  v_client_id text;
  v_from      public.quote_status;
  v_conv      text;
  v_qclient   text;
  v_mode      text;
  v_to        public.quote_status;
begin
  select u.id, u.client_id into v_user_id, v_client_id
  from public.users u where u.auth_user_id = auth.uid();

  if v_user_id is null then raise exception 'No user' using errcode = '42501'; end if;
  if public.bl_role() <> 'client_admin' then
    raise exception 'Only a client admin may act on a quote' using errcode = '42501';
  end if;

  select q.status, q.conversation_id, q.client_id, q.commercial_mode
    into v_from, v_conv, v_qclient, v_mode
  from public.quotes q where q.id = p_quote_id;

  if v_from is null then raise exception 'Quote not found' using errcode = 'P0002'; end if;
  if v_mode <> 'legacy_client_quote' then
    raise exception 'Quote is not client actionable' using errcode = '42501';
  end if;
  if v_qclient <> v_client_id or not public.bl_in_conversation(v_conv) then
    raise exception 'Not your conversation' using errcode = '42501';
  end if;

  v_to := case p_action
    when 'view'   then 'viewed'
    when 'accept' then 'accepted'
    when 'reject' then 'rejected'
    when 'revise' then 'revision_requested'
    else null
  end;
  if v_to is null then raise exception 'Unknown action %', p_action using errcode = '22023'; end if;

  if p_action = 'view' and v_from <> 'sent' then
    return v_from;
  end if;

  if not exists (
    select 1 from public.state_transitions st
    where st.machine = 'quote' and st.from_state = v_from::text and st.to_state = v_to::text
  ) then
    raise exception 'Illegal quote move % -> %', v_from, v_to using errcode = '23514';
  end if;

  insert into public.transition_log (machine, entity_type, entity_id, from_state, to_state, actor_id, reason, at)
  values ('quote', 'quotes', p_quote_id, v_from::text, v_to::text, v_user_id, 'client ' || p_action, now());

  update public.quotes
     set status = v_to,
         decided_at = case when p_action in ('accept', 'reject') then now() else decided_at end,
         updated_at = now()
   where id = p_quote_id;

  return v_to;
end;
$$;

revoke execute on function public.bl_client_quote_action(text, text) from anon;

comment on function public.bl_client_quote_action(text, text) is
  'Client status action for legacy_client_quote only. proposal_only quotes remain internal regardless of client, conversation, or status.';
comment on policy "quotes_read" on public.quotes is
  'Clients read only sent-or-later legacy_client_quote rows in their conversations; proposal_only is always internal.';
