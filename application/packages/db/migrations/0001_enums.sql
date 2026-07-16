-- =============================================================================
-- 0001 — Enums
-- Every status enum is generated from packages/schema MACHINES. Postgres enums
-- mean an illegal status VALUE cannot be stored at all; the transition trigger
-- (0003) additionally prevents illegal status MOVES.
--
-- If you change a machine in packages/schema, add a migration here. schema wins.
-- =============================================================================

-- ---- roles & account status (packages/schema ROLES) -------------------------
create type public.app_role as enum (
  'owner',
  'admin',
  'team_member',
  'client_admin',
  'client_member'
);

create type public.user_account_status as enum ('invited', 'active', 'suspended');

-- ---- machine status enums ---------------------------------------------------
create type public.onboarding_status as enum (
  'not_started',
  'in_progress',
  'abandoned',
  'completed'
);

create type public.lead_stage as enum ('new', 'qualified', 'proposal_sent', 'won', 'lost');

create type public.client_lifecycle as enum (
  'prospect',
  'member',
  'client_active',
  'post_launch',
  'churned',
  'renewed'
);

create type public.proposal_status as enum (
  'draft',
  'sent',
  'viewed',
  'accepted',
  'change_requested',
  'revised',
  'expired'
);

create type public.contract_status as enum (
  'pending',
  'sent',
  'signed_client',
  'countersigned',
  'active',
  'voided'
);

create type public.invoice_status as enum (
  'draft',
  'sent',
  'pending',
  'paid',
  'overdue',
  'failed',
  'refunded'
);

create type public.payment_status as enum (
  'initiated',
  'processing',
  'succeeded',
  'failed',
  'pending_3ds'
);

create type public.project_status as enum (
  'created',
  'active',
  'paused',
  'delayed',
  'in_review',
  'completed',
  'post_launch'
);

create type public.milestone_status as enum (
  'pending',
  'in_progress',
  'waiting_client_approval',
  'revision_requested',
  'approved',
  'completed'
);

create type public.deliverable_status as enum (
  'draft',
  'submitted',
  'in_review',
  'approved',
  'revision_requested',
  'rejected',
  'final'
);

create type public.file_upload_status as enum ('queued', 'uploading', 'success', 'failed');

create type public.automation_status as enum ('active', 'running', 'success', 'failed', 'paused');

-- ---- non-machine bounded sets ----------------------------------------------
create type public.invoice_type as enum ('deposit', 'milestone', 'final', 'retainer');

-- Meeting has no state machine in schema.js — bounded set, not a machine.
create type public.meeting_status as enum ('scheduled', 'completed', 'cancelled');
