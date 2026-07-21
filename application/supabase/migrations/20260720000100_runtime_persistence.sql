-- =============================================================================
-- Phase B · Sprint 13A — Runtime Persistence & Job Infrastructure.
--
-- ADDITIVE ONLY. Nothing existing is altered or dropped. Makes the Phase-A
-- deterministic engine durable: runs, stages, checkpoints, artifacts, reasoning
-- jobs, provider attempts, derived records, an append-only event log, and a
-- Postgres-backed job queue with lease semantics.
--
-- INTERNAL-ONLY RLS (mirrors signals / business_scans): the runtime is operator
-- machinery, not client-facing. Client roles get no access at all.
--
-- Enums are `runtime_*`-prefixed so they never collide with the existing
-- domain enums (scan_status, finding_priority, …) that mean different things.
--
-- Artifacts store ENVELOPES + references. No raw provider content, no
-- chain-of-thought, no secrets are persisted by these tables.
--
-- ⚠️ After this migration, regenerate packages/db/generated/database.types.ts via
--    the CI db-verify loop (download the `generated-db-types` artifact and commit
--    it). The Sprint-13B typed adapters depend on the regenerated types.
-- =============================================================================

-- ---- enums (§2) -------------------------------------------------------------
create type public.runtime_run_status as enum (
  'pending', 'discovering', 'ingesting_evidence', 'assembling_graph', 'planning_reasoning',
  'executing_reasoning', 'validating_results', 'synthesizing_findings', 'building_recommendations',
  'preparing_report', 'completed', 'failed', 'cancelled', 'blocked');

create type public.runtime_stage_status as enum ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled');
create type public.runtime_checkpoint_status as enum ('valid', 'invalidated');
create type public.runtime_artifact_status as enum ('valid', 'invalid', 'unvalidated');

create type public.runtime_reasoning_job_status as enum (
  'pending', 'planned', 'routed', 'running', 'validating', 'completed', 'failed', 'cancelled', 'blocked');

create type public.runtime_provider_attempt_status as enum (
  'succeeded', 'rejected', 'failed', 'timed_out', 'cancelled', 'budget_exhausted', 'deadline_exceeded');

create type public.runtime_queue_status as enum ('queued', 'leased', 'completed', 'failed', 'cancelled', 'dead_letter');
create type public.runtime_lease_status as enum ('unleased', 'leased', 'expired', 'released');
create type public.runtime_retry_disposition as enum ('retry_same', 'retry_fallback', 'stop');

create type public.runtime_artifact_kind as enum (
  'discovery_manifest', 'evidence_ingress', 'evidence_bundle', 'intelligence_graph', 'graph_snapshot',
  'reasoning_jobs', 'execution_outcomes', 'validated_claims', 'findings', 'recommendation_candidates',
  'internal_intelligence_report', 'competitor_snapshot', 'proposal', 'narrative');

-- ---- intelligence_runs: one durable pipeline run ----------------------------
create table public.intelligence_runs (
  id              text primary key,
  client_id       text references public.clients (id) on delete cascade,
  scan_id         text not null,
  status          public.runtime_run_status not null default 'pending',
  current_stage   text,
  failed_stage    text,
  version         integer not null default 1 check (version > 0),
  idempotency_key text not null,
  metadata        jsonb not null default '{}'::jsonb,
  checksum        text,
  deadline        timestamptz,
  cancelled       boolean not null default false,
  created_by      text references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_at       timestamptz,
  cancelled_at    timestamptz,
  -- §5 idempotency: the same key may create exactly one run
  unique (idempotency_key)
);
comment on table public.intelligence_runs is
  'Phase B runtime: one durable Business Intelligence pipeline run. Envelope + status only; canonical domain logic stays in @brightloop/domain.';
create index intelligence_runs_client_idx on public.intelligence_runs (client_id);
create index intelligence_runs_scan_idx   on public.intelligence_runs (scan_id);
create index intelligence_runs_status_idx on public.intelligence_runs (status, created_at desc);

