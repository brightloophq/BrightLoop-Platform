-- =============================================================================
-- Lead-owned prospect scans.
--
-- A runtime scan has exactly one commercial subject: either an existing client
-- organisation or a pre-client lead. Runtime child records continue to inherit
-- scope through run_id; no lead identifier is duplicated across the pipeline.
-- =============================================================================

alter table public.intelligence_runs
  add column lead_id text references public.leads (id) on delete restrict;

alter table public.intelligence_runs
  add constraint intelligence_runs_exactly_one_subject check (
    (client_id is not null and lead_id is null)
    or (client_id is null and lead_id is not null)
  );

create index intelligence_runs_lead_idx
  on public.intelligence_runs (lead_id, created_at desc)
  where lead_id is not null;

comment on column public.intelligence_runs.lead_id is
  'Pre-client scan subject. Exactly one of client_id or lead_id is populated.';
