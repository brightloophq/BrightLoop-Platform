-- =============================================================================
-- Phase E · Sprint E3 — AI Strategist: sessions, analyses, findings, risks,
-- recommendations, priority scores, roadmaps, citations, feedback. ADDITIVE ONLY.
-- Nine new tables; internal-only RLS (clients get scoped read + feedback via the
-- application layer + ownership); the session is versioned, everything else is
-- append-only. Consumes E1/E2 via application services; owns no AI/knowledge rows.
-- No Phase A–E2 table is touched.
-- =============================================================================

create table public.strategy_session (
  id                   text primary key,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  title                text not null,
  status               text not null default 'draft' check (status in ('draft', 'analyzing', 'completed', 'failed', 'archived')),
  goal                 text not null default '',
  collection_ids       jsonb not null default '[]'::jsonb,
  dimensions           jsonb not null default '[]'::jsonb,
  requested_by_user_id text not null,
  prompt_id            text,
  prompt_version       integer check (prompt_version > 0),
  provider             text,
  model                text,
  analysis_duration_ms integer not null default 0 check (analysis_duration_ms >= 0),
  retrieval_count      integer not null default 0 check (retrieval_count >= 0),
  token_total          integer not null default 0 check (token_total >= 0),
  cost                 double precision not null default 0 check (cost >= 0),
  currency             text not null default 'USD',
  confidence           integer not null default 0 check (confidence between 0 and 100),
  version              integer not null default 1 check (version > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index strategy_session_workspace_idx on public.strategy_session (workspace_id, created_at desc);
create index strategy_session_client_idx on public.strategy_session (client_id);
comment on table public.strategy_session is 'Phase E E3: an AI Strategist analysis session.';

create table public.strategy_analysis (
  id                   text primary key,
  session_id           text not null references public.strategy_session (id) on delete cascade,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  executive_summary    text not null default '',
  current_state        text not null default '',
  expected_impact      text not null default '',
  confidence           integer not null default 0 check (confidence between 0 and 100),
  confidence_reason    text not null default '',
  missing_information  jsonb not null default '[]'::jsonb,
  clarifications       jsonb not null default '[]'::jsonb,
  provider             text,
  model                text,
  prompt_version       integer check (prompt_version > 0),
  tokens_used          integer not null default 0 check (tokens_used >= 0),
  retrieval_latency_ms integer not null default 0 check (retrieval_latency_ms >= 0),
  ai_duration_ms       integer not null default 0 check (ai_duration_ms >= 0),
  created_at           timestamptz not null default now()
);
create index strategy_analysis_session_idx on public.strategy_analysis (session_id, created_at desc);
comment on table public.strategy_analysis is 'Phase E E3: an immutable business-analysis output for a session.';

create table public.business_finding (
  id              text primary key,
  session_id      text not null references public.strategy_session (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  dimension       text not null check (dimension in ('company_profile','industry','services','operations','sales','marketing','branding','customer_journey','automation_maturity','technology','team_structure','documentation_quality','risk','growth','competitive_advantage','bottlenecks')),
  category        text not null check (category in ('strength','weakness','opportunity','risk','bottleneck','advantage')),
  title           text not null,
  detail          text not null default '',
  business_impact text not null default 'medium' check (business_impact in ('low','medium','high')),
  confidence      integer not null default 0 check (confidence between 0 and 100),
  evidence_count  integer not null default 0 check (evidence_count >= 0),
  created_at      timestamptz not null default now()
);
create index business_finding_session_idx on public.business_finding (session_id);
comment on table public.business_finding is 'Phase E E3: an immutable business finding (opportunities are category=opportunity).';

create table public.risk_assessment (
  id           text primary key,
  session_id   text not null references public.strategy_session (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  title        text not null,
  description  text not null default '',
  severity     text not null check (severity in ('low','medium','high','critical')),
  likelihood   text not null check (likelihood in ('low','medium','high')),
  mitigation   text not null default '',
  confidence   integer not null default 0 check (confidence between 0 and 100),
  created_at   timestamptz not null default now()
);
create index risk_assessment_session_idx on public.risk_assessment (session_id);
create index risk_assessment_workspace_idx on public.risk_assessment (workspace_id);
comment on table public.risk_assessment is 'Phase E E3: an immutable risk assessment.';

create table public.recommendation (
  id                text primary key,
  session_id        text not null references public.strategy_session (id) on delete cascade,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  title             text not null,
  description       text not null default '',
  reasoning         text not null default '',
  priority          integer not null default 0 check (priority between 0 and 100),
  effort            text not null default 'medium' check (effort in ('low','medium','high')),
  expected_impact   text not null default 'medium' check (expected_impact in ('low','medium','high')),
  dependencies      jsonb not null default '[]'::jsonb,
  confidence        integer not null default 0 check (confidence between 0 and 100),
  recommended_owner text,
  estimated_timeline text,
  order_index       integer not null default 0 check (order_index >= 0),
  created_at        timestamptz not null default now()
);
create index recommendation_session_idx on public.recommendation (session_id, order_index);
comment on table public.recommendation is 'Phase E E3: an immutable transformation recommendation.';

create table public.priority_score (
  id                    text primary key,
  recommendation_id     text not null references public.recommendation (id) on delete cascade,
  session_id            text not null references public.strategy_session (id) on delete cascade,
  workspace_id          text not null,
  client_id             text references public.clients (id) on delete cascade,
  business_impact       integer not null check (business_impact between 0 and 100),
  implementation_effort integer not null check (implementation_effort between 0 and 100),
  urgency               integer not null check (urgency between 0 and 100),
  risk_reduction        integer not null check (risk_reduction between 0 and 100),
  customer_value        integer not null check (customer_value between 0 and 100),
  strategic_alignment   integer not null check (strategic_alignment between 0 and 100),
  automation_potential  integer not null check (automation_potential between 0 and 100),
  total                 integer not null check (total between 0 and 100),
  created_at            timestamptz not null default now()
);
create index priority_score_session_idx on public.priority_score (session_id);
comment on table public.priority_score is 'Phase E E3: the immutable factor breakdown behind a recommendation priority.';

create table public.transformation_roadmap (
  id           text primary key,
  session_id   text not null references public.strategy_session (id) on delete cascade,
  workspace_id text not null,
  client_id    text references public.clients (id) on delete cascade,
  phases       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now()
);
create index transformation_roadmap_session_idx on public.transformation_roadmap (session_id, created_at desc);
comment on table public.transformation_roadmap is 'Phase E E3: an immutable 3-phase transformation roadmap.';

create table public.strategy_citation (
  id                text primary key,
  session_id        text not null references public.strategy_session (id) on delete cascade,
  workspace_id      text not null,
  client_id         text references public.clients (id) on delete cascade,
  finding_id        text,
  recommendation_id text,
  document_id       text not null,
  collection_id     text not null,
  chunk_id          text not null,
  page              integer check (page >= 0),
  heading           text,
  similarity        double precision not null,
  created_at        timestamptz not null default now()
);
create index strategy_citation_session_idx on public.strategy_citation (session_id);
comment on table public.strategy_citation is 'Phase E E3: an immutable citation backing a finding or recommendation.';

create table public.strategy_feedback (
  id              text primary key,
  session_id      text not null references public.strategy_session (id) on delete cascade,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  kind            text not null check (kind in ('approval', 'comment', 'rejection')),
  rating          integer check (rating between 1 and 5),
  comment         text,
  subject_user_id text not null,
  created_at      timestamptz not null default now()
);
create index strategy_feedback_session_idx on public.strategy_feedback (session_id, created_at desc);
create index strategy_feedback_workspace_idx on public.strategy_feedback (workspace_id);
comment on table public.strategy_feedback is 'Phase E E3: immutable feedback on a strategy (clients may submit).';

-- ---- append-only enforcement ------------------------------------------------
create trigger strategy_analysis_no_mutation before update or delete on public.strategy_analysis for each row execute function public.bl_txexec_append_only();
create trigger business_finding_no_mutation before update or delete on public.business_finding for each row execute function public.bl_txexec_append_only();
create trigger risk_assessment_no_mutation before update or delete on public.risk_assessment for each row execute function public.bl_txexec_append_only();
create trigger recommendation_no_mutation before update or delete on public.recommendation for each row execute function public.bl_txexec_append_only();
create trigger priority_score_no_mutation before update or delete on public.priority_score for each row execute function public.bl_txexec_append_only();
create trigger transformation_roadmap_no_mutation before update or delete on public.transformation_roadmap for each row execute function public.bl_txexec_append_only();
create trigger strategy_citation_no_mutation before update or delete on public.strategy_citation for each row execute function public.bl_txexec_append_only();
create trigger strategy_feedback_no_mutation before update or delete on public.strategy_feedback for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants -----------------------------------------------------------
alter table public.strategy_session enable row level security;
alter table public.strategy_analysis enable row level security;
alter table public.business_finding enable row level security;
alter table public.risk_assessment enable row level security;
alter table public.recommendation enable row level security;
alter table public.priority_score enable row level security;
alter table public.transformation_roadmap enable row level security;
alter table public.strategy_citation enable row level security;
alter table public.strategy_feedback enable row level security;

-- Internal sees all; a client sees ONLY their own org's strategies (tenant scope);
-- clients may INSERT feedback for their own org. Vectors/knowledge never appear here.
create policy "strategy_session_read" on public.strategy_session for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "strategy_session_write" on public.strategy_session for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "strategy_analysis_read" on public.strategy_analysis for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "strategy_analysis_insert" on public.strategy_analysis for insert to authenticated with check (public.bl_is_internal());
create policy "business_finding_read" on public.business_finding for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "business_finding_insert" on public.business_finding for insert to authenticated with check (public.bl_is_internal());
create policy "risk_assessment_read" on public.risk_assessment for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "risk_assessment_insert" on public.risk_assessment for insert to authenticated with check (public.bl_is_internal());
create policy "recommendation_read" on public.recommendation for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "recommendation_insert" on public.recommendation for insert to authenticated with check (public.bl_is_internal());
create policy "priority_score_read" on public.priority_score for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "priority_score_insert" on public.priority_score for insert to authenticated with check (public.bl_is_internal());
create policy "transformation_roadmap_read" on public.transformation_roadmap for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "transformation_roadmap_insert" on public.transformation_roadmap for insert to authenticated with check (public.bl_is_internal());
create policy "strategy_citation_read" on public.strategy_citation for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "strategy_citation_insert" on public.strategy_citation for insert to authenticated with check (public.bl_is_internal());
create policy "strategy_feedback_read" on public.strategy_feedback for select to authenticated using (public.bl_is_internal() or client_id = public.bl_client_id());
create policy "strategy_feedback_insert" on public.strategy_feedback for insert to authenticated with check (public.bl_is_internal() or client_id = public.bl_client_id());

grant select, insert, update, delete on public.strategy_session to authenticated;
grant select, insert on public.strategy_analysis to authenticated;
grant select, insert on public.business_finding to authenticated;
grant select, insert on public.risk_assessment to authenticated;
grant select, insert on public.recommendation to authenticated;
grant select, insert on public.priority_score to authenticated;
grant select, insert on public.transformation_roadmap to authenticated;
grant select, insert on public.strategy_citation to authenticated;
grant select, insert on public.strategy_feedback to authenticated;
grant all on public.strategy_session to service_role;
grant select, insert on public.strategy_analysis to service_role;
grant select, insert on public.business_finding to service_role;
grant select, insert on public.risk_assessment to service_role;
grant select, insert on public.recommendation to service_role;
grant select, insert on public.priority_score to service_role;
grant select, insert on public.transformation_roadmap to service_role;
grant select, insert on public.strategy_citation to service_role;
grant select, insert on public.strategy_feedback to service_role;