-- ---- intelligence_run_stages: an append-friendly stage transition ledger -----
create table public.intelligence_run_stages (
  id              text primary key,
  run_id          text not null references public.intelligence_runs (id) on delete cascade,
  client_id       text references public.clients (id) on delete cascade,
  scan_id         text not null,
  stage           text not null,
  status          public.runtime_stage_status not null default 'pending',
  attempt         integer not null default 0 check (attempt >= 0),
  idempotency_key text not null,
  metadata        jsonb not null default '{}'::jsonb,
  last_error      text,
  created_by      text references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_at       timestamptz,
  cancelled_at    timestamptz,
  unique (idempotency_key),
  -- one row per (run, stage, attempt) — a replay of the same attempt is a no-op
  unique (run_id, stage, attempt)
);
comment on table public.intelligence_run_stages is 'Phase B runtime: per-stage execution record for a run (one row per attempt).';
create index intelligence_run_stages_run_idx    on public.intelligence_run_stages (run_id, created_at);
create index intelligence_run_stages_client_idx on public.intelligence_run_stages (client_id);

-- ---- intelligence_checkpoints: resume points (§6) ---------------------------
create table public.intelligence_checkpoints (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  stage               text not null,
  status              public.runtime_checkpoint_status not null default 'valid',
  artifact_ids        text[] not null default '{}',
  source_checksums    jsonb not null default '{}'::jsonb,
  next_stage          text,
  attempt             integer not null default 0 check (attempt >= 0),
  invalidation_reason text,
  idempotency_key     text not null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key)
);
comment on table public.intelligence_checkpoints is
  'Phase B runtime: durable resume points. Invalidated checkpoints are RETAINED for audit, never deleted.';
create index intelligence_checkpoints_run_idx   on public.intelligence_checkpoints (run_id, created_at desc);
create index intelligence_checkpoints_valid_idx on public.intelligence_checkpoints (run_id, status, created_at desc);

-- ---- intelligence_artifacts: envelopes + references (§1) --------------------
create table public.intelligence_artifacts (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  kind                public.runtime_artifact_kind not null,
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  validation_status   public.runtime_artifact_status not null default 'unvalidated',
  source_artifact_ids text[] not null default '{}',
  envelope            jsonb not null default '{}'::jsonb,
  payload_ref         text,
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key),
  -- an artifact kind is versioned per run; the same version is written once
  unique (run_id, kind, version)
);
comment on table public.intelligence_artifacts is
  'Phase B runtime: artifact ENVELOPES + lineage. Never raw provider content or hidden reasoning.';
create index intelligence_artifacts_run_kind_idx on public.intelligence_artifacts (run_id, kind, version desc);
create index intelligence_artifacts_client_idx   on public.intelligence_artifacts (client_id);

-- ---- reasoning_jobs ---------------------------------------------------------
create table public.reasoning_jobs (
  id              text primary key,
  run_id          text not null references public.intelligence_runs (id) on delete cascade,
  client_id       text references public.clients (id) on delete cascade,
  scan_id         text not null,
  stage           text not null,
  task_type       text not null,
  status          public.runtime_reasoning_job_status not null default 'pending',
  attempt         integer not null default 0 check (attempt >= 0),
  max_attempts    integer not null default 3 check (max_attempts > 0),
  idempotency_key text not null,
  metadata        jsonb not null default '{}'::jsonb,
  deadline        timestamptz,
  created_by      text references public.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  failed_at       timestamptz,
  cancelled_at    timestamptz,
  unique (idempotency_key)
);
comment on table public.reasoning_jobs is 'Phase B runtime: durable reasoning jobs (input refs + budget envelope only).';
create index reasoning_jobs_run_idx    on public.reasoning_jobs (run_id, created_at);
create index reasoning_jobs_status_idx on public.reasoning_jobs (status, created_at);
create index reasoning_jobs_client_idx on public.reasoning_jobs (client_id);

