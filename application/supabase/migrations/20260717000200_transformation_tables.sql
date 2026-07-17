-- =============================================================================
-- 0025 — Transformation domain: tables, FKs, indexes, checks (Sprint 1B).
--
-- The transformation cycle (Ch 09): Signal → Insight → Recommendation → Approval
-- → Move → Execution → Measurement → Learning, plus Business Health,
-- Transformation Index, Operational Risk, Knowledge Asset.
--
-- Conventions (mirror existing agency-domain tables — do NOT diverge):
--   id text primary key (app-generated prefixed id); client_id is the tenant
--   boundary (references clients on delete cascade); created_by references users
--   on delete set null; created_at timestamptz default now(). Reuses clients +
--   users; no existing table is altered or dropped.
--
-- Additive & non-destructive. Recovery (manual, reverse order): drop the tables
-- below (they cascade to their children), then the enums (migration 0024).
-- RLS lands in 0027; transitions/guards in 0026.
-- =============================================================================

-- ---- 1. signals -------------------------------------------------------------
create table public.signals (
  id         text primary key,
  client_id  text not null references public.clients (id) on delete cascade,
  title      text not null,
  detail     text,
  status     public.signal_status not null default 'detected',
  source_ref text,                                  -- where the signal came from
  evidence   jsonb not null default '[]'::jsonb,    -- EvidenceItem[]
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.signals is
  'A detected condition worth attention (transformation cycle, Ch 09). Internal/Command Center only.';
create index signals_client_idx  on public.signals (client_id);
create index signals_status_idx  on public.signals (client_id, status);
create index signals_created_idx on public.signals (client_id, created_at desc);

-- ---- 2. insights ------------------------------------------------------------
create table public.insights (
  id         text primary key,
  client_id  text not null references public.clients (id) on delete cascade,
  signal_id  text not null references public.signals (id) on delete cascade,
  summary    text not null,
  detail     text,
  status     public.insight_status not null default 'generated',
  evidence   jsonb not null default '[]'::jsonb,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.insights is 'Interpreted meaning of a signal. Internal only.';
create index insights_client_idx on public.insights (client_id);
create index insights_signal_idx on public.insights (signal_id);
create index insights_status_idx on public.insights (client_id, status);

-- ---- 3. recommendations -----------------------------------------------------
create table public.recommendations (
  id                text primary key,
  client_id         text not null references public.clients (id) on delete cascade,
  insight_id        text not null references public.insights (id) on delete cascade,
  summary           text not null,
  rationale         text not null,                       -- the "why" (Ch 10: always explain)
  expected_outcome  text,
  status            public.recommendation_status not null default 'proposed',
  evidence          jsonb not null default '[]'::jsonb,
  confidence        numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- AI provenance (optional — a human-authored recommendation leaves these null).
  ai_provider       text,
  ai_model          text,
  ai_prompt_version text,
  ai_generated_at   timestamptz,
  ai_confidence     numeric(4, 3) check (ai_confidence is null or (ai_confidence >= 0 and ai_confidence <= 1)),
  ai_params         jsonb,
  ai_generation_id  text,                                -- link to a future ai_generations record
  created_by        text references public.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.recommendations is
  'A proposed Move for an insight, with evidence + optional AI provenance (Ch 10). AI is never mandatory. Internal only.';
create index recommendations_client_idx  on public.recommendations (client_id);
create index recommendations_insight_idx on public.recommendations (insight_id);
create index recommendations_status_idx  on public.recommendations (client_id, status);

-- ---- 4. approvals (the explicit human-authorization record) -----------------
create table public.approvals (
  id               text primary key,
  client_id        text not null references public.clients (id) on delete cascade,
  subject_type     public.approval_subject_type not null,   -- what is being authorized
  subject_id       text not null,                            -- polymorphic (no cross-table FK)
  decision         public.approval_decision not null default 'pending',
  approver_user_id text references public.users (id) on delete set null,
  reason           text,
  requested_at     timestamptz not null default now(),
  decided_at       timestamptz,
  created_by       text references public.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  -- A decided approval MUST name its approver and time (human authority in data).
  constraint approvals_decided_complete check (
    decision = 'pending'
    or (approver_user_id is not null and decided_at is not null)
  )
);
comment on table public.approvals is
  'First-class human-authorization record (never a boolean). Every consequential Move references a granted approval.';
create index approvals_subject_idx  on public.approvals (subject_type, subject_id);
create index approvals_client_idx   on public.approvals (client_id);
create index approvals_approver_idx on public.approvals (approver_user_id);

-- ---- 5. moves ---------------------------------------------------------------
create table public.moves (
  id                text primary key,
  client_id         text not null references public.clients (id) on delete cascade,
  title             text not null,
  intent            text not null,
  expected_outcome  text,
  status            public.move_status not null default 'draft',
  recommendation_id text references public.recommendations (id) on delete set null,  -- may be direct
  approval_id       text references public.approvals (id) on delete set null,        -- required to execute (0026 gate)
  created_by        text references public.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
comment on table public.moves is
  'The unit of transformation. Cannot enter executing without a granted approval (DB gate in 0026). Internal only.';
create index moves_client_idx    on public.moves (client_id);
create index moves_status_idx    on public.moves (client_id, status);
create index moves_reco_idx      on public.moves (recommendation_id);
create index moves_approval_idx  on public.moves (approval_id);

-- ---- 6. execution_records (idempotent, async-safe) --------------------------
create table public.execution_records (
  id              text primary key,
  client_id       text not null references public.clients (id) on delete cascade,
  move_id         text not null references public.moves (id) on delete cascade,
  status          public.execution_record_status not null default 'queued',
  idempotency_key text,                                -- unique when set (retry-safe)
  attempts        integer not null default 0,
  last_error      text,
  started_at      timestamptz,
  finished_at     timestamptz,
  created_by      text references public.users (id) on delete set null,
  created_at      timestamptz not null default now()
);
comment on table public.execution_records is
  'Durable record of an approved Move being carried out. idempotency_key makes retried/external execution safe. Internal only.';
create index execution_records_client_idx on public.execution_records (client_id);
create index execution_records_move_idx   on public.execution_records (move_id);
create index execution_records_status_idx on public.execution_records (client_id, status);
create unique index execution_records_idempotency_idx
  on public.execution_records (idempotency_key) where idempotency_key is not null;

-- ---- 7. measurements (append-only fact) -------------------------------------
create table public.measurements (
  id          text primary key,
  client_id   text not null references public.clients (id) on delete cascade,
  move_id     text not null references public.moves (id) on delete cascade,
  metric_key  text not null,
  target      numeric,
  observed    numeric not null,
  delta       numeric,
  unit        text,
  measured_at timestamptz not null,
  created_by  text references public.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
comment on table public.measurements is 'A Move''s measured result vs its promised outcome. Internal only.';
create index measurements_client_idx on public.measurements (client_id);
create index measurements_move_idx   on public.measurements (move_id);
create index measurements_time_idx   on public.measurements (client_id, measured_at desc);

-- ---- 8. learnings (append-only record) --------------------------------------
create table public.learnings (
  id             text primary key,
  client_id      text not null references public.clients (id) on delete cascade,
  summary        text not null,
  detail         text,
  move_id        text references public.moves (id) on delete set null,
  measurement_id text references public.measurements (id) on delete set null,
  captured_at    timestamptz not null,
  created_by     text references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
comment on table public.learnings is 'A captured lesson from a measured Move (closes the cycle). Internal only.';
create index learnings_client_idx on public.learnings (client_id);
create index learnings_move_idx   on public.learnings (move_id);

-- ---- 9. business_health (append-only snapshot; client-readable) -------------
create table public.business_health (
  id          text primary key,
  client_id   text not null references public.clients (id) on delete cascade,
  dimensions  jsonb not null default '{}'::jsonb,   -- dimension → score
  score       numeric(5, 2) not null check (score >= 0 and score <= 100),
  basis       text,
  captured_at timestamptz not null,
  created_at  timestamptz not null default now()
);
comment on table public.business_health is
  'Point-in-time dimensional health snapshot. Client-readable (Transformation Progress). No single metric determines it (Ch 09).';
create index business_health_client_time_idx on public.business_health (client_id, captured_at desc);

-- ---- 10. transformation_index (append-only series; client-readable) ---------
create table public.transformation_index (
  id         text primary key,
  client_id  text not null references public.clients (id) on delete cascade,
  value      numeric not null,
  delta      numeric,
  basis      text,
  at         timestamptz not null,
  created_at timestamptz not null default now()
);
comment on table public.transformation_index is
  'Directional transformation progress over time. Client-readable (Transformation Progress).';
create index transformation_index_client_time_idx on public.transformation_index (client_id, at desc);

-- ---- 11. operational_risks --------------------------------------------------
create table public.operational_risks (
  id            text primary key,
  client_id     text not null references public.clients (id) on delete cascade,
  title         text not null,
  detail        text,
  status        public.operational_risk_status not null default 'identified',
  severity      public.risk_severity not null,
  likelihood    public.risk_likelihood not null,
  signal_id     text references public.signals (id) on delete set null,
  move_id       text references public.moves (id) on delete set null,
  owner_user_id text references public.users (id) on delete set null,
  evidence      jsonb not null default '[]'::jsonb,
  created_by    text references public.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
comment on table public.operational_risks is
  'A condition that may negatively affect the business (Ch 09). Treatment is approval-gated. Internal only.';
create index operational_risks_client_idx on public.operational_risks (client_id);
create index operational_risks_status_idx on public.operational_risks (client_id, status);
create index operational_risks_signal_idx on public.operational_risks (signal_id);
create index operational_risks_move_idx   on public.operational_risks (move_id);

-- ---- 12. knowledge_assets (client_id nullable = platform-level) -------------
create table public.knowledge_assets (
  id         text primary key,
  client_id  text references public.clients (id) on delete cascade,  -- NULL = platform/shared
  title      text not null,
  kind       public.knowledge_asset_kind not null,
  body       text not null,
  status     public.knowledge_asset_status not null default 'draft',
  source_ref text,
  created_by text references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.knowledge_assets is
  'Reusable curated transformation knowledge (Ch 13). client_id NULL = platform-level/shared. Internal only for now.';
create index knowledge_assets_client_idx on public.knowledge_assets (client_id);
create index knowledge_assets_status_idx on public.knowledge_assets (status);
create index knowledge_assets_kind_idx   on public.knowledge_assets (kind);
