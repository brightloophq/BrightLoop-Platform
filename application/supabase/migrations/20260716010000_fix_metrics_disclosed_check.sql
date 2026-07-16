-- =============================================================================
-- 0008 — Fix: the metrics disclosure CHECK never actually fired.
--
-- THE BUG
--   0700_reputation.sql declared:
--       check (jsonb_typeof(metrics -> 'disclosed') = 'boolean')
--   intending "every project must state its disclosure posture".
--
--   It does not do that. When the key is ABSENT, `metrics -> 'disclosed'` is
--   SQL NULL, `jsonb_typeof(NULL)` is NULL, and `NULL = 'boolean'` evaluates to
--   NULL — which a CHECK constraint treats as PASSING (constraints reject only
--   on an explicit FALSE). So a row could be inserted with
--   metrics = {"leadsGenerated": 500} and no disclosure posture at all.
--
--   Verified against the live database: that insert succeeded.
--
-- WHY IT MATTERS
--   The application was never unsafe — toPortfolioProject() defaults `disclosed`
--   to false for anything it cannot parse, and disclosedMetrics() returns [] on
--   that. But the DEFENCE-IN-DEPTH claim was false: the database was not
--   enforcing what its constraint name promised, so the only thing standing
--   between a malformed row and a published number was application code.
--
-- THE FIX
--   `metrics ? 'disclosed'` tests key EXISTENCE and returns a real boolean, so
--   an absent key now yields FALSE and the row is rejected. Keep the type test
--   too, so `{"disclosed": "yes"}` is still refused.
--
-- Existing rows: none are affected — the table is empty, and any future row
-- missing the key would have been read as undisclosed anyway.
-- =============================================================================

alter table public.portfolio_projects
  drop constraint if exists portfolio_projects_metrics_disclosed;

alter table public.portfolio_projects
  add constraint portfolio_projects_metrics_disclosed
  check (
    metrics ? 'disclosed'
    and jsonb_typeof(metrics -> 'disclosed') = 'boolean'
  );

comment on constraint portfolio_projects_metrics_disclosed on public.portfolio_projects is
  'Every project must state its disclosure posture explicitly. `metrics ? ''disclosed''` tests key existence — a bare jsonb_typeof() comparison passes on NULL and does not enforce this.';
