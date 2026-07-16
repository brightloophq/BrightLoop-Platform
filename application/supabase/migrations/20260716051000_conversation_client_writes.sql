-- =============================================================================
-- 0015 — Let a CLIENT open and drive their own discovery conversation.
--
-- 0013 made conversations/participants writable by internal roles only. But the
-- prospect is the one who STARTS the chat, from their logged-in session — so the
-- session client (subject to RLS) must be able to:
--   1. create a conversation scoped to their OWN org, and
--   2. add THEMSELVES as a participant.
-- Without these, startConversation() would be refused by RLS.
--
-- The conversation's `last_message_at` / `state` bump is intentionally NOT a
-- client-writable column. It moves into an AFTER INSERT trigger on chat_messages
-- (SECURITY DEFINER, RLS-exempt) so both sides get a correct, atomic update
-- without either being able to forge conversation state directly.
--
-- Scope is still tight: a client may only ever touch rows for bl_client_id(),
-- and may only add a participant row that resolves to their own user. Reading
-- other orgs' conversations remains impossible (0013 GATE 1).
-- =============================================================================

-- ---- 1. client_admin creates a conversation for their own org ---------------
create policy "conversations_insert_own" on public.conversations
  for insert to authenticated
  with check (
    public.bl_role() = 'client_admin'
    and client_id = public.bl_client_id()
  );

-- ---- 2. a user adds THEMSELVES to a conversation in their own org -----------
create policy "participants_insert_self" on public.conversation_participants
  for insert to authenticated
  with check (
    exists (select 1 from public.users u where u.id = conversation_participants.user_id and u.auth_user_id = auth.uid())
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_participants.conversation_id
        and c.client_id = public.bl_client_id()
    )
  );

-- ---- 3. bump conversation on every new message (RLS-exempt, atomic) ---------
create or replace function public.bl_bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_is_internal boolean;
begin
  -- Internal authors have no client_id; that flips whose turn it is.
  select (u.client_id is null) into author_is_internal
  from public.users u where u.id = new.author_id;

  update public.conversations
     set last_message_at = new.created_at,
         state = case when coalesce(author_is_internal, false)
                      then 'awaiting_client'::public.conversation_state
                      else 'awaiting_admin'::public.conversation_state
                 end
   where id = new.conversation_id
     and state <> 'closed';   -- a closed conversation isn't reopened by a stray write
  return new;
end;
$$;

create trigger chat_messages_bump_conversation
  after insert on public.chat_messages
  for each row execute function public.bl_bump_conversation();

comment on function public.bl_bump_conversation() is
  'Keeps conversations.last_message_at/state in sync on message insert. SECURITY DEFINER so neither party writes conversation state directly.';
