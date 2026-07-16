-- =============================================================================
-- 0021 — Capture the discovery context the strategist needs (Sprint 5R spec §5).
--
-- The funnel now asks the prospect for their desired timeline, budget comfort
-- range, and free-text notes. These are the PROSPECT'S OWN inputs (not our
-- pricing), so they live on `configurations` and are readable by the owning
-- client — unlike pricing_estimates, which is internal-only.
-- =============================================================================
alter table public.configurations add column if not exists timeline    text;
alter table public.configurations add column if not exists budget_band text;
alter table public.configurations add column if not exists notes       text;

comment on column public.configurations.budget_band is
  'Prospect-stated budget comfort range (their input) — context for the strategist, never a BrightLoop price.';
