-- =============================================================================
-- 0024 — Transformation domain: enums (Sprint 1B, Auxion Product Bible Ch 09).
--
-- Status enum values MIRROR packages/schema MACHINES (Sprint 1A). Keep in sync:
-- packages/schema is the source of truth; these enums + state_transitions are
-- generated from it.
--
-- Additive & non-destructive: creates new types only. No existing type or table
-- is altered. Recovery (manual): `drop type if exists public.<name> cascade;` for
-- each type below, after dropping the transformation tables (migration 0025).
-- =============================================================================

-- Lifecycle status enums (one per machine).
create type public.signal_status           as enum ('detected', 'validated', 'prioritized', 'archived');
create type public.insight_status          as enum ('generated', 'endorsed', 'dismissed');
create type public.recommendation_status   as enum ('proposed', 'adjusted', 'accepted', 'rejected');
create type public.approval_decision       as enum ('pending', 'granted', 'denied');
create type public.move_status             as enum ('draft', 'recommended', 'approved', 'executing', 'completed', 'measured');
create type public.execution_record_status as enum ('queued', 'running', 'succeeded', 'failed');
create type public.operational_risk_status as enum ('identified', 'assessed', 'mitigating', 'mitigated', 'accepted', 'dismissed');
create type public.knowledge_asset_status  as enum ('draft', 'published', 'deprecated');

-- Bounded classification enums.
create type public.approval_subject_type   as enum ('move', 'operational_risk', 'recommendation');
create type public.risk_severity           as enum ('low', 'medium', 'high', 'critical');
create type public.risk_likelihood         as enum ('rare', 'unlikely', 'possible', 'likely', 'almost_certain');
create type public.knowledge_asset_kind    as enum ('playbook', 'lesson', 'best_practice', 'policy', 'reference');
