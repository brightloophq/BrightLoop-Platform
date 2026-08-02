-- =============================================================================
-- Phase F · Sprint F4.1 — Integration Platform Foundation. ADDITIVE ONLY.
-- Eight new tables for the CONNECTOR framework every external service plugs into:
-- a tenant-scoped installation of a connector, its secret REFERENCES, health
-- snapshots, OAuth grants, webhook receipts, polling cursors, translated events,
-- and a lifecycle audit log. AUXION REMAINS THE SYSTEM OF RECORD. NO raw secret
-- is ever stored — secret/oauth rows carry only a reference + validation posture,
-- and their mutation is INTERNAL-ONLY. The connector CATALOGUE (marketplace) lives
-- in code (domain CONNECTOR_REGISTRY), not in a table. No prior table is touched.
-- =============================================================================

-- ---- connector installation (versioned root) -------------------------------
create table public.connector_installation (
  id                     text primary key,
  workspace_id           text not null,
  client_id              text references public.clients (id) on delete cascade,
  connector_id           text not null,
  display_name           text not null,
  status                 text not null default 'pending_configuration' check (status in ('pending_configuration','configuring','validating','connected','degraded','disabled','error','revoked')),
  auth_method            text not null check (auth_method in ('none','api_key','basic','oauth2')),
  trigger_kind           text not null default 'none' check (trigger_kind in ('webhook','polling','none')),
  config                 jsonb not null default '{}'::jsonb,
  enabled_capabilities   jsonb not null default '[]'::jsonb,
  secret_reference_id    text,
  health_level           text not null default 'unknown' check (health_level in ('healthy','degraded','unavailable','unauthorized','unknown')),
  last_health_check_at   timestamptz,
  webhook_endpoint_id    text,
  polling_cursor         text,
  created_by_user_id     text not null,
  correlation_id         text not null,
  idempotency_key        text not null,
  version                integer not null default 1 check (version > 0),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (idempotency_key),
  unique (workspace_id, connector_id)
);
create index connector_installation_workspace_idx on public.connector_installation (workspace_id, created_at desc);
create index connector_installation_client_idx on public.connector_installation (client_id);
create index connector_installation_connector_idx on public.connector_installation (connector_id);
comment on table public.connector_installation is 'Phase F F4.1: a tenant-scoped installation of a connector (versioned; Auxion is the system of record).';