-- ---- provider_attempts ------------------------------------------------------
create table public.provider_attempts (
  id                 text primary key,
  reasoning_job_id   text not null references public.reasoning_jobs (id) on delete cascade,
  run_id             text not null references public.intelligence_runs (id) on delete cascade,
  client_id          text references public.clients (id) on delete cascade,
  scan_id            text not null,
  provider_id        text not null,
  attempt            integer not null check (attempt >= 0),
  status             public.runtime_provider_attempt_status not null,
  retry_disposition  public.runtime_retry_disposition,
  latency_ms         integer check (latency_ms >= 0),
  estimated_cost     numeric(14, 6) check (estimated_cost >= 0),
  actual_cost        numeric(14, 6) check (actual_cost >= 0),
  input_tokens       integer check (input_tokens >= 0),
  output_tokens      integer check (output_tokens >= 0),
  usage_estimated    boolean not null default true,
  raw_response_ref   text,
  last_error         text,
  idempotency_key    text not null,
  created_at         timestamptz not null default now(),
  unique (idempotency_key),
  unique (reasoning_job_id, attempt)
);
comment on table public.provider_attempts is
  'Phase B runtime: one row per provider execution attempt. `raw_response_ref` is a REFERENCE — raw content is never stored here.';
create index provider_attempts_job_idx    on public.provider_attempts (reasoning_job_id, attempt);
create index provider_attempts_run_idx    on public.provider_attempts (run_id, created_at);
create index provider_attempts_client_idx on public.provider_attempts (client_id);

-- ---- derived records: findings / recommendations / snapshots / versions ------
create table public.intelligence_findings (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  domain              text,
  severity            text,
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  envelope            jsonb not null default '{}'::jsonb,
  source_artifact_ids text[] not null default '{}',
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key)
);
create index intelligence_findings_run_idx    on public.intelligence_findings (run_id);
create index intelligence_findings_client_idx on public.intelligence_findings (client_id);

create table public.intelligence_recommendations (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  tier                text,
  priority            integer,
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  envelope            jsonb not null default '{}'::jsonb,
  source_artifact_ids text[] not null default '{}',
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key)
);
create index intelligence_recommendations_run_idx    on public.intelligence_recommendations (run_id);
create index intelligence_recommendations_client_idx on public.intelligence_recommendations (client_id);

create table public.competitor_snapshots (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  competitor_count    integer not null default 0 check (competitor_count >= 0),
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  envelope            jsonb not null default '{}'::jsonb,
  source_artifact_ids text[] not null default '{}',
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key)
);
create index competitor_snapshots_run_idx    on public.competitor_snapshots (run_id);
create index competitor_snapshots_client_idx on public.competitor_snapshots (client_id);

create table public.proposal_versions (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  status              text not null,
  supersedes_id       text references public.proposal_versions (id) on delete set null,
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  envelope            jsonb not null default '{}'::jsonb,
  source_artifact_ids text[] not null default '{}',
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key),
  -- proposal versions are immutable and monotonic per run
  unique (run_id, version)
);
comment on table public.proposal_versions is 'Phase B runtime: immutable proposal versions. A material change writes a NEW version.';
create index proposal_versions_run_idx    on public.proposal_versions (run_id, version desc);
create index proposal_versions_client_idx on public.proposal_versions (client_id);

create table public.narrative_versions (
  id                  text primary key,
  run_id              text not null references public.intelligence_runs (id) on delete cascade,
  client_id           text references public.clients (id) on delete cascade,
  scan_id             text not null,
  audience            text not null,
  status              text not null,
  supersedes_id       text references public.narrative_versions (id) on delete set null,
  version             integer not null default 1 check (version > 0),
  checksum            text not null,
  envelope            jsonb not null default '{}'::jsonb,
  source_artifact_ids text[] not null default '{}',
  idempotency_key     text not null,
  created_by          text references public.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  unique (idempotency_key),
  unique (run_id, audience, version)
);
comment on table public.narrative_versions is 'Phase B runtime: immutable narrative versions, one lineage per audience.';
create index narrative_versions_run_idx    on public.narrative_versions (run_id, audience, version desc);
create index narrative_versions_client_idx on public.narrative_versions (client_id);

