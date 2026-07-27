-- =============================================================================
-- pgTAP · Phase E · E6 — AI Reporting tables.
-- Existence + RLS + checks + optimistic concurrency (report) + append-only
-- analytics records + tenant isolation (other-org client sees nothing; same-org
-- client reads + submits feedback).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_rep', 'Rep Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_rep_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'executive_report', 'executive report table exists');
select has_table('public', 'observation_snapshot', 'observation snapshot table exists');
select has_table('public', 'business_metric', 'business metric table exists');
select has_table('public', 'kpi_result', 'kpi result table exists');
select has_table('public', 'trend_analysis', 'trend analysis table exists');
select has_table('public', 'forecast', 'forecast table exists');
select has_table('public', 'business_insight', 'business insight table exists');
select has_table('public', 'executive_summary', 'executive summary table exists');
select has_table('public', 'report_section', 'report section table exists');
select has_table('public', 'report_narrative', 'report narrative table exists');
select has_table('public', 'report_schedule', 'report schedule table exists');
select has_table('public', 'report_feedback', 'report feedback table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.executive_report'::regclass), 'RLS on report');
select ok((select relrowsecurity from pg_class where oid = 'public.business_metric'::regclass), 'RLS on metric');

-- seed as internal owner; report belongs to cli_rep
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.executive_report (id, workspace_id, client_id, kind, title, requested_by_user_id) values ('er_1', 'ws_rep', 'cli_rep', 'executive_summary', 'Weekly', 'u_int') $$, 'insert report');
select throws_ok($$ insert into public.executive_report (id, workspace_id, client_id, kind, title, requested_by_user_id, status) values ('er_bad', 'ws_rep', 'cli_rep', 'executive_summary', 'X', 'u_int', 'nope') $$, '23514', null, 'invalid report status rejected');
select throws_ok($$ insert into public.executive_report (id, workspace_id, client_id, kind, title, requested_by_user_id) values ('er_bad2', 'ws_rep', 'cli_rep', 'nope', 'X', 'u_int') $$, '23514', null, 'invalid report kind rejected');
select lives_ok($$ update public.executive_report set status = 'generating', version = 2 where id = 'er_1' and version = 1 $$, 'report draft→generating v1→v2');

select lives_ok($$ insert into public.observation_snapshot (id, report_id, workspace_id, client_id, source, observed_at) values ('os_1', 'er_1', 'ws_rep', 'cli_rep', 'execution', now()) $$, 'insert observation');
select throws_ok($$ insert into public.observation_snapshot (id, report_id, workspace_id, client_id, source, observed_at) values ('os_bad', 'er_1', 'ws_rep', 'cli_rep', 'nope', now()) $$, '23514', null, 'invalid observation source rejected');
select lives_ok($$ insert into public.business_metric (id, report_id, workspace_id, client_id, key, name, category, value, source) values ('bm_1', 'er_1', 'ws_rep', 'cli_rep', 'completion_rate', 'Completion', 'delivery', 0.6, 'execution') $$, 'insert metric');
select throws_ok($$ insert into public.business_metric (id, report_id, workspace_id, client_id, key, name, category, value, source) values ('bm_bad', 'er_1', 'ws_rep', 'cli_rep', 'x', 'X', 'nope', 1, 'execution') $$, '23514', null, 'invalid metric category rejected');
select lives_ok($$ insert into public.kpi_result (id, report_id, workspace_id, client_id, name, status, trend) values ('kr_1', 'er_1', 'ws_rep', 'cli_rep', 'Adoption', 'off_track', 'growth') $$, 'insert kpi');
select lives_ok($$ insert into public.trend_analysis (id, report_id, workspace_id, client_id, metric_key, direction) values ('ta_1', 'er_1', 'ws_rep', 'cli_rep', 'completion_rate', 'growth') $$, 'insert trend');
select lives_ok($$ insert into public.forecast (id, report_id, workspace_id, client_id, kind, metric_key, projected_value, confidence) values ('fc_1', 'er_1', 'ws_rep', 'cli_rep', 'expected_completion', 'completion_rate', 0.8, 70) $$, 'insert forecast');
select throws_ok($$ insert into public.forecast (id, report_id, workspace_id, client_id, kind, metric_key, projected_value, confidence) values ('fc_bad', 'er_1', 'ws_rep', 'cli_rep', 'expected_completion', 'x', 0.8, 150) $$, '23514', null, 'forecast confidence bounded 0..100');
select lives_ok($$ insert into public.business_insight (id, report_id, workspace_id, client_id, title, severity, confidence) values ('bi_1', 'er_1', 'ws_rep', 'cli_rep', 'Low completion', 'high', 80) $$, 'insert insight');
select lives_ok($$ insert into public.executive_summary (id, report_id, workspace_id, client_id, headline) values ('es_1', 'er_1', 'ws_rep', 'cli_rep', 'Head') $$, 'insert summary');
select lives_ok($$ insert into public.report_section (id, report_id, workspace_id, client_id, key, title) values ('rs_1', 'er_1', 'ws_rep', 'cli_rep', 'metrics', 'Metrics') $$, 'insert section');
select lives_ok($$ insert into public.report_narrative (id, report_id, workspace_id, client_id, content) values ('rn_1', 'er_1', 'ws_rep', 'cli_rep', 'Narrative') $$, 'insert narrative');
select lives_ok($$ insert into public.report_schedule (id, workspace_id, client_id, kind, frequency, created_by_user_id) values ('rsch_1', 'ws_rep', 'cli_rep', 'weekly_summary', 'weekly', 'u_int') $$, 'insert schedule');
select lives_ok($$ update public.report_schedule set enabled = false where id = 'rsch_1' $$, 'schedule enabled is mutable');
select lives_ok($$ insert into public.report_feedback (id, report_id, workspace_id, client_id, kind, subject_user_id) values ('rfb_1', 'er_1', 'ws_rep', 'cli_rep', 'approval', 'u_int') $$, 'insert feedback');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.business_metric set value = 1 where id = 'bm_1' $$, 'P0001', 'transformation_activity is append-only', 'metric UPDATE blocked');
select throws_ok($$ delete from public.business_insight where id = 'bi_1' $$, 'P0001', 'transformation_activity is append-only', 'insight DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_rep_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.executive_report), 0, 'other-org client reads 0 reports');
select is((select count(*)::int from public.business_metric), 0, 'other-org client reads 0 metrics');
reset role;

-- same-org client reads its report + submits feedback
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_rep"}}', true);
set local role authenticated;
select is((select count(*)::int from public.executive_report), 1, 'same-org client reads its report');
select lives_ok($$ insert into public.report_feedback (id, report_id, workspace_id, client_id, kind, subject_user_id, comment) values ('rfb_c', 'er_1', 'ws_rep', 'cli_rep', 'comment', 'u_c', 'useful') $$, 'same-org client submits feedback');
reset role;

select * from finish();
rollback;