-- ---- secret reference (mutable root; INTERNAL-ONLY mutation) ----------------
create table public.connector_secret_reference (
  id                       text primary key,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  connector_id             text not null,
  purpose                  text not null check (purpose in ('credential','oauth_token','webhook_signing')),
  secret_ref               text not null,
  secret_version           text not null default '1',
  metadata                 jsonb not null default '{}'::jsonb,
  validation_state         text not null default 'unverified' check (validation_state in ('unverified','valid','invalid','expired','revoked')),
  rotated_at               timestamptz,
  expires_at               timestamptz,
  created_by_user_id       text not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index connector_secret_reference_inst_idx on public.connector_secret_reference (connector_installation_id);
comment on table public.connector_secret_reference is 'Phase F F4.1: a REFERENCE to a connector secret (never the secret); internal-only mutation.';

-- ---- health snapshot (append-only) -----------------------------------------
create table public.connector_health_snapshot (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  level                    text not null check (level in ('healthy','degraded','unavailable','unauthorized','unknown')),
  latency_ms               integer not null default 0 check (latency_ms >= 0),
  detail                   jsonb not null default '{}'::jsonb,
  checked_at               timestamptz not null,
  created_at               timestamptz not null default now()
);
create index connector_health_snapshot_inst_idx on public.connector_health_snapshot (connector_installation_id, created_at desc);

-- ---- translated event (append-only; idempotent) ----------------------------
create table public.connector_event (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  connector_id             text not null,
  type                     text not null,
  external_id              text not null,
  source                   text not null check (source in ('webhook','polling','manual')),
  status                   text not null default 'translated' check (status in ('received','translated','rejected','duplicate')),
  occurred_at              timestamptz not null,
  ingested_at              timestamptz not null,
  idempotency_key          text not null,
  payload                  jsonb not null default '{}'::jsonb,
  provenance               text not null default '',
  created_at               timestamptz not null default now(),
  unique (idempotency_key)
);
create index connector_event_inst_idx on public.connector_event (connector_installation_id, created_at desc);
create index connector_event_key_idx on public.connector_event (idempotency_key);

-- ---- webhook receipt (append-only; idempotent) -----------------------------
create table public.connector_webhook_receipt (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  connector_id             text not null,
  external_event_id        text not null,
  idempotency_key          text not null,
  signature_valid          boolean not null default false,
  status                   text not null default 'received' check (status in ('received','verified','processed','rejected','duplicate')),
  event_count              integer not null default 0 check (event_count >= 0),
  received_at              timestamptz not null,
  processed_at             timestamptz,
  created_at               timestamptz not null default now(),
  unique (idempotency_key)
);
create index connector_webhook_receipt_inst_idx on public.connector_webhook_receipt (connector_installation_id, created_at desc);
create index connector_webhook_receipt_key_idx on public.connector_webhook_receipt (idempotency_key);

-- ---- polling cursor (append-only; idempotent) ------------------------------
create table public.connector_polling_cursor (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  from_cursor              text,
  to_cursor                text,
  event_count              integer not null default 0 check (event_count >= 0),
  sequence                 integer not null default 0 check (sequence >= 0),
  idempotency_key          text not null,
  polled_at                timestamptz not null,
  created_at               timestamptz not null default now(),
  unique (idempotency_key)
);
create index connector_polling_cursor_inst_idx on public.connector_polling_cursor (connector_installation_id, created_at desc);

-- ---- oauth grant (mutable root; INTERNAL-ONLY) -----------------------------
create table public.connector_oauth_grant (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  connector_id             text not null,
  status                   text not null default 'pending' check (status in ('pending','authorized','exchanged','failed','expired')),
  state_token              text not null,
  scopes                   jsonb not null default '[]'::jsonb,
  redirect_uri             text not null,
  secret_reference_id      text,
  authorization_url        text not null default '',
  expires_at               timestamptz,
  created_by_user_id       text not null,
  version                  integer not null default 1 check (version > 0),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (state_token)
);
create index connector_oauth_grant_inst_idx on public.connector_oauth_grant (connector_installation_id, created_at desc);

-- ---- audit event (append-only) ---------------------------------------------
create table public.connector_audit_event (
  id                       text primary key,
  connector_installation_id text not null references public.connector_installation (id) on delete cascade,
  workspace_id             text not null,
  client_id                text references public.clients (id) on delete cascade,
  operation                text not null check (operation in ('install','configure','enable','disable','revoke','validate','health_check','rotate_secret','oauth_begin','oauth_complete','webhook_ingest','poll')),
  from_status              text,
  to_status                text,
  actor_user_id            text,
  summary                  text not null default '',
  correlation_id           text not null,
  created_at               timestamptz not null default now()
);
create index connector_audit_event_inst_idx on public.connector_audit_event (connector_installation_id, created_at desc);

-- ---- append-only enforcement (reuse the Phase D trigger fn) ----------------
do $$
declare t text;
begin
  foreach t in array array[
    'connector_health_snapshot','connector_event','connector_webhook_receipt','connector_polling_cursor','connector_audit_event'
  ] loop
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.bl_txexec_append_only()', t || '_no_mutation', t);
  end loop;
end $$;

-- ---- RLS -------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'connector_installation','connector_secret_reference','connector_health_snapshot','connector_event',
    'connector_webhook_receipt','connector_polling_cursor','connector_oauth_grant','connector_audit_event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Internal builds + operates connectors; a CLIENT may READ its own org's connector
-- state (installations, events, health, receipts, cursors, audit) but never write.
-- Secret references and OAuth grants are INTERNAL-ONLY for both read and write —
-- clients never see credential/token metadata.
create policy "connector_installation_read" on public.connector_installation for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "connector_installation_write" on public.connector_installation for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "connector_secret_reference_internal" on public.connector_secret_reference for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "connector_oauth_grant_internal" on public.connector_oauth_grant for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- Append-only history/snapshots/events: client reads own org; internal inserts.
do $$
declare t text;
begin
  foreach t in array array[
    'connector_health_snapshot','connector_event','connector_webhook_receipt','connector_polling_cursor','connector_audit_event'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;

-- ---- grants ----------------------------------------------------------------
grant select, insert, update, delete on public.connector_installation to authenticated;
grant select, insert, update, delete on public.connector_secret_reference to authenticated;
grant select, insert, update, delete on public.connector_oauth_grant to authenticated;
do $$
declare t text;
begin
  foreach t in array array[
    'connector_health_snapshot','connector_event','connector_webhook_receipt','connector_polling_cursor','connector_audit_event'
  ] loop
    execute format('grant select, insert on public.%I to authenticated', t);
  end loop;
end $$;

grant all on public.connector_installation to service_role;
grant all on public.connector_secret_reference to service_role;
grant all on public.connector_oauth_grant to service_role;
grant all on public.connector_health_snapshot to service_role;
grant all on public.connector_event to service_role;
grant all on public.connector_webhook_receipt to service_role;
grant all on public.connector_polling_cursor to service_role;
grant all on public.connector_audit_event to service_role;
