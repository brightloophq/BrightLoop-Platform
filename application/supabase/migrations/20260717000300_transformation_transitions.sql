-- =============================================================================
-- 0026 — Transformation domain: state-transition graph + guards + approval gate.
--
-- Mirrors the 8 new Sprint 1A machines into public.state_transitions (the DB
-- mirror of packages/schema MACHINES) and attaches the shared bl_assert_transition
-- guard so illegal status moves are rejected at the database — even under the
-- service-role key. Adds a DB-level approval gate on moves (human authority in
-- the data model, not only the interface — engineering-blueprint invariant).
--
-- Additive & non-destructive: inserts rows + creates triggers/one function.
-- Recovery (manual): drop the triggers below, drop function
-- public.bl_move_requires_granted_approval(), and
-- `delete from public.state_transitions where machine in (...)` for the 8 machines.
-- =============================================================================

-- ---- Legal transition graph (mirror of MACHINES; Sprint 1A) -----------------
insert into public.state_transitions (machine, from_state, to_state) values
  -- signal
  ('signal', 'detected', 'validated'),
  ('signal', 'detected', 'archived'),
  ('signal', 'validated', 'prioritized'),
  ('signal', 'validated', 'archived'),
  ('signal', 'prioritized', 'archived'),

  -- insight
  ('insight', 'generated', 'endorsed'),
  ('insight', 'generated', 'dismissed'),

  -- recommendation
  ('recommendation', 'proposed', 'adjusted'),
  ('recommendation', 'proposed', 'accepted'),
  ('recommendation', 'proposed', 'rejected'),
  ('recommendation', 'adjusted', 'accepted'),
  ('recommendation', 'adjusted', 'rejected'),

  -- approval (terminal on decision)
  ('approval', 'pending', 'granted'),
  ('approval', 'pending', 'denied'),

  -- move (no execute without approval — enforced by the gate below too)
  ('move', 'draft', 'recommended'),
  ('move', 'draft', 'approved'),
  ('move', 'recommended', 'approved'),
  ('move', 'approved', 'executing'),
  ('move', 'executing', 'completed'),
  ('move', 'completed', 'measured'),

  -- executionRecord (failure is retryable)
  ('executionRecord', 'queued', 'running'),
  ('executionRecord', 'running', 'succeeded'),
  ('executionRecord', 'running', 'failed'),
  ('executionRecord', 'failed', 'running'),

  -- operationalRisk
  ('operationalRisk', 'identified', 'assessed'),
  ('operationalRisk', 'identified', 'dismissed'),
  ('operationalRisk', 'assessed', 'mitigating'),
  ('operationalRisk', 'assessed', 'accepted'),
  ('operationalRisk', 'assessed', 'dismissed'),
  ('operationalRisk', 'mitigating', 'mitigated'),
  ('operationalRisk', 'mitigating', 'accepted'),

  -- knowledgeAsset
  ('knowledgeAsset', 'draft', 'published'),
  ('knowledgeAsset', 'published', 'deprecated');

-- ---- Attach the shared transition guard (machine, status_column) ------------
create trigger signals_transition_guard
  before update on public.signals
  for each row execute function public.bl_assert_transition('signal', 'status');

create trigger insights_transition_guard
  before update on public.insights
  for each row execute function public.bl_assert_transition('insight', 'status');

create trigger recommendations_transition_guard
  before update on public.recommendations
  for each row execute function public.bl_assert_transition('recommendation', 'status');

create trigger approvals_transition_guard
  before update on public.approvals
  for each row execute function public.bl_assert_transition('approval', 'decision');

create trigger moves_transition_guard
  before update on public.moves
  for each row execute function public.bl_assert_transition('move', 'status');

create trigger execution_records_transition_guard
  before update on public.execution_records
  for each row execute function public.bl_assert_transition('executionRecord', 'status');

create trigger operational_risks_transition_guard
  before update on public.operational_risks
  for each row execute function public.bl_assert_transition('operationalRisk', 'status');

create trigger knowledge_assets_transition_guard
  before update on public.knowledge_assets
  for each row execute function public.bl_assert_transition('knowledgeAsset', 'status');

-- ---- Move approval gate (human authority enforced in the database) ----------
-- A Move may not enter executing/completed/measured unless it references a
-- GRANTED approval whose subject is this move. This makes "AI/automation cannot
-- act without human approval" a property of the data, not just application code.
create or replace function public.bl_move_requires_granted_approval()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('executing', 'completed', 'measured') then
    if new.approval_id is null
       or not exists (
         select 1
         from public.approvals a
         where a.id = new.approval_id
           and a.subject_type = 'move'
           and a.subject_id = new.id
           and a.decision = 'granted'
       ) then
      raise exception 'Move % cannot enter status "%" without a granted approval', new.id, new.status
        using errcode = '23514',
              hint = 'Attach a granted approval (subject_type=move, subject_id=this move) before executing.';
    end if;
  end if;
  return new;
end;
$$;

create trigger moves_approval_gate
  before update on public.moves
  for each row execute function public.bl_move_requires_granted_approval();