-- ---- runtime_events: APPEND-ONLY structured event log (§11) -----------------
create table public.runtime_events (
  id             text primary key,
  event_type     text not null,
  run_id         text references public.intelligence_runs (id) on delete cascade,
  stage          text,
  aggregate_id   text not null,
  aggregate_type text not null,
  client_id      text references public.clients (id) on delete cascade,
  scan_id        text,
  sequence       bigint not null check (sequence > 0),
  payload        jsonb not null default '{}'::jsonb,
  occurred_at    timestamptz not null default now(),
  correlation_id text,
  causation_id   text,
  actor          text,
  schema_version text not null default '1.0',
  -- deterministic ordering per aggregate; a replayed sequence is rejected
  unique (aggregate_type, aggregate_id, sequence)
);
comment on table public.runtime_events is
  'Phase B runtime: APPEND-ONLY event log, ordered per aggregate. Carries no chain-of-thought, secrets, or raw provider content.';
create index runtime_events_aggregate_idx on public.runtime_events (aggregate_type, aggregate_id, sequence);
create index runtime_events_run_idx       on public.runtime_events (run_id, occurred_at);
create index runtime_events_client_idx    on public.runtime_events (client_id);

-- Append-only: block UPDATE/DELETE for everyone (mirrors transition_log).
create or replace function public.bl_runtime_events_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'runtime_events is append-only';
end;
$$;

create trigger runtime_events_no_update
  before update or delete on public.runtime_events
  for each row execute function public.bl_runtime_events_immutable();

-- ---- job_queue: Postgres-backed queue with leases (§7/§8) -------------------
create table public.job_queue (
  id                text primary key,
  job_type          text not null,
  client_id         text references public.clients (id) on delete cascade,
  run_id            text references public.intelligence_runs (id) on delete cascade,
  scan_id           text,
  stage             text,
  priority          integer not null default 0,
  status            public.runtime_queue_status not null default 'queued',
  lease_status      public.runtime_lease_status not null default 'unleased',
  available_at      timestamptz not null default now(),
  attempt           integer not null default 0 check (attempt >= 0),
  max_attempts      integer not null default 5 check (max_attempts > 0),
  lease_owner       text,
  lease_expires_at  timestamptz,
  idempotency_key   text not null,
  payload_ref       text,
  payload           jsonb not null default '{}'::jsonb,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  unique (idempotency_key),
  -- a leased row must name its owner and expiry; an unleased row must not
  constraint job_queue_lease_coherent check (
    (lease_status = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or (lease_status <> 'leased' and (status <> 'leased'))
  )
);
comment on table public.job_queue is
  'Phase B runtime: Postgres-backed job queue. Leases are acquired atomically via SELECT ... FOR UPDATE SKIP LOCKED in the adapter (Sprint 13B). No hosted queue provider.';
-- the lease-acquisition index: eligible work, best priority first, oldest first
create index job_queue_eligible_idx on public.job_queue (status, available_at, priority, created_at)
  where status = 'queued';
create index job_queue_lease_idx  on public.job_queue (lease_owner, lease_expires_at) where status = 'leased';
create index job_queue_run_idx    on public.job_queue (run_id);
create index job_queue_client_idx on public.job_queue (client_id);

-- ---- RLS: internal-only across the whole runtime (§12) ----------------------
alter table public.intelligence_runs             enable row level security;
alter table public.intelligence_run_stages       enable row level security;
alter table public.intelligence_checkpoints      enable row level security;
alter table public.intelligence_artifacts        enable row level security;
alter table public.reasoning_jobs                enable row level security;
alter table public.provider_attempts             enable row level security;
alter table public.intelligence_findings         enable row level security;
alter table public.intelligence_recommendations  enable row level security;
alter table public.competitor_snapshots          enable row level security;
alter table public.proposal_versions             enable row level security;
alter table public.narrative_versions            enable row level security;
alter table public.runtime_events                enable row level security;
alter table public.job_queue                     enable row level security;

create policy "intelligence_runs_internal_all" on public.intelligence_runs
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "intelligence_run_stages_internal_all" on public.intelligence_run_stages
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "intelligence_checkpoints_internal_all" on public.intelligence_checkpoints
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "intelligence_artifacts_internal_all" on public.intelligence_artifacts
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "reasoning_jobs_internal_all" on public.reasoning_jobs
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "provider_attempts_internal_all" on public.provider_attempts
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "intelligence_findings_internal_all" on public.intelligence_findings
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "intelligence_recommendations_internal_all" on public.intelligence_recommendations
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "competitor_snapshots_internal_all" on public.competitor_snapshots
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "proposal_versions_internal_all" on public.proposal_versions
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "narrative_versions_internal_all" on public.narrative_versions
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "job_queue_internal_all" on public.job_queue
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());

