-- =============================================================================
-- 0009 — Fix: transition_log could be read but never written.
--
-- THE BUG
--   0400_rls.sql enabled RLS on transition_log and gave it exactly one policy:
--       transition_log_select_internal  (for select)
--   With RLS on and no INSERT policy, every insert is DENIED. The audit trail
--   that handoff §03.13 requires for contracts, invoices, payments and
--   deliverable approvals could never have been written by the application.
--
--   It went unnoticed because every earlier test wrote transition_log with the
--   SERVICE-ROLE key, which bypasses RLS entirely. The first real mutation
--   through a user session would have silently failed to audit — or, worse, the
--   status change would succeed while its audit record was rejected, leaving the
--   log permanently incomplete and no one any the wiser.
--
-- THE FIX
--   Internal roles may INSERT. Nobody may UPDATE or DELETE — that is already
--   enforced by the bl_transition_log_immutable() trigger from 0300, which fires
--   regardless of role INCLUDING service_role. Append-only stands.
--
-- WHY `with check` AND NOT `using`
--   INSERT policies only evaluate WITH CHECK. A `using` clause on an INSERT-only
--   policy is silently ignored, which is its own quiet trap.
--
-- Client roles get no INSERT: clients never write status directly (handoff §12).
-- Their approvals go through internal service paths that audit on their behalf.
-- =============================================================================

create policy "transition_log_insert_internal" on public.transition_log
  for insert to authenticated
  with check (public.bl_is_internal());

comment on policy "transition_log_insert_internal" on public.transition_log is
  'Internal roles append audit records. UPDATE/DELETE remain impossible for everyone via bl_transition_log_immutable().';
