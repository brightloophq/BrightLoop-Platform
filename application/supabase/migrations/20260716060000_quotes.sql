-- =============================================================================
-- 0017 — Quote engine (Sprint 5C). The binding offer a strategist builds inside
-- a discovery conversation, then sends to the client for accept / reject /
-- revise, and finally converts to a proposal.
--
-- THE DRAFT-QUOTE GATE (the load-bearing security invariant):
--   "The client should only see a quote after a BrightLoop administrator
--    explicitly sends it." / "Clients must never see draft quotes or internal
--    pricing calculations."
--   => A client may read a quote ONLY when it participates in the conversation
--      AND the quote's status is NOT in ('draft','internal_review'). Draft and
--      internal-review quotes are invisible to the client the same way internal
--      notes are — there is simply no policy that returns them.
--
-- Internal pricing rationale lives in quote_revisions, which has NO client
-- policy at all (internal-only, like internal_notes).
--
-- Client status changes (accept/reject/request-revision/mark-viewed) do NOT get
-- a broad UPDATE policy — that would let a signed-in client edit pricing columns
-- on their own quote (the documented column-level limitation of 0010). Instead
-- they go through bl_client_quote_action(), a SECURITY DEFINER RPC that only ever
-- touches `status`, checks participation + role + legal move, and audits. This is
-- the tighter fix 0010 deferred, applied here because a quote carries money.
-- =============================================================================

create type public.quote_status as enum (
  'draft', 'internal_review', 'sent', 'viewed',
  'revision_requested', 'revised', 'accepted', 'rejected', 'expired', 'converted'
);

-- ---- quotes -----------------------------------------------------------------
create table public.quotes (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  client_id       text not null references public.clients (id) on delete cascade,
  title           text not null default 'Proposal quote',
  status          public.quote_status not null default 'draft',
  currency        text not null default 'USD',
  subtotal        bigint not null default 0,   -- cents
  discount        bigint not null default 0,   -- cents
  total           bigint not null default 0,   -- cents
  client_note     text not null default '',    -- shown to the client with the quote
  valid_until     date,
  sent_at         timestamptz,
  decided_at      timestamptz,
  proposal_id     text,                          -- set when converted
  created_by      text references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index quotes_conversation_idx on public.quotes (conversation_id);
create index quotes_client_idx on public.quotes (client_id);

-- ---- line items (client-facing once the quote is sent) ----------------------
create table public.quote_items (
  id          text primary key,
  quote_id    text not null references public.quotes (id) on delete cascade,
  label       text not null,
  description text not null default '',
  module_id   text,                      -- optional link to the service catalog
  quantity    integer not null default 1,
  unit_amount bigint not null default 0, -- cents
  amount      bigint not null default 0, -- cents (quantity * unit_amount)
  sort        integer not null default 0
);
create index quote_items_quote_idx on public.quote_items (quote_id, sort);

-- ---- revisions / internal rationale (NEVER client-visible) ------------------
create table public.quote_revisions (
  id            text primary key,
  quote_id      text not null references public.quotes (id) on delete cascade,
  version       integer not null default 1,
  snapshot      jsonb not null default '{}'::jsonb,  -- items + totals at this version
  internal_note text not null default '',            -- why priced this way — internal only
  author_id     text references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index quote_revisions_quote_idx on public.quote_revisions (quote_id, version);

-- =============================================================================
-- State machine: mirror the `quote` machine into state_transitions + attach the
-- shared transition guard so illegal moves are rejected at the DB, even for the
-- service-role key.
-- =============================================================================
insert into public.state_transitions (machine, from_state, to_state) values
  ('quote', 'draft', 'internal_review'),
  ('quote', 'draft', 'sent'),
  ('quote', 'internal_review', 'sent'),
  ('quote', 'internal_review', 'draft'),
  ('quote', 'sent', 'viewed'),
  ('quote', 'sent', 'accepted'),
  ('quote', 'sent', 'rejected'),
  ('quote', 'sent', 'expired'),
  ('quote', 'viewed', 'accepted'),
  ('quote', 'viewed', 'rejected'),
  ('quote', 'viewed', 'revision_requested'),
  ('quote', 'viewed', 'expired'),
  ('quote', 'revision_requested', 'revised'),
  ('quote', 'revised', 'internal_review'),
  ('quote', 'revised', 'sent'),
  ('quote', 'accepted', 'converted'),
  ('quote', 'rejected', 'revised'),
  ('quote', 'expired', 'revised');

create trigger quotes_transition_guard
  before update on public.quotes
  for each row execute function public.bl_assert_transition('quote', 'status');

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.quotes          enable row level security;
alter table public.quote_items     enable row level security;
alter table public.quote_revisions enable row level security;

-- ---- quotes: DRAFT-QUOTE GATE ----------------------------------------------
create policy "quotes_read" on public.quotes
  for select to authenticated
  using (
    public.bl_is_internal()
    or (
      public.bl_in_conversation(conversation_id)
      and status not in ('draft', 'internal_review')
    )
  );

create policy "quotes_write_internal" on public.quotes
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- ---- quote_items: visible only when the parent quote is visible -------------
create policy "quote_items_read" on public.quote_items
  for select to authenticated
  using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and (
          public.bl_is_internal()
          or (public.bl_in_conversation(q.conversation_id) and q.status not in ('draft', 'internal_review'))
        )
    )
  );

create policy "quote_items_write_internal" on public.quote_items
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- ---- quote_revisions: internal-only (holds internal pricing rationale) ------
create policy "quote_revisions_internal_all" on public.quote_revisions
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Client action RPC — the ONLY client write path to a quote. SECURITY DEFINER,
-- touches `status` only, and enforces every rule itself:
--   * caller must be a client_admin who participates in the quote's conversation
--   * the quote must belong to the caller's own org
--   * only sent/viewed quotes are actionable; the target move must be legal
--   * a 'view' just records sent → viewed (idempotent-ish; no-op once past sent)
-- Writes transition_log (audit) then updates status, atomically in one function.
-- =============================================================================
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
  v_to        public.quote_status;
begin
  select u.id, u.client_id into v_user_id, v_client_id
  from public.users u where u.auth_user_id = auth.uid();

  if v_user_id is null then raise exception 'No user' using errcode = '42501'; end if;
  if public.bl_role() <> 'client_admin' then
    raise exception 'Only a client admin may act on a quote' using errcode = '42501';
  end if;

  select q.status, q.conversation_id, q.client_id into v_from, v_conv, v_qclient
  from public.quotes q where q.id = p_quote_id;

  if v_from is null then raise exception 'Quote not found' using errcode = 'P0002'; end if;
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

  -- 'view' is only meaningful from 'sent'; once past that it's a no-op success.
  if p_action = 'view' and v_from <> 'sent' then
    return v_from;
  end if;

  -- Legal-move check (mirrors the trigger; done here so we can audit first).
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

-- Realtime: clients should see status flips (e.g. a strategist sending a quote)
-- appear live in their thread. RLS still gates the row — a draft never streams.
alter publication supabase_realtime add table public.quotes;

comment on function public.bl_client_quote_action(text, text) is
  'Only client write path to a quote. SECURITY DEFINER, status-only, audited; enforces participant + own-org + legal move.';
comment on policy "quotes_read" on public.quotes is
  'DRAFT-QUOTE GATE: a client sees a quote only once it is sent (status not in draft/internal_review) and they are in the conversation.';
