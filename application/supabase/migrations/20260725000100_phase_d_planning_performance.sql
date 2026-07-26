-- =============================================================================
-- Phase D · Sprint D5+D6 — Planning & Performance: timelines, milestones, KPIs,
-- progress snapshots. ADDITIVE ONLY. Four new tables on the D1–D4 foundation;
-- internal-only RLS (mirrors D1–D4); progress snapshots are append-only. Progress
-- and health are DERIVED by the application — persisted here only as immutable
-- point-in-time records. No Phase A–C touch, no redesign of existing tables.
-- =============================================================================

-- ---- timeline (D5) — one schedule per initiative ----------------------------
create table public.transformation_timeline (
  id              text primary key,
  initiative_id   text not null references public.transformation_initiative (id) on delete cascade,
  workspace_id    text not null references public.transformation_workspace (id) on delete cascade,
  client_id       text references public.clients (id) on delete cascade,
  start_date      text not null,
  target_end_date text not null,
  actual_end_date text,
  status          text not null default 'planned' check (status in ('planned', 'active', 'completed', 'cancelled')),
  version         integer not null default 1 check (version > 0),
  created_at      timestamptz not null default now(),
  unique (initiative_id)
);
create index transformation_timeline_workspace_idx on public.transformation_timeline (workspace_id);
create index transformation_timeline_client_idx on public.transformation_timeline (client_id);
comment on table public.transformation_timeline is 'Phase D D5: an initiative''s schedule; variance is derived, never stored-and-edited.';

-- ---- milestone (D5) — ordered checkpoints under an initiative ----------------
create table public.transformation_milestone (
  id             text primary key,
  initiative_id  text not null references public.transformation_initiative (id) on delete cascade,
  workspace_id   text not null references public.transformation_workspace (id) on delete cascade,
  client_id      text references public.clients (id) on delete cascade,
  title          text not null,
  description    text,
  planned_date   text not null,
  completed_date text,
  status         text not null default 'pending' check (status in ('pending', 'completed', 'missed')),
  order_index    integer not null default 0 check (order_index >= 0),
  version        integer not null default 1 check (version > 0),
  created_at     timestamptz not null default now(),
  unique (initiative_id, order_index)
);
create index transformation_milestone_workspace_idx on public.transformation_milestone (workspace_id);
create index transformation_milestone_client_idx on public.transformation_milestone (client_id);
comment on table public.transformation_milestone is 'Phase D D5: an ordered checkpoint under an initiative.';

-- ---- kpi (D6) — workspace-level measure, derived status ----------------------
create table public.transformation_kpi (
  id           text primary key,
  workspace_id text not null references public.transformation_workspace (id) on delete cascade,
  client_id    text references public.clients (id) on delete cascade,
  name         text not null,
  target       double precision not null,
  current      double precision not null default 0,
  unit         text not null default '',
  status       text not null default 'off_track' check (status in ('on_track', 'at_risk', 'off_track')),
  last_updated timestamptz not null default now(),
  version      integer not null default 1 check (version > 0),
  created_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index transformation_kpi_workspace_idx on public.transformation_kpi (workspace_id);
create index transformation_kpi_client_idx on public.transformation_kpi (client_id);
comment on table public.transformation_kpi is 'Phase D D6: a workspace KPI; status is derived from target vs current.';

-- ---- progress snapshot (D6, append-only) ------------------------------------
create table public.transformation_progress_snapshot (
  id                    text primary key,
  workspace_id          text not null references public.transformation_workspace (id) on delete cascade,
  client_id             text references public.clients (id) on delete cascade,
  scope                 text not null check (scope in ('initiative', 'workspace')),
  subject_id            text not null,
  progress              integer not null check (progress between 0 and 100),
  task_completion       integer not null check (task_completion between 0 and 100),
  review_completion     integer not null check (review_completion between 0 and 100),
  dependency_completion integer not null check (dependency_completion between 0 and 100),
  milestone_completion  integer not null check (milestone_completion between 0 and 100),
  timeline_variance     integer,
  health                text check (health in ('healthy', 'warning', 'critical')),
  at                    timestamptz not null default now()
);
create index transformation_progress_snapshot_workspace_idx on public.transformation_progress_snapshot (workspace_id);
create index transformation_progress_snapshot_subject_idx on public.transformation_progress_snapshot (subject_id);
create index transformation_progress_snapshot_client_idx on public.transformation_progress_snapshot (client_id);
comment on table public.transformation_progress_snapshot is 'Phase D D6: immutable derived progress/health record. Never edited or deleted.';

-- ---- append-only enforcement for progress snapshots -------------------------
create trigger transformation_progress_snapshot_no_mutation
  before update or delete on public.transformation_progress_snapshot
  for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only) -------------------------------------------
alter table public.transformation_timeline enable row level security;
alter table public.transformation_milestone enable row level security;
alter table public.transformation_kpi enable row level security;
alter table public.transformation_progress_snapshot enable row level security;

create policy "transformation_timeline_internal_all" on public.transformation_timeline
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "transformation_milestone_internal_all" on public.transformation_milestone
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "transformation_kpi_internal_all" on public.transformation_kpi
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- progress snapshot: append-only — SELECT + INSERT only.
create policy "transformation_progress_snapshot_internal_read" on public.transformation_progress_snapshot
  for select to authenticated using (public.bl_is_internal());
create policy "transformation_progress_snapshot_internal_insert" on public.transformation_progress_snapshot
  for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.transformation_timeline to authenticated;
grant select, insert, update, delete on public.transformation_milestone to authenticated;
grant select, insert, update, delete on public.transformation_kpi to authenticated;
grant select, insert on public.transformation_progress_snapshot to authenticated; -- no update/delete grant
grant all on public.transformation_timeline to service_role;
grant all on public.transformation_milestone to service_role;
grant all on public.transformation_kpi to service_role;
grant select, insert on public.transformation_progress_snapshot to service_role;
