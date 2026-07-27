-- =============================================================================
-- Phase E · Sprint E6 — AI Reporting & Business Intelligence: executive reports
-- + observations, metrics, KPI results, trends, forecasts, insights, executive
-- summaries, sections, narratives, schedules, feedback. ADDITIVE ONLY. Twelve new
-- tables. The executive report is versioned; the schedule is mutable; every
-- observation / metric / KPI / trend / forecast / insight / summary / section /
-- narrative / feedback record is append-only. This layer OBSERVES upstream
-- outputs (Phase D + E1–E5) via their application services — it never executes,
-- regenerates strategy, plans, schedules external jobs, or sends anything.
-- No prior table is touched.
-- =============================================================================

create table public.executive_report (
  id                    text primary key,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  kind                  text not null check (kind in ('executive_summary','operational','automation','strategy_progress','execution_progress','kpi_dashboard','risk','workspace_health','weekly_summary','monthly_summary')),
  title                 text not null,
  period                text not null default '',
  status                text not null default 'draft' check (status in ('draft','generating','generated','published','failed','archived')),
  requested_by_user_id  text not null,
  provider              text,
  model                 text,
  prompt_id             text,
  collection_duration_ms integer not null default 0 check (collection_duration_ms >= 0),
  analysis_duration_ms  integer not null default 0 check (analysis_duration_ms >= 0),
  ai_duration_ms        integer not null default 0 check (ai_duration_ms >= 0),
  generation_duration_ms integer not null default 0 check (generation_duration_ms >= 0),
  token_total           integer not null default 0 check (token_total >= 0),
  cost                  double precision not null default 0 check (cost >= 0),
  currency              text not null default 'USD',
  report_size           integer not null default 0 check (report_size >= 0),
  metric_count          integer not null default 0 check (metric_count >= 0),
  forecast_count        integer not null default 0 check (forecast_count >= 0),
  insight_count         integer not null default 0 check (insight_count >= 0),
  confidence            integer not null default 0 check (confidence between 0 and 100),
  version               integer not null default 1 check (version > 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index executive_report_workspace_idx on public.executive_report (workspace_id, created_at desc);
create index executive_report_client_idx on public.executive_report (client_id);
comment on table public.executive_report is 'Phase E E6: an executive report (versioned root; observes upstream outputs).';

create table public.observation_snapshot (
  id           text primary key,
  report_id    text not null references public.executive_report (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  source       text not null check (source in ('strategy','execution','automation','knowledge','ai_usage','workspace_activity','operational')),
  label        text not null default '',
  provenance   jsonb not null default '{}'::jsonb,
  data         jsonb not null default '{}'::jsonb,
  observed_at  timestamptz not null,
  created_at   timestamptz not null default now()
);
create index observation_snapshot_report_idx on public.observation_snapshot (report_id);
comment on table public.observation_snapshot is 'Phase E E6: a provenance-tagged observation from an upstream context (read-only copy).';

create table public.business_metric (
  id           text primary key,
  report_id    text not null references public.executive_report (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  key          text not null,
  name         text not null,
  category     text not null check (category in ('delivery','automation','quality','cost','usage','health')),
  value        double precision not null default 0,
  unit         text not null default '',
  sample_size  integer not null default 0 check (sample_size >= 0),
  source       text not null check (source in ('strategy','execution','automation','knowledge','ai_usage','workspace_activity','operational')),
  created_at   timestamptz not null default now()
);
create index business_metric_report_idx on public.business_metric (report_id);
comment on table public.business_metric is 'Phase E E6: a computed business metric.';

create table public.kpi_result (
  id           text primary key,
  report_id    text not null references public.executive_report (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  name         text not null,
  baseline     double precision not null default 0,
  current      double precision not null default 0,
  target       double precision not null default 0,
  variance     double precision not null default 0,
  status       text not null check (status in ('on_track','at_risk','off_track','achieved')),
  trend        text not null check (trend in ('growth','decline','stability','seasonality','volatility')),
  owner        text,
  measurement_frequency text not null default 'monthly' check (measurement_frequency in ('daily','weekly','monthly','quarterly')),
  created_at   timestamptz not null default now()
);
create index kpi_result_report_idx on public.kpi_result (report_id);
comment on table public.kpi_result is 'Phase E E6: a KPI result (baseline/current/target/variance/status/trend).';

create table public.trend_analysis (
  id             text primary key,
  report_id      text not null references public.executive_report (id) on delete cascade,
  workspace_id   text not null,
  client_id      text references public.clients (id) on delete cascade,
  metric_key     text not null,
  direction      text not null check (direction in ('growth','decline','stability','seasonality','volatility')),
  change_percent double precision not null default 0,
  significant    boolean not null default false,
  summary        text not null default '',
  period_count   integer not null default 0 check (period_count >= 0),
  created_at     timestamptz not null default now()
);
create index trend_analysis_report_idx on public.trend_analysis (report_id);
comment on table public.trend_analysis is 'Phase E E6: a trend classification over a metric series.';

create table public.forecast (
  id              text primary key,
  report_id       text not null references public.executive_report (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  kind            text not null check (kind in ('expected_completion','automation_adoption','capacity','delivery_confidence','risk_trajectory')),
  metric_key      text not null,
  horizon_days    integer not null default 30 check (horizon_days >= 0),
  projected_value double precision not null default 0,
  confidence      integer not null check (confidence between 0 and 100),
  basis           text not null default '',
  created_at      timestamptz not null default now()
);
create index forecast_report_idx on public.forecast (report_id);
comment on table public.forecast is 'Phase E E6: a forecast (always carries confidence).';

create table public.business_insight (
  id           text primary key,
  report_id    text not null references public.executive_report (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  title        text not null,
  summary      text not null default '',
  severity     text not null check (severity in ('info','low','medium','high','critical')),
  confidence   integer not null check (confidence between 0 and 100),
  affected_metrics    jsonb not null default '[]'::jsonb,
  supporting_evidence jsonb not null default '[]'::jsonb,
  recommended_actions jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index business_insight_report_idx on public.business_insight (report_id);
comment on table public.business_insight is 'Phase E E6: an insight (evidence drawn from observations; never fabricated).';

create table public.executive_summary (
  id                 text primary key,
  report_id          text not null references public.executive_report (id) on delete cascade,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  headline           text not null default '',
  highlights         jsonb not null default '[]'::jsonb,
  key_metrics        jsonb not null default '[]'::jsonb,
  overall_confidence integer not null default 0 check (overall_confidence between 0 and 100),
  created_at         timestamptz not null default now()
);
create index executive_summary_report_idx on public.executive_summary (report_id, created_at desc);
comment on table public.executive_summary is 'Phase E E6: the headline executive-summary block for a report.';

create table public.report_section (
  id           text primary key,
  report_id    text not null references public.executive_report (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  key          text not null,
  title        text not null,
  body         text not null default '',
  order_index  integer not null default 0 check (order_index >= 0),
  created_at   timestamptz not null default now()
);
create index report_section_report_idx on public.report_section (report_id, order_index);
comment on table public.report_section is 'Phase E E6: a section of a report.';

create table public.report_narrative (
  id              text primary key,
  report_id       text not null references public.executive_report (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  content         text not null default '',
  generated_by_ai boolean not null default false,
  provider        text,
  model           text,
  token_total     integer not null default 0 check (token_total >= 0),
  cost            double precision not null default 0 check (cost >= 0),
  created_at      timestamptz not null default now()
);
create index report_narrative_report_idx on public.report_narrative (report_id, created_at desc);
comment on table public.report_narrative is 'Phase E E6: the executive narrative (via E1 Prompt Engine or deterministic).';

create table public.report_schedule (
  id                 text primary key,
  workspace_id       text not null,
  client_id          text references public.clients (id) on delete cascade,
  kind               text not null check (kind in ('executive_summary','operational','automation','strategy_progress','execution_progress','kpi_dashboard','risk','workspace_health','weekly_summary','monthly_summary')),
  frequency          text not null check (frequency in ('daily','weekly','monthly','quarterly')),
  enabled            boolean not null default true,
  recipients_note    text not null default '',
  next_run_at        timestamptz,
  created_by_user_id text not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index report_schedule_workspace_idx on public.report_schedule (workspace_id, created_at desc);
comment on table public.report_schedule is 'Phase E E6: a reporting-schedule CONFIG record (nothing dispatches it).';

create table public.report_feedback (
  id              text primary key,
  report_id       text not null references public.executive_report (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  kind            text not null check (kind in ('approval','comment','rejection')),
  rating          integer check (rating between 1 and 5),
  comment         text,
  subject_user_id text not null,
  created_at      timestamptz not null default now()
);
create index report_feedback_report_idx on public.report_feedback (report_id, created_at desc);
comment on table public.report_feedback is 'Phase E E6: immutable feedback on a report (clients may submit).';

-- ---- append-only enforcement (analytics + narrative + feedback) -------------
create trigger observation_snapshot_no_mutation before update or delete on public.observation_snapshot for each row execute function public.bl_txexec_append_only();
create trigger business_metric_no_mutation before update or delete on public.business_metric for each row execute function public.bl_txexec_append_only();
create trigger kpi_result_no_mutation before update or delete on public.kpi_result for each row execute function public.bl_txexec_append_only();
create trigger trend_analysis_no_mutation before update or delete on public.trend_analysis for each row execute function public.bl_txexec_append_only();
create trigger forecast_no_mutation before update or delete on public.forecast for each row execute function public.bl_txexec_append_only();
create trigger business_insight_no_mutation before update or delete on public.business_insight for each row execute function public.bl_txexec_append_only();
create trigger executive_summary_no_mutation before update or delete on public.executive_summary for each row execute function public.bl_txexec_append_only();
create trigger report_section_no_mutation before update or delete on public.report_section for each row execute function public.bl_txexec_append_only();
create trigger report_narrative_no_mutation before update or delete on public.report_narrative for each row execute function public.bl_txexec_append_only();
create trigger report_feedback_no_mutation before update or delete on public.report_feedback for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants -----------------------------------------------------------
alter table public.executive_report enable row level security;
alter table public.observation_snapshot enable row level security;
alter table public.business_metric enable row level security;
alter table public.kpi_result enable row level security;
alter table public.trend_analysis enable row level security;
alter table public.forecast enable row level security;
alter table public.business_insight enable row level security;
alter table public.executive_summary enable row level security;
alter table public.report_section enable row level security;
alter table public.report_narrative enable row level security;
alter table public.report_schedule enable row level security;
alter table public.report_feedback enable row level security;

-- Internal builds reports; a client sees ONLY its own org's reports and may submit
-- feedback for its own org. Reports never cross tenants.
create policy "executive_report_read" on public.executive_report for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "executive_report_write" on public.executive_report for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "report_schedule_read" on public.report_schedule for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "report_schedule_write" on public.report_schedule for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only records: internal read (client read own) + internal insert.
do $$
declare t text;
begin
  foreach t in array array['observation_snapshot','business_metric','kpi_result','trend_analysis','forecast','business_insight','executive_summary','report_section','report_narrative'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id())', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.bl_is_internal())', t || '_insert', t);
  end loop;
end $$;
create policy "report_feedback_read" on public.report_feedback for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "report_feedback_insert" on public.report_feedback for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id());

grant select, insert, update, delete on public.executive_report to authenticated;
grant select, insert, update, delete on public.report_schedule to authenticated;
grant select, insert on public.observation_snapshot to authenticated;
grant select, insert on public.business_metric to authenticated;
grant select, insert on public.kpi_result to authenticated;
grant select, insert on public.trend_analysis to authenticated;
grant select, insert on public.forecast to authenticated;
grant select, insert on public.business_insight to authenticated;
grant select, insert on public.executive_summary to authenticated;
grant select, insert on public.report_section to authenticated;
grant select, insert on public.report_narrative to authenticated;
grant select, insert on public.report_feedback to authenticated;
grant all on public.executive_report to service_role;
grant all on public.report_schedule to service_role;
grant select, insert on public.observation_snapshot to service_role;
grant select, insert on public.business_metric to service_role;
grant select, insert on public.kpi_result to service_role;
grant select, insert on public.trend_analysis to service_role;
grant select, insert on public.forecast to service_role;
grant select, insert on public.business_insight to service_role;
grant select, insert on public.executive_summary to service_role;
grant select, insert on public.report_section to service_role;
grant select, insert on public.report_narrative to service_role;
grant select, insert on public.report_feedback to service_role;
