-- =============================================================================
-- 0002 — Core tables (the 18 canonical ENTITIES from packages/schema)
--
-- Conventions:
--   * ids are prefixed ULIDs stored as text (usr_, cli_, prj_ …) per handoff §02.1
--   * timestamps are timestamptz
--   * money is integer minor units (cents); currency is USD (single-currency MVP)
--   * columns are snake_case; the data layer maps to the camelCase TS types
--   * Client is the aggregate root — every client-scoped table carries client_id
--     so RLS can scope it (see 0004)
--
-- Auth linkage: public.users keeps the prefixed-ULID `id` from the handoff schema
-- and additionally links to Supabase Auth via `auth_user_id`.
-- =============================================================================

-- ---- Clients (aggregate root) ----------------------------------------------
create table public.clients (
  id                  text primary key,
  company             text not null,
  plan                text,
  mrr                 integer not null default 0,          -- cents
  lifecycle           public.client_lifecycle not null default 'prospect',
  health_score        numeric(5, 2),                        -- computed; never fabricated
  account_manager_id  text,
  created_at          timestamptz not null default now(),
  industry            text,
  seats               integer not null default 0,
  constraint clients_health_score_range check (
    health_score is null or (health_score >= 0 and health_score <= 100)
  )
);

-- ---- Users ------------------------------------------------------------------
create table public.users (
  id            text primary key,
  auth_user_id  uuid unique references auth.users (id) on delete cascade,
  name          text not null,
  email         text not null unique,
  role          public.app_role not null,
  client_id     text references public.clients (id) on delete cascade,  -- null for internal
  status        public.user_account_status not null default 'invited',
  avatar_url    text,
  last_active_at timestamptz,
  invited_at    timestamptz,
  accepted_at   timestamptz,
  -- Internal roles must not carry a client_id; client roles must.
  constraint users_role_scope check (
    (role in ('owner', 'admin', 'team_member') and client_id is null)
    or (role in ('client_admin', 'client_member') and client_id is not null)
  )
);

alter table public.clients
  add constraint clients_account_manager_fk
  foreign key (account_manager_id) references public.users (id) on delete set null;

create index users_client_id_idx on public.users (client_id);
create index users_auth_user_id_idx on public.users (auth_user_id);

-- ---- Leads ------------------------------------------------------------------
create table public.leads (
  id         text primary key,
  name       text not null,
  company    text,
  email      text not null,
  industry   text,
  value      integer not null default 0,                    -- cents
  stage      public.lead_stage not null default 'new',
  owner_id   text references public.users (id) on delete set null,
  source     text,
  created_at timestamptz not null default now()
);

create index leads_stage_idx on public.leads (stage);

-- ---- Assessments ------------------------------------------------------------
create table public.assessments (
  id              text primary key,
  client_id       text references public.clients (id) on delete cascade,
  answers         jsonb not null default '{}'::jsonb,
  scores          jsonb not null default '{}'::jsonb,
  health_score    numeric(5, 2),                            -- computed from answers
  recommendations jsonb not null default '[]'::jsonb,
  status          public.onboarding_status not null default 'not_started',
  submitted_at    timestamptz,
  constraint assessments_health_score_range check (
    health_score is null or (health_score >= 0 and health_score <= 100)
  )
);

create index assessments_client_id_idx on public.assessments (client_id);

-- ---- Configurations ---------------------------------------------------------
create table public.configurations (
  id            text primary key,
  client_id     text references public.clients (id) on delete cascade,
  assessment_id text references public.assessments (id) on delete set null,
  modules       jsonb not null default '[]'::jsonb,
  owned_assets  jsonb not null default '[]'::jsonb,         -- de-duplicates modules
  estimate_low  integer not null default 0,                 -- cents; ESTIMATE, not a quote
  estimate_high integer not null default 0,                 -- cents; ESTIMATE, not a quote
  status        public.onboarding_status not null default 'not_started',
  updated_at    timestamptz not null default now(),
  constraint configurations_estimate_range check (estimate_high >= estimate_low)
);

create index configurations_client_id_idx on public.configurations (client_id);

-- ---- Proposals --------------------------------------------------------------
create table public.proposals (
  id               text primary key,
  client_id        text not null references public.clients (id) on delete cascade,
  configuration_id text references public.configurations (id) on delete set null,
  line_items       jsonb not null default '[]'::jsonb,
  subtotal         integer not null default 0,              -- cents (binding)
  deposit          integer not null default 0,              -- cents (binding)
  total            integer not null default 0,              -- cents (binding)
  status           public.proposal_status not null default 'draft',
  sent_at          timestamptz,
  viewed_at        timestamptz,
  decided_at       timestamptz,
  change_note      text
);

create index proposals_client_id_idx on public.proposals (client_id);
create index proposals_status_idx on public.proposals (status);

-- ---- Contracts --------------------------------------------------------------
create table public.contracts (
  id               text primary key,
  proposal_id      text not null references public.proposals (id) on delete restrict,
  client_id        text not null references public.clients (id) on delete cascade,
  sow_url          text,
  client_signature text,
  countersignature text,
  status           public.contract_status not null default 'pending',
  signed_at        timestamptz
);

create index contracts_client_id_idx on public.contracts (client_id);

