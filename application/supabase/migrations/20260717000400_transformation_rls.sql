-- =============================================================================
-- 0027 — Transformation domain: Row Level Security (Sprint 1B).
--
-- Isolation model (Product Bible Ch 05 IA + Ch 12):
--   * INTERNAL-ONLY (Command Center): signals, insights, recommendations, moves,
--     execution_records, measurements, learnings, operational_risks,
--     knowledge_assets. Reuses bl_is_internal(); NO client policy → clients denied
--     by default (same shape as internal_notes / quote_revisions).
--   * CLIENT-READABLE (own org) + internal: business_health, transformation_index
--     (Transformation Progress) and approvals (a client sees approvals for its own
--     org). Clients get SELECT only; writes stay internal. A client-side approval
--     GRANT path is a SECURITY DEFINER RPC deferred to the services sprint (same
--     pattern as bl_client_quote_action) — no broad client UPDATE policy here.
--
-- All twelve tenant-owned tables get RLS ENABLED. Uses existing helpers
-- bl_is_internal() / bl_client_id(). Additive; recovery: `drop policy ...` +
-- `alter table ... disable row level security`.
-- =============================================================================

alter table public.signals              enable row level security;
alter table public.insights             enable row level security;
alter table public.recommendations      enable row level security;
alter table public.approvals            enable row level security;
alter table public.moves                enable row level security;
alter table public.execution_records    enable row level security;
alter table public.measurements         enable row level security;
alter table public.learnings            enable row level security;
alter table public.business_health      enable row level security;
alter table public.transformation_index enable row level security;
alter table public.operational_risks    enable row level security;
alter table public.knowledge_assets     enable row level security;

-- ---- Internal-only operational tables (clients denied by absence of policy) --
create policy "signals_internal_all" on public.signals
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "insights_internal_all" on public.insights
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "recommendations_internal_all" on public.recommendations
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "moves_internal_all" on public.moves
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "execution_records_internal_all" on public.execution_records
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "measurements_internal_all" on public.measurements
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "learnings_internal_all" on public.learnings
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "operational_risks_internal_all" on public.operational_risks
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

create policy "knowledge_assets_internal_all" on public.knowledge_assets
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

-- ---- approvals: internal full + client reads its own org's approvals --------
create policy "approvals_read" on public.approvals
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "approvals_write_internal" on public.approvals
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

-- ---- business_health: internal full + client reads its own progress ---------
create policy "business_health_read" on public.business_health
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "business_health_write_internal" on public.business_health
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());

-- ---- transformation_index: internal full + client reads its own progress ----
create policy "transformation_index_read" on public.transformation_index
  for select to authenticated
  using (public.bl_is_internal() or client_id = public.bl_client_id());

create policy "transformation_index_write_internal" on public.transformation_index
  for all to authenticated
  using (public.bl_is_internal()) with check (public.bl_is_internal());
