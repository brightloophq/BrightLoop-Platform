-- =============================================================================
-- pgTAP · Phase E · E4 — AI Project Manager tables.
-- Existence + RLS + checks + optimistic concurrency (session) + append-only plan
-- records + tenant isolation (other-org client sees nothing; same-org client reads
-- + submits feedback).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_pm', 'PM Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_pm_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'planning_session', 'planning session table exists');
select has_table('public', 'execution_plan', 'execution plan table exists');
select has_table('public', 'initiative_plan', 'initiative plan table exists');
select has_table('public', 'milestone_plan', 'milestone plan table exists');
select has_table('public', 'task_plan', 'task plan table exists');
select has_table('public', 'dependency_plan', 'dependency plan table exists');
select has_table('public', 'timeline_plan', 'timeline plan table exists');
select has_table('public', 'review_plan', 'review plan table exists');
select has_table('public', 'kpi_plan', 'kpi plan table exists');
select has_table('public', 'resource_estimate', 'resource estimate table exists');
select has_table('public', 'execution_risk', 'execution risk table exists');
select has_table('public', 'planning_feedback', 'planning feedback table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.planning_session'::regclass), 'RLS on session');
select ok((select relrowsecurity from pg_class where oid = 'public.task_plan'::regclass), 'RLS on task plan');

-- seed as internal owner; plan belongs to cli_pm
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.planning_session (id, workspace_id, client_id, strategy_session_id, title, requested_by_user_id) values ('pps_1', 'ws_pm', 'cli_pm', 'sst', 'Plan', 'u_int') $$, 'insert session');
select throws_ok($$ insert into public.planning_session (id, workspace_id, client_id, strategy_session_id, title, requested_by_user_id, status) values ('pps_bad', 'ws_pm', 'cli_pm', 'sst', 'X', 'u_int', 'nope') $$, '23514', null, 'invalid session status rejected');
select lives_ok($$ update public.planning_session set status = 'planning', version = 2 where id = 'pps_1' and version = 1 $$, 'session draft→planning v1→v2');

select lives_ok($$ insert into public.execution_plan (id, planning_session_id, workspace_id, client_id, status) values ('pep_1', 'pps_1', 'ws_pm', 'cli_pm', 'validated') $$, 'insert plan');
select lives_ok($$ update public.execution_plan set status = 'approved' where id = 'pep_1' $$, 'plan status is mutable');
select lives_ok($$ insert into public.initiative_plan (id, planning_session_id, workspace_id, client_id, title) values ('pip_1', 'pps_1', 'ws_pm', 'cli_pm', 'Adopt CRM') $$, 'insert initiative plan');
select lives_ok($$ insert into public.task_plan (id, initiative_plan_id, planning_session_id, workspace_id, client_id, title, priority, effort) values ('ptp_1', 'pip_1', 'pps_1', 'ws_pm', 'cli_pm', 'Configure CRM', 'high', 'medium') $$, 'insert task plan');
select throws_ok($$ insert into public.task_plan (id, initiative_plan_id, planning_session_id, workspace_id, client_id, title, priority) values ('ptp_bad', 'pip_1', 'pps_1', 'ws_pm', 'cli_pm', 'X', 'nope') $$, '23514', null, 'invalid task priority rejected');
select lives_ok($$ insert into public.dependency_plan (id, planning_session_id, workspace_id, client_id, from_task_id, to_task_id, kind) values ('pdp_1', 'pps_1', 'ws_pm', 'cli_pm', 'ptp_1', 'ptp_1', 'finish_to_start') $$, 'insert dependency plan');
select lives_ok($$ insert into public.timeline_plan (id, initiative_plan_id, planning_session_id, workspace_id, client_id, start_day, finish_day, duration_days) values ('ptl_1', 'pip_1', 'pps_1', 'ws_pm', 'cli_pm', 0, 5, 5) $$, 'insert timeline plan');
select lives_ok($$ insert into public.kpi_plan (id, planning_session_id, workspace_id, client_id, name, formula, target) values ('pkp_1', 'pps_1', 'ws_pm', 'cli_pm', 'Adoption', 'active/total', 100) $$, 'insert kpi plan');
select lives_ok($$ insert into public.execution_risk (id, planning_session_id, workspace_id, client_id, category, title, severity, likelihood) values ('per_1', 'pps_1', 'ws_pm', 'cli_pm', 'delivery', 'Slippage', 'high', 'medium') $$, 'insert risk');
select throws_ok($$ insert into public.execution_risk (id, planning_session_id, workspace_id, client_id, category, title, severity, likelihood) values ('per_bad', 'pps_1', 'ws_pm', 'cli_pm', 'nope', 'X', 'high', 'medium') $$, '23514', null, 'invalid risk category rejected');
select lives_ok($$ insert into public.planning_feedback (id, planning_session_id, workspace_id, client_id, kind, subject_user_id) values ('pfb_1', 'pps_1', 'ws_pm', 'cli_pm', 'approval', 'u_int') $$, 'insert feedback');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.task_plan set title = 'x' where id = 'ptp_1' $$, 'P0001', 'transformation_activity is append-only', 'task plan UPDATE blocked');
select throws_ok($$ delete from public.kpi_plan where id = 'pkp_1' $$, 'P0001', 'transformation_activity is append-only', 'kpi plan DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_pm_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.planning_session), 0, 'other-org client reads 0 sessions');
select is((select count(*)::int from public.task_plan), 0, 'other-org client reads 0 task plans');
reset role;

-- same-org client reads its plan + submits feedback
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_pm"}}', true);
set local role authenticated;
select is((select count(*)::int from public.planning_session), 1, 'same-org client reads its session');
select lives_ok($$ insert into public.planning_feedback (id, planning_session_id, workspace_id, client_id, kind, subject_user_id, comment) values ('pfb_c', 'pps_1', 'ws_pm', 'cli_pm', 'comment', 'u_c', 'looks good') $$, 'same-org client submits feedback');
reset role;

select * from finish();
rollback;
