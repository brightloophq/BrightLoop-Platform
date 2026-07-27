-- =============================================================================
-- Phase F · Sprint F3 — Execution Runtime & Deployment Engine. ADDITIVE ONLY.
-- Fifteen new tables that govern an APPROVED E5 deployment package into a runtime
-- deployment against an external runtime (n8n). AUXION REMAINS THE SYSTEM OF
-- RECORD. Registration / policy / deployment / execution / rollback are versioned
-- or mutable roots; capability & health snapshots, attempts, events, logs,
-- failures, webhook receipts and reconciliations are append-only. NO raw secret is
-- ever stored — credential rows carry only a reference + validation posture, and
-- their mutation is INTERNAL-ONLY. No prior table is touched.
-- =============================================================================

-- ---- runtime registration (versioned root) ---------------------------------
create table public.runtime_registration (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  provider               text not null check (provider in ('n8n')),
  display_name           text not null,
  environment            text not null check (environment in ('development','staging','production')),
  base_url_ref           text not null,
  credential_reference_id text,
  status                 text not null default 'pending_configuration' check (status in ('pending_configuration','validating','healthy','degraded','unavailable','disabled','revoked')),
  provider_version       text,
  supported_capabilities jsonb not null default '[]'::jsonb,
  health_state           text not null default 'unknown' check (health_state in ('healthy','degraded','unavailable','unauthorized','unknown')),
  last_health_check_at   timestamptz,
  created_by_user_id     text not null,
  correlation_id         text not null,
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index runtime_registration_workspace_idx on public.runtime_registration (workspace_id, created_at desc);
create index runtime_registration_client_idx on public.runtime_registration (client_id);
comment on table public.runtime_registration is 'Phase F F3: an external runtime registration (versioned; Auxion is the system of record).';

-- ---- runtime policy (versioned root, tenant-scoped) ------------------------
create table public.runtime_policy (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  environment            text not null check (environment in ('development','staging','production')),
  provider               text not null check (provider in ('n8n')),
  requires_approval      boolean not null default true,
  exact_hash_approval    boolean not null default false,
  rollback_required      boolean not null default false,
  health_check_required  boolean not null default false,
  auto_activate          boolean not null default false,
  max_retries            integer not null default 3 check (max_retries between 0 and 20),
  max_execution_ms       integer not null default 3600000 check (max_execution_ms >= 0),
  allowed_deployer_roles jsonb not null default '[]'::jsonb,
  created_by_user_id     text not null,
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (workspace_id, environment, provider)
);
create index runtime_policy_workspace_idx on public.runtime_policy (workspace_id);
comment on table public.runtime_policy is 'Phase F F3: a tenant-scoped deployment policy per environment + provider.';

-- ---- credential reference (mutable root; INTERNAL-ONLY mutation) -----------
create table public.runtime_credential_reference (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  runtime_registration_id text,
  provider               text not null check (provider in ('n8n')),
  secret_ref             text not null,
  secret_version         text not null default '1',
  metadata               jsonb not null default '{}'::jsonb,
  validation_state       text not null default 'unverified' check (validation_state in ('unverified','valid','invalid','expired','revoked')),
  rotated_at             timestamptz,
  expires_at             timestamptz,
  created_by_user_id     text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index runtime_credential_workspace_idx on public.runtime_credential_reference (workspace_id);
comment on table public.runtime_credential_reference is 'Phase F F3: a REFERENCE to a runtime secret (never the secret); internal-only mutation.';

-- ---- capability + health snapshots (append-only) ---------------------------
create table public.runtime_capability_snapshot (
  id                     text primary key,
  runtime_registration_id text not null references public.runtime_registration (id) on delete cascade,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  provider               text not null check (provider in ('n8n')),
  capabilities           jsonb not null default '[]'::jsonb,
  provider_version       text,
  discovered_at          timestamptz not null,
  created_at             timestamptz not null default now()
);
create index runtime_capability_snapshot_rt_idx on public.runtime_capability_snapshot (runtime_registration_id, created_at desc);

create table public.runtime_health_snapshot (
  id                     text primary key,
  runtime_registration_id text not null references public.runtime_registration (id) on delete cascade,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  level                  text not null check (level in ('healthy','degraded','unavailable','unauthorized','unknown')),
  latency_ms             integer not null default 0 check (latency_ms >= 0),
  provider_version       text,
  detail                 jsonb not null default '{}'::jsonb,
  checked_at             timestamptz not null,
  created_at             timestamptz not null default now()
);
create index runtime_health_snapshot_rt_idx on public.runtime_health_snapshot (runtime_registration_id, created_at desc);

-- ---- deployment (versioned root; immutable definition, mutable lifecycle) ---
create table public.runtime_deployment (
  id                        text primary key,
  workspace_id              text not null,
  client_id                 text references public.clients (id) on delete cascade,
  runtime_registration_id   text not null references public.runtime_registration (id) on delete cascade,
  provider                  text not null check (provider in ('n8n')),
  deployment_package_id     text not null,
  package_hash              text not null,
  workflow_definition_id    text not null,
  deployment_version        integer not null default 1 check (deployment_version > 0),
  target_environment        text not null check (target_environment in ('development','staging','production')),
  translated_workflow_hash  text not null default '',
  external_workflow_id      text,
  external_workflow_version text,
  approval_reference_id     text,
  approved_by_user_id       text,
  approval_expires_at       timestamptz,
  previous_deployment_id    text,
  rollback_source_deployment_id text,
  status                    text not null default 'draft' check (status in ('draft','validating','awaiting_approval','queued','deploying','deployed','activating','active','paused','degraded','failed','rolling_back','rolled_back','superseded','cancelled')),
  activation_state          text not null default 'inactive' check (activation_state in ('inactive','active','paused')),
  requested_by_user_id      text not null,
  deployed_by_user_id       text,
  deployed_at               timestamptz,
  correlation_id            text not null,
  trace_id                  text not null,
  version                   integer not null default 1 check (version > 0),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (deployment_package_id, runtime_registration_id, deployment_version)
);
create index runtime_deployment_workspace_idx on public.runtime_deployment (workspace_id, updated_at desc);
create index runtime_deployment_package_idx on public.runtime_deployment (deployment_package_id);
create index runtime_deployment_status_idx on public.runtime_deployment (workspace_id, status);
comment on table public.runtime_deployment is 'Phase F F3: a governed runtime deployment (versioned; immutable definition + lifecycle).';

-- ---- deployment attempt / event / log (append-only) ------------------------
create table public.runtime_deployment_attempt (
  id                 text primary key,
  deployment_id      text not null references public.runtime_deployment (id) on delete cascade,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  operation          text not null check (operation in ('deploy','update','activate','deactivate','pause','resume','rollback','cancel','reconcile','delete')),
  idempotency_key    text not null,
  attempt_number     integer not null default 1 check (attempt_number >= 1),
  status             text not null default 'pending' check (status in ('pending','succeeded','failed')),
  failure_category   text,
  provider_code      text,
  started_at         timestamptz not null,
  finished_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index runtime_deployment_attempt_dep_idx on public.runtime_deployment_attempt (deployment_id, created_at);
create index runtime_deployment_attempt_key_idx on public.runtime_deployment_attempt (idempotency_key);

create table public.runtime_deployment_event (
  id                 text primary key,
  deployment_id      text not null references public.runtime_deployment (id) on delete cascade,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  operation          text check (operation in ('deploy','update','activate','deactivate','pause','resume','rollback','cancel','reconcile','delete')),
  from_status        text,
  to_status          text,
  actor_user_id      text,
  reason             text not null default '',
  correlation_id     text not null,
  created_at         timestamptz not null default now()
);
create index runtime_deployment_event_dep_idx on public.runtime_deployment_event (deployment_id, created_at);

create table public.runtime_deployment_log (
  id                 text primary key,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  runtime_registration_id text,
  deployment_id      text,
  execution_id       text,
  provider           text not null check (provider in ('n8n')),
  operation          text not null,
  severity           text not null default 'info' check (severity in ('debug','info','warn','error','critical')),
  message            text not null default '',
  metadata           jsonb not null default '{}'::jsonb,
  correlation_id     text not null,
  trace_id           text not null,
  created_at         timestamptz not null default now()
);
create index runtime_deployment_log_dep_idx on public.runtime_deployment_log (deployment_id, created_at desc);
create index runtime_deployment_log_workspace_idx on public.runtime_deployment_log (workspace_id, created_at desc);

-- ---- runtime execution (versioned root) + attempt/failure (append-only) ----
create table public.runtime_execution (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  deployment_id          text not null references public.runtime_deployment (id) on delete cascade,
  runtime_registration_id text not null references public.runtime_registration (id) on delete cascade,
  external_execution_id  text not null,
  external_workflow_id   text,
  status                 text not null default 'discovered' check (status in ('discovered','queued','running','waiting','succeeded','failed','cancelled','unknown')),
  trigger_type           text,
  retry_number           integer not null default 0 check (retry_number >= 0),
  started_at             timestamptz,
  stopped_at             timestamptz,
  duration_ms            integer not null default 0 check (duration_ms >= 0),
  failure_category       text,
  error_summary          text not null default '',
  last_node              text,
  correlation_id         text not null,
  trace_id               text not null,
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (runtime_registration_id, external_execution_id)
);
create index runtime_execution_workspace_idx on public.runtime_execution (workspace_id, created_at desc);
create index runtime_execution_deployment_idx on public.runtime_execution (deployment_id);

create table public.runtime_execution_attempt (
  id                 text primary key,
  runtime_execution_id text not null references public.runtime_execution (id) on delete cascade,
  deployment_id      text not null,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  attempt_number     integer not null default 1 check (attempt_number >= 1),
  status             text not null check (status in ('discovered','queued','running','waiting','succeeded','failed','cancelled','unknown')),
  failure_category   text,
  started_at         timestamptz,
  finished_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index runtime_execution_attempt_exec_idx on public.runtime_execution_attempt (runtime_execution_id, created_at);

create table public.runtime_execution_failure (
  id                 text primary key,
  runtime_execution_id text not null references public.runtime_execution (id) on delete cascade,
  deployment_id      text not null,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  category           text not null check (category in ('authentication','authorization','validation','unsupported','conflict','timeout','throttled','provider_unavailable','network','stale_version','approval_missing','approval_expired','package_mismatch','secret_unavailable','execution_failed','unknown')),
  retryable          boolean not null default false,
  message            text not null default '',
  provider_code      text,
  last_node          text,
  created_at         timestamptz not null default now()
);
create index runtime_execution_failure_exec_idx on public.runtime_execution_failure (runtime_execution_id, created_at desc);

-- ---- rollback request (versioned root) -------------------------------------
create table public.runtime_rollback_request (
  id                    text primary key,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  source_deployment_id  text not null references public.runtime_deployment (id) on delete cascade,
  target_deployment_id  text not null references public.runtime_deployment (id) on delete cascade,
  reason                text not null,
  requested_by_user_id  text not null,
  approval_reference_id text,
  status                text not null default 'requested' check (status in ('requested','approved','executing','completed','failed')),
  result_deployment_id  text,
  correlation_id        text not null,
  version               integer not null default 1 check (version > 0),
  created_at            timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index runtime_rollback_workspace_idx on public.runtime_rollback_request (workspace_id, created_at desc);

-- ---- webhook receipt + reconciliation (append-only) ------------------------
create table public.runtime_webhook_receipt (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  runtime_registration_id text not null references public.runtime_registration (id) on delete cascade,
  provider               text not null check (provider in ('n8n')),
  external_event_id      text not null,
  idempotency_key        text not null,
  signature_valid        boolean not null default false,
  status                 text not null default 'received' check (status in ('received','processed','rejected','duplicate')),
  received_at            timestamptz not null,
  processed_at           timestamptz,
  created_at             timestamptz not null default now()
);
create index runtime_webhook_receipt_key_idx on public.runtime_webhook_receipt (idempotency_key);
create index runtime_webhook_receipt_rt_idx on public.runtime_webhook_receipt (runtime_registration_id, created_at desc);

create table public.runtime_reconciliation (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  runtime_registration_id text not null references public.runtime_registration (id) on delete cascade,
  deployment_id          text,
  kind                   text not null check (kind in ('webhook','polling','manual')),
  drift_class            text not null default 'no_drift' check (drift_class in ('no_drift','metadata_drift','configuration_drift','destructive_drift','missing_provider_workflow')),
  expected_hash          text not null default '',
  provider_hash          text not null default '',
  detail                 text not null default '',
  created_at             timestamptz not null default now()
);
create index runtime_reconciliation_rt_idx on public.runtime_reconciliation (runtime_registration_id, created_at desc);
create index runtime_reconciliation_dep_idx on public.runtime_reconciliation (deployment_id, created_at desc);

-- ---- append-only enforcement (reuse the Phase D trigger fn) ----------------
do $$
declare t text;
begin
  foreach t in array array[
    'runtime_capability_snapshot','runtime_health_snapshot','runtime_deployment_attempt','runtime_deployment_event',
    'runtime_deployment_log','runtime_execution_attempt','runtime_execution_failure','runtime_webhook_receipt','runtime_reconciliation'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.bl_txexec_append_only()', t || '_no_mutation', t);
  end loop;
end $$;

-- ---- RLS -------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'runtime_registration','runtime_policy','runtime_credential_reference','runtime_capability_snapshot',
    'runtime_health_snapshot','runtime_deployment','runtime_deployment_attempt','runtime_deployment_event',
    'runtime_deployment_log','runtime_execution','runtime_execution_attempt','runtime_execution_failure',
    'runtime_rollback_request','runtime_webhook_receipt','runtime_reconciliation'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Internal builds + operates the runtime; a CLIENT may READ its own org's runtime
-- state (deployments/executions/logs) but never write. The credential REFERENCE is
-- INTERNAL-ONLY for both read and write (clients never see credential metadata).
create policy "runtime_registration_read" on public.runtime_registration for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "runtime_registration_write" on public.runtime_registration for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "runtime_policy_read" on public.runtime_policy for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "runtime_policy_write" on public.runtime_policy for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- Credential reference: internal-only (no client visibility of credential metadata).
create policy "runtime_credential_internal" on public.runtime_credential_reference for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- Deployment + execution + rollback roots: client reads own org; internal writes.
do $$
declare t text;
begin
  foreach t in array array['runtime_deployment','runtime_execution','runtime_rollback_request'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal())', t || '_write', t);
  end loop;
end $$;
-- Append-only history/logs/snapshots: client reads own org; internal inserts.
do $$
declare t text;
begin
  foreach t in array array[
    'runtime_capability_snapshot','runtime_health_snapshot','runtime_deployment_attempt','runtime_deployment_event',
    'runtime_deployment_log','runtime_execution_attempt','runtime_execution_failure','runtime_webhook_receipt','runtime_reconciliation'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;

-- ---- grants ----------------------------------------------------------------
grant select, insert, update, delete on public.runtime_registration to authenticated;
grant select, insert, update, delete on public.runtime_policy to authenticated;
grant select, insert, update, delete on public.runtime_credential_reference to authenticated;
grant select, insert, update, delete on public.runtime_deployment to authenticated;
grant select, insert, update, delete on public.runtime_execution to authenticated;
grant select, insert, update, delete on public.runtime_rollback_request to authenticated;
do $$
declare t text;
begin
  foreach t in array array[
    'runtime_capability_snapshot','runtime_health_snapshot','runtime_deployment_attempt','runtime_deployment_event',
    'runtime_deployment_log','runtime_execution_attempt','runtime_execution_failure','runtime_webhook_receipt','runtime_reconciliation'
  ] loop
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end $$;