-- runtime_events: internal roles may READ and INSERT only. The immutability
-- trigger blocks UPDATE/DELETE, and no policy grants them either.
create policy "runtime_events_internal_read" on public.runtime_events
  for select to authenticated using (public.bl_is_internal());
create policy "runtime_events_internal_append" on public.runtime_events
  for insert to authenticated with check (public.bl_is_internal());

-- ---- grants (table privileges precede RLS; policies are the real boundary) --
grant select, insert, update, delete on public.intelligence_runs            to authenticated;
grant select, insert, update, delete on public.intelligence_run_stages      to authenticated;
grant select, insert, update, delete on public.intelligence_checkpoints     to authenticated;
grant select, insert, update, delete on public.intelligence_artifacts       to authenticated;
grant select, insert, update, delete on public.reasoning_jobs               to authenticated;
grant select, insert, update, delete on public.provider_attempts            to authenticated;
grant select, insert, update, delete on public.intelligence_findings        to authenticated;
grant select, insert, update, delete on public.intelligence_recommendations to authenticated;
grant select, insert, update, delete on public.competitor_snapshots         to authenticated;
grant select, insert, update, delete on public.proposal_versions            to authenticated;
grant select, insert, update, delete on public.narrative_versions           to authenticated;
grant select, insert, update, delete on public.job_queue                    to authenticated;
-- Append-only event log. Migration 0029 grants default privileges to FUTURE
-- tables, so a narrow grant alone is not the effective posture — UPDATE/DELETE
-- are explicitly REVOKED below. Three independent defences apply:
--   1. no UPDATE/DELETE privilege (the revoke below),
--   2. no UPDATE/DELETE row policy (so RLS matches zero rows), and
--   3. the bl_runtime_events_immutable() trigger (fires even when RLS is bypassed).
grant select, insert                 on public.runtime_events               to authenticated;

grant all on public.intelligence_runs            to service_role;
grant all on public.intelligence_run_stages      to service_role;
grant all on public.intelligence_checkpoints     to service_role;
grant all on public.intelligence_artifacts       to service_role;
grant all on public.reasoning_jobs               to service_role;
grant all on public.provider_attempts            to service_role;
grant all on public.intelligence_findings        to service_role;
grant all on public.intelligence_recommendations to service_role;
grant all on public.competitor_snapshots         to service_role;
grant all on public.proposal_versions            to service_role;
grant all on public.narrative_versions           to service_role;
grant all on public.job_queue                    to service_role;
grant select, insert on public.runtime_events    to service_role;

-- Explicitly strip the UPDATE/DELETE inherited from migration 0029's default
-- privileges. The event log is append-only for EVERY role, service_role included.
revoke update, delete on public.runtime_events from authenticated, service_role;
