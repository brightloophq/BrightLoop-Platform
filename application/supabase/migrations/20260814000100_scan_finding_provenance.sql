-- =============================================================================
-- 20260814000100 — Where a diagnosis finding came from.
--
-- Importing a prospect scan ADDED findings and never retired them, so the
-- ledger only ever grew. A client whose site had since been fixed could show a
-- Sales score of 81 sitting directly above "Minimal social footprint · Observed
-- 0/100" — two different scans presented as one diagnosis, with nothing on the
-- page to say so.
--
-- Fixing that needs one fact the table never recorded: whether a row was typed
-- by a person or copied from a scan. Without it, "replace the previous import"
-- cannot be told apart from "delete someone's work".
--
-- BACKFILL: every existing row becomes 'manual'.
--   We genuinely cannot know which of them came from an import — the
--   distinction did not exist when they were written. Defaulting to 'manual'
--   means an old imported row may linger until someone removes it by hand,
--   which is the mistake worth making: a stale row is visible and removable,
--   a deleted hand-written finding is neither.
--
-- `source_run_id` records WHICH scan a row came from. No foreign key: scan runs
-- live in the Phase B runtime tables and a finding must survive one being
-- pruned. It is provenance, not a relationship.
-- =============================================================================

create type public.finding_source as enum ('manual', 'import');

alter table public.scan_findings
  add column source public.finding_source not null default 'manual';

alter table public.scan_findings
  add column source_run_id text;

-- A finding is only ever imported BY a scan, never manually from one.
alter table public.scan_findings
  add constraint scan_findings_source_run check (
    source = 'import' or source_run_id is null
  );

-- The reconcile reads (scan_id, source) to find the previous import's rows.
create index scan_findings_scan_source_idx on public.scan_findings (scan_id, source);

comment on column public.scan_findings.source is
  'manual = typed by a person in the admin; import = copied from a prospect scan. Only import rows are retired when a newer scan is imported.';

comment on column public.scan_findings.source_run_id is
  'The scan run this row was imported from. Provenance only — no FK, so a finding outlives the run that produced it.';
