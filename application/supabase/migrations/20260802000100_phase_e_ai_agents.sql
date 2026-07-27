-- =============================================================================
-- Phase E · Sprint E7 — AI Agents & Multi-Agent Orchestration.
-- ADDITIVE ONLY. Seventeen new tables: agent_profile, agent_mission, agent_run,
-- agent_task, agent_delegation, agent_message, agent_observation, agent_decision,
-- agent_tool_call, agent_checkpoint, agent_approval, agent_evaluation,
-- agent_memory, agent_artifact, agent_failure, agent_feedback, capability_definition.
-- Versioned (optimistic concurrency): profile, mission, run, task, approval.
-- Append-only (trigger): delegation, message, observation, decision, tool_call,
-- checkpoint, evaluation, memory, artifact, failure, feedback. Agents ORCHESTRATE
-- Phase D + E1–E6 via their application services; they own no upstream rows and
-- never touch prior-phase tables. RLS keeps missions strictly per-tenant.
-- =============================================================================

create table public.agent_profile (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  name                   text not null,
  role                   text not null check (role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  purpose                text not null default '',
  allowed_capabilities   jsonb not null default '[]'::jsonb,
  prohibited_capabilities jsonb not null default '[]'::jsonb,
  input_contract         jsonb not null default '{}'::jsonb,
  output_contract        jsonb not null default '{}'::jsonb,
  escalation_policy      text not null default '',
  approval_requirements  jsonb not null default '[]'::jsonb,
  max_retries            integer not null default 2 check (max_retries >= 0),
  max_delegation_depth   integer not null default 3 check (max_delegation_depth >= 0),
  status                 text not null default 'draft' check (status in ('draft','active','inactive','archived')),
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index agent_profile_workspace_idx on public.agent_profile (workspace_id, created_at desc);
comment on table public.agent_profile is 'Phase E E7: a versioned agent profile (role, capabilities, policies).';

create table public.agent_mission (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  coordinator_profile_id text not null references public.agent_profile (id) on delete cascade,
  title                  text not null,
  goal                   text not null default '',
  status                 text not null default 'draft' check (status in ('draft','queued','planning','running','waiting_for_approval','resuming','completed','failed','cancelled','timed_out','archived')),
  requested_by_user_id   text not null,
  strategy_session_id    text,
  planning_session_id    text,
  automation_intent_id   text,
  limits                 jsonb not null default '{}'::jsonb,
  plan_hash              text not null default '',
  plan_locked            boolean not null default false,
  resumable_checkpoint_id text,
  correlation_id         text not null,
  provider               text,
  model                  text,
  planning_duration_ms   integer not null default 0 check (planning_duration_ms >= 0),
  duration_ms            integer not null default 0 check (duration_ms >= 0),
  run_count              integer not null default 0 check (run_count >= 0),
  task_count             integer not null default 0 check (task_count >= 0),
  delegation_count       integer not null default 0 check (delegation_count >= 0),
  retry_count            integer not null default 0 check (retry_count >= 0),
  checkpoint_count       integer not null default 0 check (checkpoint_count >= 0),
  approval_wait_ms       integer not null default 0 check (approval_wait_ms >= 0),
  capability_calls       integer not null default 0 check (capability_calls >= 0),
  failed_capability_calls integer not null default 0 check (failed_capability_calls >= 0),
  token_total            integer not null default 0 check (token_total >= 0),
  cost                   double precision not null default 0 check (cost >= 0),
  progress               integer not null default 0 check (progress between 0 and 100),
  termination_reason     text not null default '',
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index agent_mission_workspace_idx on public.agent_mission (workspace_id, created_at desc);
create index agent_mission_client_idx on public.agent_mission (client_id);
comment on table public.agent_mission is 'Phase E E7: a versioned agent mission (plan immutable after start).';

create table public.agent_run (
  id               text primary key,
  mission_id       text not null references public.agent_mission (id) on delete cascade,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  agent_profile_id text not null,
  role             text not null check (role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  status           text not null default 'created' check (status in ('created','planning','executing','observing','evaluating','paused','completed','failed','cancelled','timed_out')),
  delegation_depth integer not null default 0 check (delegation_depth >= 0),
  parent_run_id    text,
  correlation_id   text not null,
  trace_id         text not null,
  started_at       timestamptz,
  ended_at         timestamptz,
  version          integer not null default 1 check (version > 0),
  created_at       timestamptz not null default now()
);
create index agent_run_mission_idx on public.agent_run (mission_id);
comment on table public.agent_run is 'Phase E E7: a versioned agent run (auditable status transitions).';

create table public.agent_task (
  id                   text primary key,
  mission_id           text not null references public.agent_mission (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  key                  text not null,
  kind                 text not null check (kind in ('capability','approval_gate','terminal','compensation')),
  title                text not null,
  assigned_role        text not null check (assigned_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  capability_key       text,
  capability_input     jsonb not null default '{}'::jsonb,
  depends_on           jsonb not null default '[]'::jsonb,
  parallelizable       boolean not null default false,
  optional             boolean not null default false,
  approval_gated       boolean not null default false,
  approval_class       text check (approval_class in ('strategy_publish','plan_approval','workflow_publish','deployment_package','external_side_effect','high_risk','cost_threshold','privileged')),
  retryable            boolean not null default true,
  compensates_task_key text,
  completion_criteria  text not null default '',
  expected_output      text not null default '',
  status               text not null default 'pending' check (status in ('pending','ready','claimed','running','waiting_for_approval','completed','failed','skipped','compensating','compensated')),
  retry_count          integer not null default 0 check (retry_count >= 0),
  result_artifact_id   text,
  order_index          integer not null default 0 check (order_index >= 0),
  claimed_by           text,
  claimed_at           timestamptz,
  lease_expires_at     timestamptz,
  heartbeat_at         timestamptz,
  version              integer not null default 1 check (version > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index agent_task_mission_idx on public.agent_task (mission_id, order_index);
comment on table public.agent_task is 'Phase E E7: a versioned, claimable agent task (a node in the mission DAG).';

create table public.agent_delegation (
  id                 text primary key,
  mission_id         text not null references public.agent_mission (id) on delete cascade,
  parent_run_id      text not null,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  delegating_role    text not null check (delegating_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  receiving_role     text not null check (receiving_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  task_key           text not null,
  expected_output    text not null default '',
  constraints        text not null default '',
  deadline           timestamptz,
  depth              integer not null default 1 check (depth >= 0),
  status             text not null default 'pending' check (status in ('pending','accepted','in_progress','completed','failed','rejected')),
  result_artifact_id text,
  failure_reason     text,
  created_at         timestamptz not null default now()
);
create index agent_delegation_mission_idx on public.agent_delegation (mission_id);
comment on table public.agent_delegation is 'Phase E E7: an explicit, persisted agent-to-agent delegation.';

create table public.agent_message (
  id                text primary key,
  mission_id        text not null references public.agent_mission (id) on delete cascade,
  run_id            text,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  kind              text not null check (kind in ('instruction','clarification','progress','result','warning','escalation','approval_request','approval_response','cancellation')),
  sender_role       text,
  sender_user_id    text,
  receiver_role     text,
  receiver_user_id  text,
  correlation_id    text not null,
  parent_message_id text,
  payload           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);
create index agent_message_mission_idx on public.agent_message (mission_id, created_at);
comment on table public.agent_message is 'Phase E E7: an inter-agent / human message.';

create table public.agent_observation (
  id             text primary key,
  mission_id     text not null references public.agent_mission (id) on delete cascade,
  run_id         text,
  task_key       text,
  workspace_id   text not null,
  client_id      text references public.clients (id) on delete cascade,
  capability_key text,
  summary        text not null default '',
  data           jsonb not null default '{}'::jsonb,
  provenance     jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index agent_observation_mission_idx on public.agent_observation (mission_id, created_at);
comment on table public.agent_observation is 'Phase E E7: a normalized observation of a capability result.';

create table public.agent_decision (
  id           text primary key,
  mission_id   text not null references public.agent_mission (id) on delete cascade,
  run_id       text,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  kind         text not null check (kind in ('plan','delegate','invoke','request_approval','replan','retry','escalate','complete','cancel')),
  rationale    text not null default '',
  task_key     text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index agent_decision_mission_idx on public.agent_decision (mission_id, created_at);
comment on table public.agent_decision is 'Phase E E7: a recorded coordinator/agent decision.';

create table public.agent_tool_call (
  id                  text primary key,
  mission_id          text not null references public.agent_mission (id) on delete cascade,
  run_id              text,
  task_key            text,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  capability_key      text not null,
  required_permission text not null,
  side_effect         text not null check (side_effect in ('read','write','external')),
  input               jsonb not null default '{}'::jsonb,
  output_ref          text,
  ok                  boolean not null,
  duration_ms         integer not null default 0 check (duration_ms >= 0),
  token_total         integer not null default 0 check (token_total >= 0),
  cost                double precision not null default 0 check (cost >= 0),
  idempotency_key     text not null,
  correlation_id      text not null,
  error_code          text,
  created_at          timestamptz not null default now()
);
create index agent_tool_call_mission_idx on public.agent_tool_call (mission_id, created_at);
create index agent_tool_call_idem_idx on public.agent_tool_call (mission_id, idempotency_key);
comment on table public.agent_tool_call is 'Phase E E7: the gateway audit record for a capability invocation.';

create table public.agent_checkpoint (
  id             text primary key,
  mission_id     text not null references public.agent_mission (id) on delete cascade,
  workspace_id   text not null,
  client_id      text references public.clients (id) on delete cascade,
  label          text not null default '',
  mission_status text not null check (mission_status in ('draft','queued','planning','running','waiting_for_approval','resuming','completed','failed','cancelled','timed_out','archived')),
  state_hash     text not null,
  snapshot       jsonb not null default '{}'::jsonb,
  sequence       integer not null default 0 check (sequence >= 0),
  created_at     timestamptz not null default now()
);
create index agent_checkpoint_mission_idx on public.agent_checkpoint (mission_id, sequence);
comment on table public.agent_checkpoint is 'Phase E E7: a durable, resumable mission checkpoint.';

create table public.agent_approval (
  id                        text primary key,
  mission_id                text not null references public.agent_mission (id) on delete cascade,
  task_key                  text not null,
  workspace_id              text not null,
  client_id                 text references public.clients (id) on delete cascade,
  approval_class            text not null check (approval_class in ('strategy_publish','plan_approval','workflow_publish','deployment_package','external_side_effect','high_risk','cost_threshold','privileged')),
  status                    text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  payload                   jsonb not null default '{}'::jsonb,
  payload_hash              text not null,
  requested_by_role         text not null check (requested_by_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  assigned_approver_user_id text,
  decided_by_user_id        text,
  decision_reason           text,
  requested_at              timestamptz not null,
  decided_at                timestamptz,
  expires_at                timestamptz,
  version                   integer not null default 1 check (version > 0),
  created_at                timestamptz not null default now()
);
create index agent_approval_mission_idx on public.agent_approval (mission_id, status);
comment on table public.agent_approval is 'Phase E E7: a human approval (payload immutable; versioned status).';

create table public.agent_evaluation (
  id                   text primary key,
  mission_id           text not null references public.agent_mission (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  target_kind          text not null check (target_kind in ('task','mission')),
  target_key           text not null,
  evaluator_role       text not null check (evaluator_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  correctness          integer not null default 0 check (correctness between 0 and 100),
  completeness         integer not null default 0 check (completeness between 0 and 100),
  evidence_quality     integer not null default 0 check (evidence_quality between 0 and 100),
  policy_compliance    integer not null default 0 check (policy_compliance between 0 and 100),
  goal_alignment       integer not null default 0 check (goal_alignment between 0 and 100),
  cost_efficiency      integer not null default 0 check (cost_efficiency between 0 and 100),
  execution_efficiency integer not null default 0 check (execution_efficiency between 0 and 100),
  confidence           integer not null default 0 check (confidence between 0 and 100),
  human_accepted       boolean,
  score                integer not null default 0 check (score between 0 and 100),
  verdict              text not null check (verdict in ('pass','fail')),
  rationale            text not null default '',
  evidence             jsonb not null default '[]'::jsonb,
  required_remediation text not null default '',
  created_at           timestamptz not null default now()
);
create index agent_evaluation_mission_idx on public.agent_evaluation (mission_id, created_at);
comment on table public.agent_evaluation is 'Phase E E7: an append-only task/mission evaluation.';

create table public.agent_memory (
  id           text primary key,
  mission_id   text not null references public.agent_mission (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  type         text not null check (type in ('mission_context','task_result','decision_record','user_instruction','approval_record','evidence_reference','execution_checkpoint')),
  key          text not null,
  value        text not null default '',
  sensitivity  text not null default 'internal' check (sensitivity in ('public','internal','confidential','restricted')),
  source_ref   text,
  ttl_seconds  integer check (ttl_seconds >= 0),
  redacted     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index agent_memory_mission_idx on public.agent_memory (mission_id);
comment on table public.agent_memory is 'Phase E E7: bounded, mission-scoped operational memory (NOT a knowledge base).';

create table public.agent_artifact (
  id               text primary key,
  mission_id       text not null references public.agent_mission (id) on delete cascade,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  kind             text not null check (kind in ('strategy_result','execution_plan','automation_workflow','deployment_package','report','validation_result','simulation_result','citation_bundle','approval_record','knowledge_context')),
  ref_context      text not null,
  ref_id           text not null,
  title            text not null default '',
  snapshot         jsonb not null default '{}'::jsonb,
  citations        jsonb not null default '[]'::jsonb,
  produced_by_role text not null check (produced_by_role in ('coordinator','strategy','project_management','automation','reporting','knowledge','review')),
  task_key         text,
  created_at       timestamptz not null default now()
);
create index agent_artifact_mission_idx on public.agent_artifact (mission_id);
comment on table public.agent_artifact is 'Phase E E7: a STABLE reference to an upstream output (not a copied payload).';

create table public.agent_failure (
  id                  text primary key,
  mission_id          text not null references public.agent_mission (id) on delete cascade,
  run_id              text,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  category            text not null check (category in ('validation','authorization','approval','capability','timeout','budget','dependency','upstream','conflict','unknown')),
  stage               text not null default '',
  cause               text not null default '',
  retryable           boolean not null default false,
  retry_count         integer not null default 0 check (retry_count >= 0),
  affected_task_key   text,
  affected_capability text,
  resolution          text not null default 'unresolved' check (resolution in ('retry','replan','delegate','clarify','approve','pause','fail','cancel','compensate','unresolved')),
  created_at          timestamptz not null default now()
);
create index agent_failure_mission_idx on public.agent_failure (mission_id, created_at);
comment on table public.agent_failure is 'Phase E E7: an append-only failure record.';

create table public.agent_feedback (
  id              text primary key,
  mission_id      text not null references public.agent_mission (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  kind            text not null check (kind in ('approval','comment','rejection')),
  rating          integer check (rating between 1 and 5),
  comment         text,
  subject_user_id text not null,
  created_at      timestamptz not null default now()
);
create index agent_feedback_mission_idx on public.agent_feedback (mission_id, created_at desc);
comment on table public.agent_feedback is 'Phase E E7: immutable feedback on a mission (clients may submit).';

create table public.capability_definition (
  key                 text primary key,
  owning_context      text not null,
  service             text not null,
  required_permission text not null,
  side_effect         text not null check (side_effect in ('read','write','external')),
  approval            text not null default 'none' check (approval in ('none','required')),
  retry               text not null default 'idempotent_retry' check (retry in ('none','idempotent_retry','at_least_once')),
  idempotency         text not null default 'idempotent' check (idempotency in ('idempotent','non_idempotent')),
  timeout_ms          integer not null default 30000 check (timeout_ms >= 0),
  cost_category       text not null default 'low' check (cost_category in ('low','medium','high')),
  description         text not null default '',
  created_at          timestamptz not null default now()
);
comment on table public.capability_definition is 'Phase E E7: the persisted capability registry (global, upsert by key).';

-- ---- append-only enforcement -----------------------------------------------
create trigger agent_delegation_no_mutation before update or delete on public.agent_delegation for each row execute function public.bl_txexec_append_only();
create trigger agent_message_no_mutation before update or delete on public.agent_message for each row execute function public.bl_txexec_append_only();
create trigger agent_observation_no_mutation before update or delete on public.agent_observation for each row execute function public.bl_txexec_append_only();
create trigger agent_decision_no_mutation before update or delete on public.agent_decision for each row execute function public.bl_txexec_append_only();
create trigger agent_tool_call_no_mutation before update or delete on public.agent_tool_call for each row execute function public.bl_txexec_append_only();
create trigger agent_checkpoint_no_mutation before update or delete on public.agent_checkpoint for each row execute function public.bl_txexec_append_only();
create trigger agent_evaluation_no_mutation before update or delete on public.agent_evaluation for each row execute function public.bl_txexec_append_only();
create trigger agent_memory_no_mutation before update or delete on public.agent_memory for each row execute function public.bl_txexec_append_only();
create trigger agent_artifact_no_mutation before update or delete on public.agent_artifact for each row execute function public.bl_txexec_append_only();
create trigger agent_failure_no_mutation before update or delete on public.agent_failure for each row execute function public.bl_txexec_append_only();
create trigger agent_feedback_no_mutation before update or delete on public.agent_feedback for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants -----------------------------------------------------------
alter table public.agent_profile enable row level security;
alter table public.agent_mission enable row level security;
alter table public.agent_run enable row level security;
alter table public.agent_task enable row level security;
alter table public.agent_delegation enable row level security;
alter table public.agent_message enable row level security;
alter table public.agent_observation enable row level security;
alter table public.agent_decision enable row level security;
alter table public.agent_tool_call enable row level security;
alter table public.agent_checkpoint enable row level security;
alter table public.agent_approval enable row level security;
alter table public.agent_evaluation enable row level security;
alter table public.agent_memory enable row level security;
alter table public.agent_artifact enable row level security;
alter table public.agent_failure enable row level security;
alter table public.agent_feedback enable row level security;
alter table public.capability_definition enable row level security;

-- Internal manages everything; a client sees ONLY its own org's agent records.
-- agent_profile: clients never configure (internal-only write), but may read own.
create policy "agent_profile_read" on public.agent_profile for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "agent_profile_write" on public.agent_profile for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
do $$
declare t text;
begin
  foreach t in array array['agent_mission','agent_run','agent_task'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal())', t || '_write', t);
  end loop;
  -- append-only records: internal insert; client + internal read own org.
  foreach t in array array['agent_delegation','agent_message','agent_observation','agent_decision','agent_tool_call','agent_checkpoint','agent_evaluation','agent_memory','agent_artifact','agent_failure'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;

-- agent_approval: read own org; internal inserts/updates; an ASSIGNED client
-- approver may update only their own assigned approval in their own org.
create policy "agent_approval_read" on public.agent_approval for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "agent_approval_insert" on public.agent_approval for insert to authenticated with check (public.bl_is_internal());
create policy "agent_approval_update" on public.agent_approval for update to authenticated
  using (public.bl_is_internal() or (client_id = public.bl_client_id() and assigned_approver_user_id = coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')))
  with check (public.bl_is_internal() or (client_id = public.bl_client_id() and assigned_approver_user_id = coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')));

-- agent_feedback: read own org; client + internal may insert for their own org.
create policy "agent_feedback_read" on public.agent_feedback for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "agent_feedback_insert" on public.agent_feedback for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id());

-- capability_definition: readable by all authenticated; internal-only writes.
create policy "capability_definition_read" on public.capability_definition for select to authenticated using (true);
create policy "capability_definition_write" on public.capability_definition for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());

grant select, insert, update, delete on public.agent_profile to authenticated;
grant select, insert, update, delete on public.agent_mission to authenticated;
grant select, insert, update, delete on public.agent_run to authenticated;
grant select, insert, update, delete on public.agent_task to authenticated;
grant select, insert on public.agent_delegation to authenticated;
grant select, insert on public.agent_message to authenticated;
grant select, insert on public.agent_observation to authenticated;
grant select, insert on public.agent_decision to authenticated;
grant select, insert on public.agent_tool_call to authenticated;
grant select, insert on public.agent_checkpoint to authenticated;
grant select, insert, update on public.agent_approval to authenticated;
grant select, insert on public.agent_evaluation to authenticated;
grant select, insert on public.agent_memory to authenticated;
grant select, insert on public.agent_artifact to authenticated;
grant select, insert on public.agent_failure to authenticated;
grant select, insert on public.agent_feedback to authenticated;
grant select, insert, update on public.capability_definition to authenticated;
grant all on public.agent_profile to service_role;
grant all on public.agent_mission to service_role;
grant all on public.agent_run to service_role;
grant all on public.agent_task to service_role;
grant select, insert on public.agent_delegation to service_role;
grant select, insert on public.agent_message to service_role;
grant select, insert on public.agent_observation to service_role;
grant select, insert on public.agent_decision to service_role;
grant select, insert on public.agent_tool_call to service_role;
grant select, insert on public.agent_checkpoint to service_role;
grant select, insert, update on public.agent_approval to service_role;
grant select, insert on public.agent_evaluation to service_role;
grant select, insert on public.agent_memory to service_role;
grant select, insert on public.agent_artifact to service_role;
grant select, insert on public.agent_failure to service_role;
grant select, insert on public.agent_feedback to service_role;
grant all on public.capability_definition to service_role;
