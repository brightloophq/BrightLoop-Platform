-- =============================================================================
-- Phase E · Sprint E4 — AI Project Manager: planning sessions + execution plans
-- (initiatives, milestones, tasks, dependencies, timelines, reviews, KPIs,
-- resources, risks, feedback). ADDITIVE ONLY. Twelve new tables; the session is
-- versioned; the execution plan carries a mutable status; all plan records +
-- feedback are append-only. Materializes approved plans into Phase D via its
-- application services; owns no execution rows. No Phase A–E3 table is touched.
-- =============================================================================

create table public.planning_session (
  id                    text primary key,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  strategy_session_id   text not null,
  title                 text not null,
  status                text not null default 'draft' check (status in ('draft', 'planning', 'planned', 'approved', 'failed', 'archived')),
  requested_by_user_id  text not null,
  provider              text,
  model                 text,
  prompt_id             text,
  planning_duration_ms  integer not null default 0 check (planning_duration_ms >= 0),
  ai_duration_ms        integer not null default 0 check (ai_duration_ms >= 0),
  retrieval_duration_ms integer not null default 0 check (retrieval_duration_ms >= 0),
  validation_duration_ms integer not null default 0 check (validation_duration_ms >= 0),
  token_total           integer not null default 0 check (token_total >= 0),
  cost                  double precision not null default 0 check (cost >= 0),
  currency              text not null default 'USD',
  confidence            integer not null default 0 check (confidence between 0 and 100),
  plan_size             integer not null default 0 check (plan_size >= 0),
  version               integer not null default 1 check (version > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index planning_session_workspace_idx on public.planning_session (workspace_id, created_at desc);
create index planning_session_client_idx on public.planning_session (client_id);
comment on table public.planning_session is 'Phase E E4: an AI Project Manager planning session over an approved strategy.';

create table public.execution_plan (
  id                         text primary key,
  planning_session_id        text not null references public.planning_session (id) on delete cascade,
  workspace_id               text not null,
  client_id                  text references public.clients (id) on delete cascade,
  summary                    text not null default '',
  initiative_count           integer not null default 0 check (initiative_count >= 0),
  task_count                 integer not null default 0 check (task_count >= 0),
  milestone_count            integer not null default 0 check (milestone_count >= 0),
  kpi_count                  integer not null default 0 check (kpi_count >= 0),
  risk_count                 integer not null default 0 check (risk_count >= 0),
  critical_path_duration_days integer not null default 0 check (critical_path_duration_days >= 0),
  status                     text not null default 'draft' check (status in ('draft', 'validated', 'approved')),
  confidence                 integer not null default 0 check (confidence between 0 and 100),
  created_at                 timestamptz not null default now()
);
create index execution_plan_session_idx on public.execution_plan (planning_session_id, created_at desc);
comment on table public.execution_plan is 'Phase E E4: an execution plan (mutable status; draft→validated→approved).';

create table public.initiative_plan (
  id                       text primary key,
  planning_session_id      text not null references public.planning_session (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  title                    text not null,
  business_objective       text not null default '',
  expected_outcome         text not null default '',
  priority                 text not null default 'medium' check (priority in ('low','medium','high')),
  owner                    text,
  timeline_start           text,
  timeline_end             text,
  linked_recommendation_ids jsonb not null default '[]'::jsonb,
  roadmap_phase            integer check (roadmap_phase > 0),
  linked_initiative_id     text,
  order_index              integer not null default 0 check (order_index >= 0),
  created_at               timestamptz not null default now()
);
create index initiative_plan_session_idx on public.initiative_plan (planning_session_id, order_index);
comment on table public.initiative_plan is 'Phase E E4: an initiative plan (maps to a Phase D initiative on approval).';

create table public.milestone_plan (
  id                  text primary key,
  initiative_plan_id  text not null references public.initiative_plan (id) on delete cascade,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  title               text not null,
  entry_criteria      text not null default '',
  exit_criteria       text not null default '',
  deliverables        jsonb not null default '[]'::jsonb,
  planned_date        text,
  order_index         integer not null default 0 check (order_index >= 0),
  created_at          timestamptz not null default now()
);
create index milestone_plan_session_idx on public.milestone_plan (planning_session_id);
comment on table public.milestone_plan is 'Phase E E4: a milestone plan (entry/exit criteria + deliverables).';

create table public.task_plan (
  id                      text primary key,
  initiative_plan_id      text not null references public.initiative_plan (id) on delete cascade,
  planning_session_id     text not null references public.planning_session (id) on delete cascade,
  workspace_id            text not null,
  client_id               text references public.clients (id) on delete cascade,
  title                   text not null,
  description             text not null default '',
  acceptance_criteria     jsonb not null default '[]'::jsonb,
  owner                   text,
  priority                text not null default 'medium' check (priority in ('low','medium','high')),
  effort                  text not null default 'medium' check (effort in ('low','medium','high')),
  dependency_task_ids     jsonb not null default '[]'::jsonb,
  estimated_duration_days integer not null default 1 check (estimated_duration_days >= 0),
  required_knowledge      jsonb not null default '[]'::jsonb,
  related_recommendation_id text,
  order_index             integer not null default 0 check (order_index >= 0),
  created_at              timestamptz not null default now()
);
create index task_plan_session_idx on public.task_plan (planning_session_id, order_index);
comment on table public.task_plan is 'Phase E E4: a task plan (acceptance criteria, effort, dependencies, knowledge).';

create table public.dependency_plan (
  id                  text primary key,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  from_task_id        text not null,
  to_task_id          text not null,
  kind                text not null check (kind in ('blocking', 'finish_to_start', 'parallel', 'soft')),
  created_at          timestamptz not null default now()
);
create index dependency_plan_session_idx on public.dependency_plan (planning_session_id);
comment on table public.dependency_plan is 'Phase E E4: a task dependency edge.';

create table public.timeline_plan (
  id                  text primary key,
  initiative_plan_id  text not null references public.initiative_plan (id) on delete cascade,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  start_day           integer not null check (start_day >= 0),
  finish_day          integer not null check (finish_day >= 0),
  duration_days       integer not null check (duration_days >= 0),
  slack_days          integer not null default 0 check (slack_days >= 0),
  on_critical_path    boolean not null default false,
  created_at          timestamptz not null default now()
);
create index timeline_plan_session_idx on public.timeline_plan (planning_session_id);
comment on table public.timeline_plan is 'Phase E E4: a per-initiative CPM timeline (start/finish/slack/critical path).';

create table public.review_plan (
  id                  text primary key,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  cadence             text not null default 'per_milestone' check (cadence in ('weekly', 'biweekly', 'monthly', 'per_milestone')),
  approval_gates      jsonb not null default '[]'::jsonb,
  quality_gates       jsonb not null default '[]'::jsonb,
  success_metrics     jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now()
);
create index review_plan_session_idx on public.review_plan (planning_session_id, created_at desc);
comment on table public.review_plan is 'Phase E E4: a review plan (cadence + approval/quality gates + success metrics).';

create table public.kpi_plan (
  id                    text primary key,
  planning_session_id   text not null references public.planning_session (id) on delete cascade,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  name                  text not null,
  formula               text not null,
  target                double precision not null,
  baseline              double precision not null default 0,
  unit                  text not null default '',
  measurement_frequency text not null default 'monthly' check (measurement_frequency in ('daily', 'weekly', 'monthly', 'quarterly')),
  created_at            timestamptz not null default now()
);
create index kpi_plan_session_idx on public.kpi_plan (planning_session_id);
comment on table public.kpi_plan is 'Phase E E4: a measurable KPI (formula/target/baseline/frequency).';

create table public.resource_estimate (
  id                  text primary key,
  initiative_plan_id  text not null references public.initiative_plan (id) on delete cascade,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  people              integer not null default 1 check (people >= 0),
  skills              jsonb not null default '[]'::jsonb,
  cost_category       text not null default 'medium' check (cost_category in ('low','medium','high')),
  complexity          text not null default 'medium' check (complexity in ('low','medium','high')),
  duration_days       integer not null default 1 check (duration_days >= 0),
  confidence          integer not null default 0 check (confidence between 0 and 100),
  created_at          timestamptz not null default now()
);
create index resource_estimate_session_idx on public.resource_estimate (planning_session_id);
comment on table public.resource_estimate is 'Phase E E4: a resource estimate (people/skills/cost/complexity/duration).';

create table public.execution_risk (
  id                  text primary key,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  category            text not null check (category in ('delivery', 'technical', 'organizational', 'resource')),
  title               text not null,
  description         text not null default '',
  severity            text not null check (severity in ('low','medium','high','critical')),
  likelihood          text not null check (likelihood in ('low','medium','high')),
  mitigation          text not null default '',
  contingency         text not null default '',
  created_at          timestamptz not null default now()
);
create index execution_risk_session_idx on public.execution_risk (planning_session_id);
create index execution_risk_workspace_idx on public.execution_risk (workspace_id);
comment on table public.execution_risk is 'Phase E E4: an execution risk (delivery/technical/organizational/resource).';

create table public.planning_feedback (
  id                  text primary key,
  planning_session_id text not null references public.planning_session (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  kind                text not null check (kind in ('approval', 'comment', 'rejection')),
  rating              integer check (rating between 1 and 5),
  comment             text,
  subject_user_id     text not null,
  created_at          timestamptz not null default now()
);
create index planning_feedback_session_idx on public.planning_feedback (planning_session_id, created_at desc);
comment on table public.planning_feedback is 'Phase E E4: immutable feedback on a plan (clients may submit).';

-- ---- append-only enforcement (plan records + feedback) ----------------------
create trigger initiative_plan_no_mutation before update or delete on public.initiative_plan for each row execute function public.bl_txexec_append_only();
create trigger milestone_plan_no_mutation before update or delete on public.milestone_plan for each row execute function public.bl_txexec_append_only();
create trigger task_plan_no_mutation before update or delete on public.task_plan for each row execute function public.bl_txexec_append_only();
create trigger dependency_plan_no_mutation before update or delete on public.dependency_plan for each row execute function public.bl_txexec_append_only();
create trigger timeline_plan_no_mutation before update or delete on public.timeline_plan for each row execute function public.bl_txexec_append_only();
create trigger review_plan_no_mutation before update or delete on public.review_plan for each row execute function public.bl_txexec_append_only();
create trigger kpi_plan_no_mutation before update or delete on public.kpi_plan for each row execute function public.bl_txexec_append_only();
create trigger resource_estimate_no_mutation before update or delete on public.resource_estimate for each row execute function public.bl_txexec_append_only();
create trigger execution_risk_no_mutation before update or delete on public.execution_risk for each row execute function public.bl_txexec_append_only();
create trigger planning_feedback_no_mutation before update or delete on public.planning_feedback for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants -----------------------------------------------------------
alter table public.planning_session enable row level security;
alter table public.execution_plan enable row level security;
alter table public.initiative_plan enable row level security;
alter table public.milestone_plan enable row level security;
alter table public.task_plan enable row level security;
alter table public.dependency_plan enable row level security;
alter table public.timeline_plan enable row level security;
alter table public.review_plan enable row level security;
alter table public.kpi_plan enable row level security;
alter table public.resource_estimate enable row level security;
alter table public.execution_risk enable row level security;
alter table public.planning_feedback enable row level security;

-- Internal manages plans; a client sees ONLY its own org's plans and may submit
-- feedback for its own org. Materialization happens via Phase D services.
create policy "planning_session_read" on public.planning_session for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "planning_session_write" on public.planning_session for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "execution_plan_read" on public.execution_plan for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "execution_plan_write" on public.execution_plan for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only plan records: internal read (client read own) + internal insert.
do $$
declare t text;
begin
  foreach t in array array['initiative_plan','milestone_plan','task_plan','dependency_plan','timeline_plan','review_plan','kpi_plan','resource_estimate','execution_risk'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;
create policy "planning_feedback_read" on public.planning_feedback for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "planning_feedback_insert" on public.planning_feedback for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id());

grant select, insert, update, delete on public.planning_session to authenticated;
grant select, insert, update on public.execution_plan to authenticated;
grant select, insert on public.initiative_plan to authenticated;
grant select, insert on public.milestone_plan to authenticated;
grant select, insert on public.task_plan to authenticated;
grant select, insert on public.dependency_plan to authenticated;
grant select, insert on public.timeline_plan to authenticated;
grant select, insert on public.review_plan to authenticated;
grant select, insert on public.kpi_plan to authenticated;
grant select, insert on public.resource_estimate to authenticated;
grant select, insert on public.execution_risk to authenticated;
grant select, insert on public.planning_feedback to authenticated;
grant all on public.planning_session to service_role;
grant select, insert, update on public.execution_plan to service_role;
grant select, insert on public.initiative_plan to service_role;
grant select, insert on public.milestone_plan to service_role;
grant select, insert on public.task_plan to service_role;
grant select, insert on public.dependency_plan to service_role;
grant select, insert on public.timeline_plan to service_role;
grant select, insert on public.review_plan to service_role;
grant select, insert on public.kpi_plan to service_role;
grant select, insert on public.resource_estimate to service_role;
grant select, insert on public.execution_risk to service_role;
grant select, insert on public.planning_feedback to service_role;
