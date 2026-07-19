-- =============================================================================
-- Phase 1 — core surfaces: Business Scan / Activation / Domains (PDFs 01–03).
--
-- ADDITIVE ONLY. Nothing existing is altered. Internal-only RLS (these are
-- /admin surfaces). Human/system-entered data — the Auxiliary engine is deferred.
--
-- ⚠️ After this migration, regenerate packages/db/generated/database.types.ts via
--    the Supabase/Docker db-verify loop (CI). The typed read/write adapters for
--    these tables depend on the regenerated types (no cast/any, per convention).
-- =============================================================================

-- ---- enums ------------------------------------------------------------------
create type public.domain_key as enum ('web', 'sales', 'crm', 'operations', 'delivery', 'analytics', 'ai');
create type public.domain_status as enum ('not_operating', 'assembling', 'operating');
create type public.scan_status as enum ('diagnosing', 'diagnosed', 'activating', 'operating');
create type public.finding_priority as enum ('low', 'medium', 'high');

-- ---- business_scans: a Diagnose-stage baseline per client -------------------
create table public.business_scans (
  id             text primary key,
  client_id      text not null references public.clients (id) on delete cascade,
  status         public.scan_status not null default 'diagnosing',
  baseline_index smallint not null check (baseline_index between 0 and 100),
  target_index   smallint not null default 92 check (target_index between 0 and 100),
  created_by     text references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index business_scans_client_idx on public.business_scans (client_id);

-- ---- business_domains: the seven System Map nodes per client ----------------
create table public.business_domains (
  id             text primary key,
  client_id      text not null references public.clients (id) on delete cascade,
  key            public.domain_key not null,
  status         public.domain_status not null default 'not_operating',
  baseline_score smallint check (baseline_score between 0 and 100),
  current_score  smallint check (current_score between 0 and 100),
  created_at     timestamptz not null default now(),
  unique (client_id, key)
);
create index business_domains_client_idx on public.business_domains (client_id);

-- ---- scan_findings: per-domain diagnosis ledger rows ------------------------
create table public.scan_findings (
  id         text primary key,
  scan_id    text not null references public.business_scans (id) on delete cascade,
  client_id  text not null references public.clients (id) on delete cascade,
  domain_key public.domain_key not null,
  finding    text not null,
  baseline   text,
  priority   public.finding_priority not null default 'medium',
  created_at timestamptz not null default now()
);
create index scan_findings_scan_idx on public.scan_findings (scan_id);
create index scan_findings_client_idx on public.scan_findings (client_id);

-- ---- RLS: internal-only (mirrors signals/insights) --------------------------
alter table public.business_scans   enable row level security;
alter table public.business_domains enable row level security;
alter table public.scan_findings    enable row level security;

create policy "business_scans_internal_all" on public.business_scans
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "business_domains_internal_all" on public.business_domains
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "scan_findings_internal_all" on public.scan_findings
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

-- ---- grants (table privileges precede RLS; policies are the real boundary) --
grant select, insert, update, delete on public.business_scans   to authenticated;
grant select, insert, update, delete on public.business_domains to authenticated;
grant select, insert, update, delete on public.scan_findings    to authenticated;
grant all on public.business_scans   to service_role;
grant all on public.business_domains to service_role;
grant all on public.scan_findings    to service_role;
