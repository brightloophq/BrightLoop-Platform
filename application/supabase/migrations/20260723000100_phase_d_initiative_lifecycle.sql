-- =============================================================================
-- Phase D · Sprint D2 — Initiative Lifecycle.
--
-- ADDITIVE ALTER of the D1 workspace tables. Extends the initiative status to the
-- forward-only lifecycle (seeded → planned → active → completed → archived), adds
-- an optimistic-concurrency `version`, and widens the activity type to the four
-- lifecycle transition events. No new tables; RLS/grants from D1 already cover
-- SELECT/INSERT/UPDATE for the internal role.
-- =============================================================================

-- ---- initiative: lifecycle statuses + version -------------------------------
alter table public.transformation_initiative
  drop constraint transformation_initiative_execution_status_check;
alter table public.transformation_initiative
  add constraint transformation_initiative_execution_status_check
  check (execution_status in ('seeded', 'planned', 'active', 'completed', 'archived'));

alter table public.transformation_initiative
  add column version integer not null default 1 check (version > 0);

-- ---- activity: lifecycle transition types -----------------------------------
alter table public.transformation_activity
  drop constraint transformation_activity_type_check;
alter table public.transformation_activity
  add constraint transformation_activity_type_check
  check (type in (
    'workspace_created', 'initiative_seeded',
    'initiative_planned', 'initiative_activated', 'initiative_completed', 'initiative_archived'
  ));
