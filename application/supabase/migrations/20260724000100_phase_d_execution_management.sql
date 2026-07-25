-- =============================================================================
-- Phase D · Sprint D3+D4 — Execution management: reviews, tasks, assignments,
-- dependencies. ADDITIVE ONLY. Four new tables on the D1/D2 workspace foundation;
-- internal-only RLS (mirrors D1); assignments are append-only. No Phase A–C touch.
-- =============================================================================

-- ---- review (D3) ------------------------------------------------------------
create table public.transformation_review (
  id                text primary key,
  workspace_id      text not null references public.transformation_workspace (id) on delete cascade,
  initiative_id     text not null references public.transformation_initiative (id) on delete cascade,
  client_id         text references public.clients (id) on delete cascade,
  status            text not null default 'pending' check (status in ('pending', 'changes_requested', 'approved', 'rejected')),
  note              text,
  decision_actor_id text,
  version           integer not null default 1 check (version > 0),
  created_at        timestamptz not null default now()
);
create index transformation_review_initiative_idx on public.transformation_review (initiative_id);
create index transformation_review_workspace_idx on public.transformation_review (workspace_id);
create index transformation_review_client_idx on public.transformation_review (client_id);
comment on table public.transformation_review is 'Phase D D3: review/approval gate for an initiative.';

-- ---- task (D4) --------------------------------------------------------------
create table public.transformation_task (
  id                text primary key,
  initiative_id     text not null references public.transformation_initiative (id) on delete cascade,
  workspace_id      text not null references public.transformation_workspace (id) on delete cascade,
  client_id         text references public.clients (id) on delete cascade,
  title             text not null,
  description       text,
  status            text not null default 'todo' check (status in ('todo', 'in_progress', 'blocked', 'completed')),
  priority          text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  estimate          text,
  assignee_actor_id text,
  order_index       integer not null default 0,
  dependency_ids    jsonb not null default '[]'::jsonb,
  version           integer not null default 1 check (version > 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index transformation_task_initiative_idx on public.transformation_task (initiative_id);
create index transformation_task_workspace_idx on public.transformation_task (workspace_id);
create index transformation_task_client_idx on public.transformation_task (client_id);
comment on table public.transformation_task is 'Phase D D4: a unit of execution work under an initiative.';

-- ---- assignment (D4, append-only history) -----------------------------------
create table public.transformation_assignment (
  id                   text primary key,
  task_id              text not null references public.transformation_task (id) on delete cascade,
  workspace_id         text not null references public.transformation_workspace (id) on delete cascade,
  client_id            text references public.clients (id) on delete cascade,
  action               text not null check (action in ('assigned', 'reassigned', 'unassigned')),
  assignee_actor_id    text,
  assigned_by_actor_id text not null,
  at                   timestamptz not null default now()
);
create index transformation_assignment_task_idx on public.transformation_assignment (task_id);
create index transformation_assignment_client_idx on public.transformation_assignment (client_id);
comment on table public.transformation_assignment is 'Phase D D4: immutable task-ownership history. Never edited or deleted.';

-- ---- dependency (D3, initiative → initiative graph) -------------------------
create table public.transformation_dependency (
  id                 text primary key,
  workspace_id       text not null references public.transformation_workspace (id) on delete cascade,
  client_id          text references public.clients (id) on delete cascade,
  from_initiative_id text not null references public.transformation_initiative (id) on delete cascade,
  to_initiative_id   text not null references public.transformation_initiative (id) on delete cascade,
  type               text not null check (type in ('depends_on', 'blocks')),
  created_at         timestamptz not null default now(),
  unique (workspace_id, from_initiative_id, to_initiative_id, type)
);
create index transformation_dependency_workspace_idx on public.transformation_dependency (workspace_id);
create index transformation_dependency_client_idx on public.transformation_dependency (client_id);
comment on table public.transformation_dependency is 'Phase D D3: a managed dependency edge between two initiatives.';

-- ---- append-only enforcement for assignment ---------------------------------
create trigger transformation_assignment_no_mutation
  before update or delete on public.transformation_assignment
  for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only) -------------------------------------------
alter table public.transformation_review enable row level security;
alter table public.transformation_task enable row level security;
alter table public.transformation_assignment enable row level security;
alter table public.transformation_dependency enable row level security;

create policy "transformation_review_internal_all" on public.transformation_review
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "transformation_task_internal_all" on public.transformation_task
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "transformation_dependency_internal_all" on public.transformation_dependency
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- assignment: append-only — SELECT + INSERT only.
create policy "transformation_assignment_internal_read" on public.transformation_assignment
  for select to authenticated using (public.bl_is_internal());
create policy "transformation_assignment_internal_insert" on public.transformation_assignment
  for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.transformation_review to authenticated;
grant select, insert, update, delete on public.transformation_task to authenticated;
grant select, insert, delete on public.transformation_dependency to authenticated;
grant select, insert on public.transformation_assignment to authenticated; -- no update/delete grant
grant all on public.transformation_review to service_role;
grant all on public.transformation_task to service_role;
grant all on public.transformation_dependency to service_role;
grant select, insert on public.transformation_assignment to service_role;
