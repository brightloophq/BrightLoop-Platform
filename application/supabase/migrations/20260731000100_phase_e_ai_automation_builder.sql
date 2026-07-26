-- =============================================================================
-- Phase E · Sprint E5 — AI Automation Builder: execution intents + automation
-- plans + workflow definitions (steps, triggers, actions, conditions, variables,
-- integration bindings), deployment packages, immutable versions, feedback.
-- ADDITIVE ONLY. Twelve new tables. The execution intent is versioned; the
-- automation plan + workflow definition carry mutable status; every definition
-- record + deployment package + version + feedback is append-only. This layer
-- GENERATES / VALIDATES / VERSIONS / PREPARES automation — it never executes,
-- deploys, calls an engine, or schedules anything. No prior table is touched.
-- =============================================================================

create table public.execution_intent (
  id                    text primary key,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  planning_session_id   text not null,
  execution_plan_id     text,
  title                 text not null,
  objective             text not null default '',
  status                text not null default 'draft' check (status in ('draft','building','built','published','failed','archived')),
  requested_by_user_id  text not null,
  provider              text,
  model                 text,
  prompt_id             text,
  generation_duration_ms integer not null default 0 check (generation_duration_ms >= 0),
  validation_duration_ms integer not null default 0 check (validation_duration_ms >= 0),
  simulation_duration_ms integer not null default 0 check (simulation_duration_ms >= 0),
  token_total           integer not null default 0 check (token_total >= 0),
  cost                  double precision not null default 0 check (cost >= 0),
  currency              text not null default 'USD',
  step_count            integer not null default 0 check (step_count >= 0),
  branch_count          integer not null default 0 check (branch_count >= 0),
  variable_count        integer not null default 0 check (variable_count >= 0),
  estimated_runtime_ms  integer not null default 0 check (estimated_runtime_ms >= 0),
  version               integer not null default 1 check (version > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index execution_intent_workspace_idx on public.execution_intent (workspace_id, created_at desc);
create index execution_intent_client_idx on public.execution_intent (client_id);
create index execution_intent_planning_idx on public.execution_intent (planning_session_id);
comment on table public.execution_intent is 'Phase E E5: the intent to automate an APPROVED execution plan (versioned root).';

create table public.automation_plan (
  id                  text primary key,
  execution_intent_id text not null references public.execution_intent (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  summary             text not null default '',
  workflow_count      integer not null default 0 check (workflow_count >= 0),
  step_count          integer not null default 0 check (step_count >= 0),
  trigger_count       integer not null default 0 check (trigger_count >= 0),
  action_count        integer not null default 0 check (action_count >= 0),
  variable_count      integer not null default 0 check (variable_count >= 0),
  integration_count   integer not null default 0 check (integration_count >= 0),
  status              text not null default 'draft' check (status in ('draft','validated','published')),
  created_at          timestamptz not null default now()
);
create index automation_plan_intent_idx on public.automation_plan (execution_intent_id, created_at desc);
comment on table public.automation_plan is 'Phase E E5: the automation plan for an intent (mutable status + counts).';

create table public.workflow_definition (
  id                  text primary key,
  automation_plan_id  text not null references public.automation_plan (id) on delete cascade,
  execution_intent_id text not null references public.execution_intent (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  name                text not null,
  description         text not null default '',
  status              text not null default 'draft' check (status in ('draft','published','deprecated','archived')),
  entry_step_key      text,
  version             integer not null default 1 check (version > 0),
  created_at          timestamptz not null default now()
);
create index workflow_definition_intent_idx on public.workflow_definition (execution_intent_id);
create index workflow_definition_workspace_idx on public.workflow_definition (workspace_id, created_at desc);
comment on table public.workflow_definition is 'Phase E E5: a workflow DAG root (mutable status + current version).';

create table public.workflow_step (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  key                  text not null,
  kind                 text not null check (kind in ('trigger','action','condition','branch','loop','subflow','wait')),
  name                 text not null,
  next_step_keys       jsonb not null default '[]'::jsonb,
  condition_expression text,
  on_error_step_key    text,
  retry_max            integer not null default 0 check (retry_max >= 0),
  timeout_ms           integer not null default 0 check (timeout_ms >= 0),
  ref_id               text,
  estimated_runtime_ms integer not null default 0 check (estimated_runtime_ms >= 0),
  order_index          integer not null default 0 check (order_index >= 0),
  created_at           timestamptz not null default now()
);
create index workflow_step_workflow_idx on public.workflow_step (workflow_definition_id, order_index);
comment on table public.workflow_step is 'Phase E E5: a node in the workflow DAG (edges = next_step_keys).';

create table public.trigger_definition (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  kind                 text not null check (kind in ('manual','schedule','webhook','crm_event','form_submission','payment','email','file_upload','api_event','slack','discord','teams','shopify','hubspot')),
  name                 text not null,
  config               jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);
create index trigger_definition_workflow_idx on public.trigger_definition (workflow_definition_id);
comment on table public.trigger_definition is 'Phase E E5: an (extensible) workflow trigger.';

create table public.action_definition (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  kind                 text not null check (kind in ('send_email','create_task','update_crm','http_request','transform_data','wait','condition','loop','branch','generate_ai_content','store_record','notification','webhook')),
  name                 text not null,
  config               jsonb not null default '{}'::jsonb,
  integration_binding_id text,
  created_at           timestamptz not null default now()
);
create index action_definition_workflow_idx on public.action_definition (workflow_definition_id);
comment on table public.action_definition is 'Phase E E5: a generic workflow action.';

create table public.condition_definition (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  name                 text not null,
  expression           text not null,
  true_step_key        text,
  false_step_key       text,
  created_at           timestamptz not null default now()
);
create index condition_definition_workflow_idx on public.condition_definition (workflow_definition_id);
comment on table public.condition_definition is 'Phase E E5: a boolean branch condition over variables.';

create table public.variable_definition (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  key                  text not null,
  scope                text not null check (scope in ('workspace','client','strategy','initiative','task','execution','output','environment')),
  type                 text not null check (type in ('string','number','boolean','json','date')),
  default_value        text,
  required             boolean not null default false,
  created_at           timestamptz not null default now()
);
create index variable_definition_workflow_idx on public.variable_definition (workflow_definition_id);
comment on table public.variable_definition is 'Phase E E5: a typed, scoped workflow variable.';

create table public.integration_binding (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  provider             text not null check (provider in ('email','crm','http','storage','ai','notification','payment','calendar','custom')),
  name                 text not null,
  capability           text not null default '',
  config               jsonb not null default '{}'::jsonb,
  bound                boolean not null default false,
  created_at           timestamptz not null default now()
);
create index integration_binding_workflow_idx on public.integration_binding (workflow_definition_id);
create index integration_binding_workspace_idx on public.integration_binding (workspace_id);
comment on table public.integration_binding is 'Phase E E5: an ABSTRACT integration (never a concrete engine).';

create table public.deployment_package (
  id                   text primary key,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  target               text not null check (target in ('n8n','zapier','make','temporal','custom')),
  format               text not null default 'json',
  payload              jsonb not null default '{}'::jsonb,
  checksum             text not null default '',
  status               text not null default 'draft' check (status in ('draft','ready')),
  created_at           timestamptz not null default now()
);
create index deployment_package_intent_idx on public.deployment_package (execution_intent_id);
create index deployment_package_workspace_idx on public.deployment_package (workspace_id, created_at desc);
comment on table public.deployment_package is 'Phase E E5: a PREPARED deployment descriptor (never executed/deployed here).';

create table public.automation_version (
  id                   text primary key,
  workflow_definition_id text not null references public.workflow_definition (id) on delete cascade,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  version              integer not null check (version > 0),
  status               text not null default 'draft' check (status in ('draft','published','deprecated','archived')),
  snapshot             jsonb not null default '{}'::jsonb,
  note                 text not null default '',
  created_at           timestamptz not null default now()
);
create index automation_version_workflow_idx on public.automation_version (workflow_definition_id, version);
comment on table public.automation_version is 'Phase E E5: an immutable workflow-version snapshot (supports rollback).';

create table public.automation_feedback (
  id                   text primary key,
  execution_intent_id  text not null references public.execution_intent (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  kind                 text not null check (kind in ('approval','comment','rejection')),
  rating               integer check (rating between 1 and 5),
  comment              text,
  subject_user_id      text not null,
  created_at           timestamptz not null default now()
);
create index automation_feedback_intent_idx on public.automation_feedback (execution_intent_id, created_at desc);
comment on table public.automation_feedback is 'Phase E E5: immutable feedback on an automation (clients may submit).';

-- ---- append-only enforcement (definition records + versions + feedback) -----
create trigger workflow_step_no_mutation before update or delete on public.workflow_step for each row execute function public.bl_txexec_append_only();
create trigger trigger_definition_no_mutation before update or delete on public.trigger_definition for each row execute function public.bl_txexec_append_only();
create trigger action_definition_no_mutation before update or delete on public.action_definition for each row execute function public.bl_txexec_append_only();
create trigger condition_definition_no_mutation before update or delete on public.condition_definition for each row execute function public.bl_txexec_append_only();
create trigger variable_definition_no_mutation before update or delete on public.variable_definition for each row execute function public.bl_txexec_append_only();
create trigger integration_binding_no_mutation before update or delete on public.integration_binding for each row execute function public.bl_txexec_append_only();
create trigger deployment_package_no_mutation before update or delete on public.deployment_package for each row execute function public.bl_txexec_append_only();
create trigger automation_version_no_mutation before update or delete on public.automation_version for each row execute function public.bl_txexec_append_only();
create trigger automation_feedback_no_mutation before update or delete on public.automation_feedback for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants -----------------------------------------------------------
alter table public.execution_intent enable row level security;
alter table public.automation_plan enable row level security;
alter table public.workflow_definition enable row level security;
alter table public.workflow_step enable row level security;
alter table public.trigger_definition enable row level security;
alter table public.action_definition enable row level security;
alter table public.condition_definition enable row level security;
alter table public.variable_definition enable row level security;
alter table public.integration_binding enable row level security;
alter table public.deployment_package enable row level security;
alter table public.automation_version enable row level security;
alter table public.automation_feedback enable row level security;

-- Internal builds automation; a client sees ONLY its own org's automation and may
-- submit feedback for its own org. Automation packages never cross tenants.
create policy "execution_intent_read" on public.execution_intent for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "execution_intent_write" on public.execution_intent for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "automation_plan_read" on public.automation_plan for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "automation_plan_write" on public.automation_plan for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "workflow_definition_read" on public.workflow_definition for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "workflow_definition_write" on public.workflow_definition for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only records: internal read (client read own) + internal insert.
do $$
declare t text;
begin
  foreach t in array array['workflow_step','trigger_definition','action_definition','condition_definition','variable_definition','integration_binding','deployment_package','automation_version'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;
create policy "automation_feedback_read" on public.automation_feedback for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "automation_feedback_insert" on public.automation_feedback for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id());

grant select, insert, update, delete on public.execution_intent to authenticated;
grant select, insert, update on public.automation_plan to authenticated;
grant select, insert, update on public.workflow_definition to authenticated;
grant select, insert on public.workflow_step to authenticated;
grant select, insert on public.trigger_definition to authenticated;
grant select, insert on public.action_definition to authenticated;
grant select, insert on public.condition_definition to authenticated;
grant select, insert on public.variable_definition to authenticated;
grant select, insert on public.integration_binding to authenticated;
grant select, insert on public.deployment_package to authenticated;
grant select, insert on public.automation_version to authenticated;
grant select, insert on public.automation_feedback to authenticated;
grant all on public.execution_intent to service_role;
grant select, insert, update on public.automation_plan to service_role;
grant select, insert, update on public.workflow_definition to service_role;
grant select, insert on public.workflow_step to service_role;
grant select, insert on public.trigger_definition to service_role;
grant select, insert on public.action_definition to service_role;
grant select, insert on public.condition_definition to service_role;
grant select, insert on public.variable_definition to service_role;
grant select, insert on public.integration_binding to service_role;
grant select, insert on public.deployment_package to service_role;
grant select, insert on public.automation_version to service_role;
grant select, insert on public.automation_feedback to service_role;
