-- =============================================================================
-- Phase E · Sprint E1 — AI Foundation: providers, prompts + versions, executions,
-- results, usage, cost, audit, conversations + messages, evaluations. ADDITIVE
-- ONLY. Eleven new tables; internal-only RLS; prompt versions, results, usage,
-- cost, audit, messages + evaluations are append-only. API keys NEVER live in the
-- database (env-only). No Phase A–D table is touched.
-- =============================================================================

-- ---- provider (internal/global config; no secrets) --------------------------
create table public.ai_provider (
  id            text primary key,
  kind          text not null check (kind in ('anthropic', 'openai', 'google')),
  label         text not null,
  enabled       boolean not null default true,
  priority      integer not null default 0 check (priority >= 0),
  client_id     text references public.clients (id) on delete cascade,
  default_model text,
  version       integer not null default 1 check (version > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.ai_provider is 'Phase E E1: a configured AI provider. NON-SECRET config only; API keys are env-only.';

-- ---- prompt (versioned aggregate) -------------------------------------------
create table public.ai_prompt (
  id             text primary key,
  workspace_id   text not null,
  client_id      text references public.clients (id) on delete cascade,
  name           text not null,
  description    text,
  tags           jsonb not null default '[]'::jsonb,
  owner_user_id  text not null,
  status         text not null default 'draft' check (status in ('draft', 'active', 'deprecated', 'archived')),
  active_version integer check (active_version > 0),
  version        integer not null default 1 check (version > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index ai_prompt_workspace_idx on public.ai_prompt (workspace_id);
create index ai_prompt_client_idx on public.ai_prompt (client_id);
comment on table public.ai_prompt is 'Phase E E1: a prompt; active_version points at the live immutable version.';

-- ---- prompt version (append-only, immutable snapshots) ----------------------
create table public.ai_prompt_version (
  id                  text primary key,
  prompt_id           text not null references public.ai_prompt (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  version             integer not null check (version > 0),
  system_prompt       text not null default '',
  user_template       text not null default '',
  variables           jsonb not null default '[]'::jsonb,
  temperature         double precision not null default 0.7,
  max_tokens          integer not null default 1024 check (max_tokens > 0),
  provider_preference text check (provider_preference in ('anthropic', 'openai', 'google')),
  model               text,
  status              text not null default 'draft' check (status in ('draft', 'active', 'deprecated', 'archived')),
  notes               text,
  created_by_user_id  text not null,
  created_at          timestamptz not null default now(),
  unique (prompt_id, version)
);
create index ai_prompt_version_prompt_idx on public.ai_prompt_version (prompt_id);
comment on table public.ai_prompt_version is 'Phase E E1: an immutable prompt snapshot. Edits append; never overwritten.';

-- ---- execution --------------------------------------------------------------
create table public.ai_prompt_execution (
  id                   text primary key,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  prompt_id            text references public.ai_prompt (id) on delete set null,
  prompt_version       integer check (prompt_version > 0),
  mode                 text not null check (mode in ('completion', 'chat', 'json', 'stream', 'tool_call', 'vision', 'audio')),
  provider             text not null check (provider in ('anthropic', 'openai', 'google')),
  model                text not null,
  status               text not null check (status in ('pending', 'succeeded', 'failed', 'fallback_succeeded')),
  duration_ms          integer not null default 0 check (duration_ms >= 0),
  retry_count          integer not null default 0 check (retry_count >= 0),
  fallback_provider    text check (fallback_provider in ('anthropic', 'openai', 'google')),
  requested_by_user_id text not null,
  created_at           timestamptz not null default now()
);
create index ai_prompt_execution_workspace_idx on public.ai_prompt_execution (workspace_id, created_at desc);
create index ai_prompt_execution_prompt_idx on public.ai_prompt_execution (prompt_id);
comment on table public.ai_prompt_execution is 'Phase E E1: one AI execution attempt with provider/model/status/retry/fallback.';

-- ---- result (append-only) ---------------------------------------------------
create table public.ai_prompt_result (
  id               text primary key,
  execution_id     text not null references public.ai_prompt_execution (id) on delete cascade,
  workspace_id     text not null,
  client_id        text references public.clients (id) on delete cascade,
  content          text not null default '',
  structured_valid boolean,
  finish_reason    text not null default 'stop',
  created_at       timestamptz not null default now()
);
create index ai_prompt_result_execution_idx on public.ai_prompt_result (execution_id);
comment on table public.ai_prompt_result is 'Phase E E1: the immutable output of an execution.';

-- ---- usage (append-only) ----------------------------------------------------
create table public.ai_usage_record (
  id                text primary key,
  execution_id      text not null references public.ai_prompt_execution (id) on delete cascade,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  provider          text not null check (provider in ('anthropic', 'openai', 'google')),
  model             text not null,
  prompt_tokens     integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  cached_tokens     integer not null default 0 check (cached_tokens >= 0),
  total_tokens      integer not null default 0 check (total_tokens >= 0),
  user_id           text not null,
  at                timestamptz not null default now()
);
create index ai_usage_record_workspace_idx on public.ai_usage_record (workspace_id, at);
comment on table public.ai_usage_record is 'Phase E E1: immutable per-execution token usage.';

-- ---- cost (append-only) -----------------------------------------------------
create table public.ai_cost_record (
  id              text primary key,
  execution_id    text not null references public.ai_prompt_execution (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  input_cost      double precision not null default 0 check (input_cost >= 0),
  output_cost     double precision not null default 0 check (output_cost >= 0),
  total_cost      double precision not null default 0 check (total_cost >= 0),
  currency        text not null default 'USD',
  pricing_version text not null,
  at              timestamptz not null default now()
);
create index ai_cost_record_workspace_idx on public.ai_cost_record (workspace_id, at);
comment on table public.ai_cost_record is 'Phase E E1: immutable per-execution estimated cost.';

-- ---- audit event (append-only) ----------------------------------------------
create table public.ai_audit_event (
  id                text primary key,
  execution_id      text not null references public.ai_prompt_execution (id) on delete cascade,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  provider          text not null check (provider in ('anthropic', 'openai', 'google')),
  model             text not null,
  prompt_version    integer check (prompt_version > 0),
  user_id           text not null,
  duration_ms       integer not null default 0 check (duration_ms >= 0),
  status            text not null check (status in ('pending', 'succeeded', 'failed', 'fallback_succeeded')),
  retry_count       integer not null default 0 check (retry_count >= 0),
  fallback_provider text check (fallback_provider in ('anthropic', 'openai', 'google')),
  total_tokens      integer not null default 0 check (total_tokens >= 0),
  total_cost        double precision not null default 0 check (total_cost >= 0),
  currency          text not null default 'USD',
  at                timestamptz not null default now()
);
create index ai_audit_event_workspace_idx on public.ai_audit_event (workspace_id, at desc);
comment on table public.ai_audit_event is 'Phase E E1: immutable audit trail; no result exists without one.';

-- ---- conversation (versioned) -----------------------------------------------
create table public.ai_conversation (
  id                      text primary key,
  workspace_id            text not null,
  client_id               text references public.clients (id) on delete cascade,
  title                   text not null default 'Untitled conversation',
  provider                text not null check (provider in ('anthropic', 'openai', 'google')),
  model                   text not null,
  participants            jsonb not null default '[]'::jsonb,
  message_count           integer not null default 0 check (message_count >= 0),
  prompt_tokens_total     integer not null default 0 check (prompt_tokens_total >= 0),
  completion_tokens_total integer not null default 0 check (completion_tokens_total >= 0),
  total_cost              double precision not null default 0 check (total_cost >= 0),
  currency                text not null default 'USD',
  status                  text not null default 'active' check (status in ('active', 'archived')),
  created_by_user_id      text not null,
  version                 integer not null default 1 check (version > 0),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index ai_conversation_workspace_idx on public.ai_conversation (workspace_id, updated_at desc);
comment on table public.ai_conversation is 'Phase E E1: a conversation with running token/cost rollups. Future agents reuse this.';

-- ---- conversation message (append-only) -------------------------------------
create table public.ai_conversation_message (
  id                text primary key,
  conversation_id   text not null references public.ai_conversation (id) on delete cascade,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  role              text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content           text not null,
  prompt_tokens     integer not null default 0 check (prompt_tokens >= 0),
  completion_tokens integer not null default 0 check (completion_tokens >= 0),
  sequence          integer not null check (sequence >= 0),
  at                timestamptz not null default now(),
  unique (conversation_id, sequence)
);
create index ai_conversation_message_conversation_idx on public.ai_conversation_message (conversation_id, sequence);
comment on table public.ai_conversation_message is 'Phase E E1: an immutable, ordered conversation message.';

-- ---- evaluation result (append-only) ----------------------------------------
create table public.ai_evaluation_result (
  id           text primary key,
  execution_id text not null references public.ai_prompt_execution (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  evaluator    text not null,
  outcome      text not null check (outcome in ('pass', 'fail', 'flagged')),
  score        integer check (score between 0 and 100),
  notes        text,
  at           timestamptz not null default now()
);
create index ai_evaluation_result_execution_idx on public.ai_evaluation_result (execution_id);
comment on table public.ai_evaluation_result is 'Phase E E1: an immutable evaluation record for an execution.';

-- ---- append-only enforcement -------------------------------------------------
create trigger ai_prompt_version_no_mutation before update or delete on public.ai_prompt_version for each row execute function public.bl_txexec_append_only();
create trigger ai_prompt_result_no_mutation before update or delete on public.ai_prompt_result for each row execute function public.bl_txexec_append_only();
create trigger ai_usage_record_no_mutation before update or delete on public.ai_usage_record for each row execute function public.bl_txexec_append_only();
create trigger ai_cost_record_no_mutation before update or delete on public.ai_cost_record for each row execute function public.bl_txexec_append_only();
create trigger ai_audit_event_no_mutation before update or delete on public.ai_audit_event for each row execute function public.bl_txexec_append_only();
create trigger ai_conversation_message_no_mutation before update or delete on public.ai_conversation_message for each row execute function public.bl_txexec_append_only();
create trigger ai_evaluation_result_no_mutation before update or delete on public.ai_evaluation_result for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only) -------------------------------------------
alter table public.ai_provider enable row level security;
alter table public.ai_prompt enable row level security;
alter table public.ai_prompt_version enable row level security;
alter table public.ai_prompt_execution enable row level security;
alter table public.ai_prompt_result enable row level security;
alter table public.ai_usage_record enable row level security;
alter table public.ai_cost_record enable row level security;
alter table public.ai_audit_event enable row level security;
alter table public.ai_conversation enable row level security;
alter table public.ai_conversation_message enable row level security;
alter table public.ai_evaluation_result enable row level security;

-- mutable tables: full internal access.
create policy "ai_provider_internal_all" on public.ai_provider for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "ai_prompt_internal_all" on public.ai_prompt for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "ai_prompt_execution_internal_all" on public.ai_prompt_execution for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "ai_conversation_internal_all" on public.ai_conversation for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only tables: SELECT + INSERT only.
create policy "ai_prompt_version_internal_read" on public.ai_prompt_version for select to authenticated using (public.bl_is_internal());
create policy "ai_prompt_version_internal_insert" on public.ai_prompt_version for insert to authenticated with check (public.bl_is_internal());
create policy "ai_prompt_result_internal_read" on public.ai_prompt_result for select to authenticated using (public.bl_is_internal());
create policy "ai_prompt_result_internal_insert" on public.ai_prompt_result for insert to authenticated with check (public.bl_is_internal());
create policy "ai_usage_record_internal_read" on public.ai_usage_record for select to authenticated using (public.bl_is_internal());
create policy "ai_usage_record_internal_insert" on public.ai_usage_record for insert to authenticated with check (public.bl_is_internal());
create policy "ai_cost_record_internal_read" on public.ai_cost_record for select to authenticated using (public.bl_is_internal());
create policy "ai_cost_record_internal_insert" on public.ai_cost_record for insert to authenticated with check (public.bl_is_internal());
create policy "ai_audit_event_internal_read" on public.ai_audit_event for select to authenticated using (public.bl_is_internal());
create policy "ai_audit_event_internal_insert" on public.ai_audit_event for insert to authenticated with check (public.bl_is_internal());
create policy "ai_conversation_message_internal_read" on public.ai_conversation_message for select to authenticated using (public.bl_is_internal());
create policy "ai_conversation_message_internal_insert" on public.ai_conversation_message for insert to authenticated with check (public.bl_is_internal());
create policy "ai_evaluation_result_internal_read" on public.ai_evaluation_result for select to authenticated using (public.bl_is_internal());
create policy "ai_evaluation_result_internal_insert" on public.ai_evaluation_result for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.ai_provider to authenticated;
grant select, insert, update, delete on public.ai_prompt to authenticated;
grant select, insert, update, delete on public.ai_prompt_execution to authenticated;
grant select, insert, update, delete on public.ai_conversation to authenticated;
grant select, insert on public.ai_prompt_version to authenticated;
grant select, insert on public.ai_prompt_result to authenticated;
grant select, insert on public.ai_usage_record to authenticated;
grant select, insert on public.ai_cost_record to authenticated;
grant select, insert on public.ai_audit_event to authenticated;
grant select, insert on public.ai_conversation_message to authenticated;
grant select, insert on public.ai_evaluation_result to authenticated;
grant all on public.ai_provider to service_role;
grant all on public.ai_prompt to service_role;
grant all on public.ai_prompt_execution to service_role;
grant all on public.ai_conversation to service_role;
grant select, insert on public.ai_prompt_version to service_role;
grant select, insert on public.ai_prompt_result to service_role;
grant select, insert on public.ai_usage_record to service_role;
grant select, insert on public.ai_cost_record to service_role;
grant select, insert on public.ai_audit_event to service_role;
grant select, insert on public.ai_conversation_message to service_role;
grant select, insert on public.ai_evaluation_result to service_role;
