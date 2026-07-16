-- =============================================================================
-- 0013 — Business Discovery Chat: conversations, messages, attachments, notes.
--
-- A real-time human consulting workspace between a prospect (member-stage
-- client_admin) and the BrightLoop team. Distinct from the thin `messages`
-- table (kept for the portal thread stub) — this is the richer conversation
-- model with participants, reads, attachments, internal notes and assignment.
--
-- THREE RLS GATES (all proven patterns from earlier sprints):
--   1. MEMBERSHIP — a client sees a conversation only if they participate.
--   2. INTERNAL NOTES — internal-only; NO client policy exists (default deny).
--   3. (quotes gate lands in 5C.)
-- =============================================================================

create type public.conversation_state as enum ('open', 'awaiting_client', 'awaiting_admin', 'closed');

-- ---- conversations ----------------------------------------------------------
create table public.conversations (
  id               text primary key,
  client_id        text not null references public.clients (id) on delete cascade,
  assessment_id    text references public.assessments (id) on delete set null,
  configuration_id text references public.configurations (id) on delete set null,
  subject          text not null default 'Business discovery',
  state            public.conversation_state not null default 'open',
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);
create index conversations_client_idx on public.conversations (client_id);
create index conversations_state_idx on public.conversations (state, last_message_at desc);

-- ---- participants (who can see a conversation) ------------------------------
create table public.conversation_participants (
  conversation_id text not null references public.conversations (id) on delete cascade,
  user_id         text not null references public.users (id) on delete cascade,
  role_in_convo   text not null default 'member',  -- member | admin
  added_at        timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conv_participants_user_idx on public.conversation_participants (user_id);

-- ---- messages ---------------------------------------------------------------
create table public.chat_messages (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  author_id       text not null references public.users (id) on delete cascade,
  body            text not null default '',
  kind            text not null default 'text',    -- text | link | system
  created_at      timestamptz not null default now()
);
create index chat_messages_convo_idx on public.chat_messages (conversation_id, created_at);

-- ---- attachments ------------------------------------------------------------
create table public.message_attachments (
  id           text primary key,
  message_id   text not null references public.chat_messages (id) on delete cascade,
  storage_path text not null,   -- <client_id>/<conversation_id>/<file>
  name         text not null,
  mime         text not null,
  size         bigint not null default 0
);
create index message_attachments_msg_idx on public.message_attachments (message_id);

-- ---- read receipts ----------------------------------------------------------
create table public.message_reads (
  message_id text not null references public.chat_messages (id) on delete cascade,
  user_id    text not null references public.users (id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- ---- internal notes (NEVER visible to clients) ------------------------------
create table public.internal_notes (
  id              text primary key,
  conversation_id text not null references public.conversations (id) on delete cascade,
  author_id       text not null references public.users (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now()
);
create index internal_notes_convo_idx on public.internal_notes (conversation_id, created_at);

-- ---- assignment -------------------------------------------------------------
create table public.conversation_assignments (
  conversation_id  text primary key references public.conversations (id) on delete cascade,
  assignee_user_id text references public.users (id) on delete set null,
  assigned_by      text references public.users (id) on delete set null,
  at               timestamptz not null default now()
);

-- =============================================================================
-- Helper: is the current user a participant in a conversation?
-- SECURITY DEFINER so the membership check doesn't itself trip RLS recursion.
-- =============================================================================
create or replace function public.bl_in_conversation(conv_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    join public.users u on u.id = cp.user_id
    where cp.conversation_id = conv_id
      and u.auth_user_id = auth.uid()
  );
$$;

revoke execute on function public.bl_in_conversation(text) from anon;

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.conversations              enable row level security;
alter table public.conversation_participants  enable row level security;
alter table public.chat_messages               enable row level security;
alter table public.message_attachments         enable row level security;
alter table public.message_reads               enable row level security;
alter table public.internal_notes              enable row level security;
alter table public.conversation_assignments    enable row level security;

-- ---- GATE 1: membership -----------------------------------------------------
create policy "conversations_read" on public.conversations
  for select to authenticated
  using (public.bl_is_internal() or public.bl_in_conversation(id));

create policy "conversations_write_internal" on public.conversations
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "participants_read" on public.conversation_participants
  for select to authenticated
  using (public.bl_is_internal() or public.bl_in_conversation(conversation_id));

create policy "participants_write_internal" on public.conversation_participants
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "chat_messages_read" on public.chat_messages
  for select to authenticated
  using (public.bl_is_internal() or public.bl_in_conversation(conversation_id));

-- A participant may post as themselves into a conversation they're in.
create policy "chat_messages_insert" on public.chat_messages
  for insert to authenticated
  with check (
    public.bl_in_conversation(conversation_id)
    and exists (select 1 from public.users u where u.id = chat_messages.author_id and u.auth_user_id = auth.uid())
  );

create policy "attachments_read" on public.message_attachments
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_attachments.message_id
        and (public.bl_is_internal() or public.bl_in_conversation(m.conversation_id))
    )
  );
create policy "attachments_insert" on public.message_attachments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_attachments.message_id and public.bl_in_conversation(m.conversation_id)
    )
  );

create policy "reads_read" on public.message_reads
  for select to authenticated
  using (
    exists (
      select 1 from public.chat_messages m
      where m.id = message_reads.message_id
        and (public.bl_is_internal() or public.bl_in_conversation(m.conversation_id))
    )
  );
-- A user records their OWN reads only.
create policy "reads_insert_own" on public.message_reads
  for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = message_reads.user_id and u.auth_user_id = auth.uid()));

-- ---- GATE 2: internal notes — internal roles only, no client policy --------
create policy "internal_notes_internal_all" on public.internal_notes
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

create policy "assignments_read" on public.conversation_assignments
  for select to authenticated
  using (public.bl_is_internal() or public.bl_in_conversation(conversation_id));
create policy "assignments_write_internal" on public.conversation_assignments
  for all to authenticated
  using (public.bl_is_internal())
  with check (public.bl_is_internal());

-- =============================================================================
-- Realtime — add message + conversation tables to the publication so
-- postgres_changes streams live. RLS is still enforced on the realtime feed
-- (the subscription carries the user's JWT), so a client is never pushed a
-- message from a conversation they don't participate in.
-- =============================================================================
alter publication supabase_realtime add table public.chat_messages;
alter publication supabase_realtime add table public.message_reads;
alter publication supabase_realtime add table public.conversations;

comment on function public.bl_in_conversation(text) is
  'Conversation membership check for RLS. SECURITY DEFINER to avoid RLS recursion on participants.';
