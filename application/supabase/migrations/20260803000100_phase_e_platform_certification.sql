-- =============================================================================
-- Phase E · Sprint E8 — Platform Certification & Production Readiness.
-- ADDITIVE ONLY. Four new tables: certification_run (versioned; mutable status/
-- outcome/published), certification_result / certification_issue /
-- certification_exception (append-only). This context CERTIFIES E1–E7 and
-- introduces no business capability. Certification is internal-only (owner/admin);
-- no client access. No prior-phase table is touched.
-- =============================================================================

create table public.certification_run (
  id                   text primary key,
  workspace_id         text not null,
  client_id            text references public.clients (id) on delete cascade,
  title                text not null,
  status               text not null default 'running' check (status in ('running','completed','failed')),
  outcome              text not null default 'failed' check (outcome in ('passed','passed_with_warnings','failed')),
  published            boolean not null default false,
  score                integer not null default 0 check (score between 0 and 100),
  total_checks         integer not null default 0 check (total_checks >= 0),
  passed_checks        integer not null default 0 check (passed_checks >= 0),
  failed_checks        integer not null default 0 check (failed_checks >= 0),
  warning_count        integer not null default 0 check (warning_count >= 0),
  categories_covered   integer not null default 0 check (categories_covered >= 0),
  requested_by_user_id text not null,
  duration_ms          integer not null default 0 check (duration_ms >= 0),
  correlation_id       text not null,
  version              integer not null default 1 check (version > 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index certification_run_workspace_idx on public.certification_run (workspace_id, created_at desc);
comment on table public.certification_run is 'Phase E E8: a platform certification run (versioned; audits E1–E7).';

create table public.certification_result (
  id            text primary key,
  run_id        text not null references public.certification_run (id) on delete cascade,
  workspace_id  text not null,
  client_id     text references public.clients (id) on delete cascade,
  category      text not null check (category in ('architecture','capability','boundary','authorization','rls','approval','idempotency','checkpoint','recovery','performance','security','observability','database','api_contract','read_model','audit_trail')),
  outcome       text not null check (outcome in ('passed','passed_with_warnings','failed')),
  checks_total  integer not null default 0 check (checks_total >= 0),
  checks_passed integer not null default 0 check (checks_passed >= 0),
  score         integer not null default 0 check (score between 0 and 100),
  summary       text not null default '',
  created_at    timestamptz not null default now()
);
create index certification_result_run_idx on public.certification_result (run_id);
comment on table public.certification_result is 'Phase E E8: a per-category certification result (append-only).';

create table public.certification_issue (
  id              text primary key,
  run_id          text not null references public.certification_run (id) on delete cascade,
  result_id       text,
  workspace_id    text not null,
  client_id       text references public.clients (id) on delete cascade,
  category        text not null check (category in ('architecture','capability','boundary','authorization','rls','approval','idempotency','checkpoint','recovery','performance','security','observability','database','api_contract','read_model','audit_trail')),
  severity        text not null check (severity in ('info','low','medium','high','critical')),
  code            text not null,
  title           text not null,
  detail          text not null default '',
  bounded_context text not null default '',
  status          text not null default 'open' check (status in ('open','waived','resolved')),
  created_at      timestamptz not null default now()
);
create index certification_issue_run_idx on public.certification_issue (run_id, severity);
comment on table public.certification_issue is 'Phase E E8: a certification issue (append-only).';

create table public.certification_exception (
  id                  text primary key,
  run_id              text not null references public.certification_run (id) on delete cascade,
  workspace_id        text not null,
  client_id           text references public.clients (id) on delete cascade,
  issue_code          text not null,
  reason              text not null,
  approved_by_user_id text not null,
  expires_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index certification_exception_run_idx on public.certification_exception (run_id, created_at desc);
comment on table public.certification_exception is 'Phase E E8: a documented certification waiver (append-only).';

-- ---- append-only enforcement -----------------------------------------------
create trigger certification_result_no_mutation before update or delete on public.certification_result for each row execute function public.bl_txexec_append_only();
create trigger certification_issue_no_mutation before update or delete on public.certification_issue for each row execute function public.bl_txexec_append_only();
create trigger certification_exception_no_mutation before update or delete on public.certification_exception for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (INTERNAL ONLY — certification is owner/admin) ------------
alter table public.certification_run enable row level security;
alter table public.certification_result enable row level security;
alter table public.certification_issue enable row level security;
alter table public.certification_exception enable row level security;

create policy "certification_run_internal" on public.certification_run for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "certification_result_read" on public.certification_result for select to authenticated using (public.bl_is_internal());
create policy "certification_result_insert" on public.certification_result for insert to authenticated with check (public.bl_is_internal());
create policy "certification_issue_read" on public.certification_issue for select to authenticated using (public.bl_is_internal());
create policy "certification_issue_insert" on public.certification_issue for insert to authenticated with check (public.bl_is_internal());
create policy "certification_exception_read" on public.certification_exception for select to authenticated using (public.bl_is_internal());
create policy "certification_exception_insert" on public.certification_exception for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.certification_run to authenticated;
grant select, insert on public.certification_result to authenticated;
grant select, insert on public.certification_issue to authenticated;
grant select, insert on public.certification_exception to authenticated;
grant all on public.certification_run to service_role;
grant select, insert on public.certification_result to service_role;
grant select, insert on public.certification_issue to service_role;
grant select, insert on public.certification_exception to service_role;
