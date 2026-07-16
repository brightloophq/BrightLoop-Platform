-- =============================================================================
-- 0010 — Client approval write path (the J3 loop).
--
-- Until now every deliverable/milestone write was internal-only. The client
-- approval loop (handoff §07 J3 — "the core recurring loop") needs a client
-- WRITE path, and this is the deliberate, narrow grant promised in Sprint 0
-- rather than a blanket one.
--
-- WHO
--   client_admin ONLY. `own.deliverables.approve` / milestone approval are
--   client_admin capabilities; client_member has only `.comment` / read
--   (handoff §01.3). So client_member gets NO write policy here.
--
-- SCOPE
--   Only rows in a project belonging to the caller's own client org
--   (project.client_id = bl_client_id()). A client_admin cannot touch another
--   org's deliverables — there is no policy that would let them, and the read
--   side is scoped the same way.
--
-- WHAT THEY CAN ACTUALLY DO
--   RLS grants UPDATE; the state-transition TRIGGER (0300) then restricts it to
--   LEGAL moves only. A client_admin can therefore only walk a deliverable
--   in_review → approved | revision_requested | rejected and a milestone
--   waiting_client_approval → approved | revision_requested — exactly the J3
--   surface. Any other transition is rejected by the trigger even though the
--   policy allowed the UPDATE.
--
-- KNOWN LIMITATION (documented, not hidden)
--   An UPDATE policy cannot restrict WHICH columns change. A crafted request
--   from a signed-in client_admin could edit, say, a deliverable's title on
--   their OWN project. Impact is contained to their own org's data, and the
--   application only ever sets status/feedback. Column-level enforcement
--   (a SECURITY DEFINER approval RPC, or column privileges) is the tighter fix
--   and is noted for the hardening pass — it is not a cross-tenant hole.
-- =============================================================================

create policy "deliverables_client_admin_approve" on public.deliverables
  for update to authenticated
  using (
    public.bl_role() = 'client_admin'
    and exists (
      select 1 from public.projects p
      where p.id = deliverables.project_id
        and p.client_id = public.bl_client_id()
    )
  )
  with check (
    public.bl_role() = 'client_admin'
    and exists (
      select 1 from public.projects p
      where p.id = deliverables.project_id
        and p.client_id = public.bl_client_id()
    )
  );

create policy "milestones_client_admin_approve" on public.milestones
  for update to authenticated
  using (
    public.bl_role() = 'client_admin'
    and exists (
      select 1 from public.projects p
      where p.id = milestones.project_id
        and p.client_id = public.bl_client_id()
    )
  )
  with check (
    public.bl_role() = 'client_admin'
    and exists (
      select 1 from public.projects p
      where p.id = milestones.project_id
        and p.client_id = public.bl_client_id()
    )
  );

-- Notifications: a recipient may already read + mark their own read (0400). No
-- change needed here — reaffirming the intent in one place.
comment on policy "deliverables_client_admin_approve" on public.deliverables is
  'J3 approval loop. client_admin only, own org only; the transition trigger restricts to legal moves.';