-- ---- Projects ---------------------------------------------------------------
create table public.projects (
  id          text primary key,
  client_id   text not null references public.clients (id) on delete cascade,
  name        text not null,
  status      public.project_status not null default 'created',
  progress    numeric(5, 2) not null default 0,             -- DERIVED from milestones
  start_date  timestamptz,
  target_date timestamptz,
  manager_id  text references public.users (id) on delete set null,
  constraint projects_progress_range check (progress >= 0 and progress <= 100)
);

create index projects_client_id_idx on public.projects (client_id);

-- ---- Invoices ---------------------------------------------------------------
create table public.invoices (
  id         text primary key,
  client_id  text not null references public.clients (id) on delete cascade,
  project_id text references public.projects (id) on delete set null,
  type       public.invoice_type not null,
  amount     integer not null,                              -- cents
  due_date   timestamptz,
  status     public.invoice_status not null default 'draft',
  issued_at  timestamptz,
  paid_at    timestamptz
);

create index invoices_client_id_idx on public.invoices (client_id);
create index invoices_status_idx on public.invoices (status);

-- ---- Payments ---------------------------------------------------------------
-- NEVER store PAN. Only last4 + method (handoff §11.4). Stripe holds the token.
create table public.payments (
  id             text primary key,
  invoice_id     text not null references public.invoices (id) on delete cascade,
  method         text,
  last4          text,
  amount         integer not null,                          -- cents
  status         public.payment_status not null default 'initiated',
  processed_at   timestamptz,
  failure_reason text,
  constraint payments_last4_shape check (last4 is null or last4 ~ '^[0-9]{4}$')
);

create index payments_invoice_id_idx on public.payments (invoice_id);

-- ---- Milestones -------------------------------------------------------------
create table public.milestones (
  id          text primary key,
  project_id  text not null references public.projects (id) on delete cascade,
  title       text not null,
  status      public.milestone_status not null default 'pending',
  "order"     integer not null default 0,                   -- user-reorderable
  due_date    timestamptz,
  approved_at timestamptz
);

create index milestones_project_id_idx on public.milestones (project_id);

-- ---- Deliverables -----------------------------------------------------------
create table public.deliverables (
  id           text primary key,
  project_id   text not null references public.projects (id) on delete cascade,
  milestone_id text references public.milestones (id) on delete set null,
  title        text not null,
  type         text,
  status       public.deliverable_status not null default 'draft',
  version      integer not null default 1,                  -- bumps on each revision
  file_url     text,
  feedback     text,
  submitted_at timestamptz,
  constraint deliverables_version_positive check (version >= 1)
);

create index deliverables_project_id_idx on public.deliverables (project_id);
create index deliverables_milestone_id_idx on public.deliverables (milestone_id);

-- ---- File uploads -----------------------------------------------------------
create table public.file_uploads (
  id             text primary key,
  owner_id       text not null references public.users (id) on delete cascade,
  deliverable_id text references public.deliverables (id) on delete cascade,
  name           text not null,
  size           bigint not null,
  mime           text not null,
  status         public.file_upload_status not null default 'queued',
  progress       numeric(5, 2) not null default 0,
  error          text,
  uploaded_at    timestamptz,
  constraint file_uploads_progress_range check (progress >= 0 and progress <= 100)
);

create index file_uploads_deliverable_id_idx on public.file_uploads (deliverable_id);

-- ---- Automations (n8n) ------------------------------------------------------
create table public.automations (
  id          text primary key,
  client_id   text references public.clients (id) on delete cascade,
  name        text not null,
  provider    text not null default 'n8n',
  trigger     text,
  status      public.automation_status not null default 'active',
  runs        integer not null default 0,
  last_run_at timestamptz,
  last_error  text
);

create index automations_client_id_idx on public.automations (client_id);

-- ---- Meetings ---------------------------------------------------------------
create table public.meetings (
  id           text primary key,
  client_id    text not null references public.clients (id) on delete cascade,
  title        text not null,
  type         text,
  start_at     timestamptz not null,
  duration_min integer not null default 30,
  attendees    jsonb not null default '[]'::jsonb,
  status       public.meeting_status not null default 'scheduled',
  join_url     text
);

create index meetings_client_id_idx on public.meetings (client_id);

-- ---- Notifications ----------------------------------------------------------
create table public.notifications (
  id         text primary key,
  user_id    text not null references public.users (id) on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  entity_ref text,                                          -- deep-link to source entity
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_idx on public.notifications (user_id, read);

-- ---- Messages ---------------------------------------------------------------
create table public.messages (
  id          text primary key,
  thread_id   text not null,
  author_id   text not null references public.users (id) on delete cascade,
  client_id   text not null references public.clients (id) on delete cascade,
  body        text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);
create index messages_client_id_idx on public.messages (client_id);

-- ---- Consents (GDPR/CCPA audit trail; append-only) --------------------------
create table public.consents (
  id        text primary key,
  user_id   text not null references public.users (id) on delete cascade,
  type      text not null,                                  -- cookie | marketing | terms
  granted   boolean not null,
  version   text not null,
  timestamp timestamptz not null default now(),
  ip        inet
);

create index consents_user_id_idx on public.consents (user_id);
