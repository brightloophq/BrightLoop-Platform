-- =============================================================================
-- 0016 — Fix the first-participant chicken-and-egg.
--
-- 0015's `participants_insert_self` checked conversation ownership with a plain
-- subquery: `exists (select 1 from conversations c where c.id = ... and
-- c.client_id = bl_client_id())`. But that subquery runs under the caller's RLS,
-- and `conversations_read` only admits a conversation you already PARTICIPATE in
-- (bl_in_conversation). So the very first participant row can never be inserted:
-- to join you'd have to already be joined. The 5B e2e spike caught this — the
-- client's own message + the admin reply were both blocked downstream.
--
-- Fix: read the conversation's owning org through a SECURITY DEFINER helper that
-- is exempt from RLS, and check THAT against the caller's client_id. Ownership is
-- still enforced (own org only); we've just stopped the read-policy from hiding
-- the row we're validating against.
-- =============================================================================

create or replace function public.bl_conversation_client(conv_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.conversations where id = conv_id;
$$;

revoke execute on function public.bl_conversation_client(text) from anon;

drop policy if exists "participants_insert_self" on public.conversation_participants;

create policy "participants_insert_self" on public.conversation_participants
  for insert to authenticated
  with check (
    -- the row must resolve to the caller's own user...
    exists (select 1 from public.users u where u.id = conversation_participants.user_id and u.auth_user_id = auth.uid())
    -- ...joining a conversation owned by the caller's org (RLS-exempt read).
    and public.bl_conversation_client(conversation_id) = public.bl_client_id()
  );

comment on function public.bl_conversation_client(text) is
  'Owning client_id of a conversation, RLS-exempt — used to validate first-participant self-join without the read policy hiding the row.';
