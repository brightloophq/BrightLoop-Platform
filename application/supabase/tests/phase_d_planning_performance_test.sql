-- =============================================================================
-- pgTAP · Phase D · D5+D6 — Planning & Performance tables.
-- Existence + RLS + FKs + checks + optimistic concurrency + unique constraints
-- + append-only progress snapshots + tenant isolation.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_p', 'Plan Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_p_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'transformation_timeline', 'timeline table exists');
select has_table('public', 'transformation_milestone', 'milestone table exists');
select has_table('public', 'transformation_kpi', 'kpi table exists');
select has_table('public', 'transformation_progress_snapshot', 'progress snapshot table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_timeline'::regclass), 'RLS on timeline');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_progress_snapshot'::regclass), 'RLS on progress snapshot');

-- seed a workspace + initiatives as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum) values ('txw_p', 'cli_p', 'run_p', 'WS', 'chk_p');
insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact) values ('init_p', 'txw_p', 'cli_p', 'p:a', 'A', 'high', 'small', 'high');
insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact) values ('init_q', 'txw_p', 'cli_p', 'p:b', 'B', 'high', 'small', 'high');

-- timeline: insert + one-per-initiative + optimistic transition + status check
select lives_ok($$ insert into public.transformation_timeline (id, initiative_id, workspace_id, client_id, start_date, target_end_date, status) values ('tl_1', 'init_p', 'txw_p', 'cli_p', '2026-07-01', '2026-07-11', 'planned') $$, 'insert timeline');
select throws_ok($$ insert into public.transformation_timeline (id, initiative_id, workspace_id, client_id, start_date, target_end_date) values ('tl_dup', 'init_p', 'txw_p', 'cli_p', '2026-07-01', '2026-07-11') $$, '23505', null, 'second timeline for an initiative rejected');
select lives_ok($$ update public.transformation_timeline set status = 'active', version = 2 where id = 'tl_1' and version = 1 $$, 'start timeline v1→v2');
select throws_ok($$ insert into public.transformation_timeline (id, initiative_id, workspace_id, client_id, start_date, target_end_date, status) values ('tl_bad', 'init_q', 'txw_p', 'cli_p', '2026-07-01', '2026-07-11', 'bogus') $$, '23514', null, 'invalid timeline status rejected');

-- milestone: insert + unique order + status check
select lives_ok($$ insert into public.transformation_milestone (id, initiative_id, workspace_id, client_id, title, planned_date, order_index) values ('ms_1', 'init_p', 'txw_p', 'cli_p', 'Kickoff', '2026-07-03', 0) $$, 'insert milestone');
select throws_ok($$ insert into public.transformation_milestone (id, initiative_id, workspace_id, client_id, title, planned_date, order_index) values ('ms_dup', 'init_p', 'txw_p', 'cli_p', 'Dup', '2026-07-04', 0) $$, '23505', null, 'duplicate milestone order rejected');
select throws_ok($$ insert into public.transformation_milestone (id, initiative_id, workspace_id, client_id, title, planned_date, status) values ('ms_bad', 'init_p', 'txw_p', 'cli_p', 'X', '2026-07-05', 'nope') $$, '23514', null, 'invalid milestone status rejected');

-- kpi: insert + unique name per workspace + status check
select lives_ok($$ insert into public.transformation_kpi (id, workspace_id, client_id, name, target, current, status) values ('kpi_1', 'txw_p', 'cli_p', 'Conversions', 100, 40, 'off_track') $$, 'insert kpi');
select throws_ok($$ insert into public.transformation_kpi (id, workspace_id, client_id, name, target, status) values ('kpi_dup', 'txw_p', 'cli_p', 'Conversions', 10, 'off_track') $$, '23505', null, 'duplicate KPI name rejected');
select throws_ok($$ insert into public.transformation_kpi (id, workspace_id, client_id, name, target, status) values ('kpi_bad', 'txw_p', 'cli_p', 'Revenue', 10, 'nope') $$, '23514', null, 'invalid KPI status rejected');

-- progress snapshot: insert + percentage bounds + scope check
select lives_ok($$ insert into public.transformation_progress_snapshot (id, workspace_id, client_id, scope, subject_id, progress, task_completion, review_completion, dependency_completion, milestone_completion, timeline_variance, health) values ('snap_1', 'txw_p', 'cli_p', 'initiative', 'init_p', 40, 50, 100, 100, 0, 4, null) $$, 'insert initiative snapshot');
select lives_ok($$ insert into public.transformation_progress_snapshot (id, workspace_id, client_id, scope, subject_id, progress, task_completion, review_completion, dependency_completion, milestone_completion, timeline_variance, health) values ('snap_2', 'txw_p', 'cli_p', 'workspace', 'txw_p', 20, 20, 50, 100, 0, null, 'warning') $$, 'insert workspace snapshot');
select throws_ok($$ insert into public.transformation_progress_snapshot (id, workspace_id, client_id, scope, subject_id, progress, task_completion, review_completion, dependency_completion, milestone_completion) values ('snap_bad', 'txw_p', 'cli_p', 'initiative', 'init_p', 150, 0, 0, 0, 0) $$, '23514', null, 'progress over 100 rejected');
select throws_ok($$ insert into public.transformation_progress_snapshot (id, workspace_id, client_id, scope, subject_id, progress, task_completion, review_completion, dependency_completion, milestone_completion) values ('snap_bad2', 'txw_p', 'cli_p', 'nope', 'init_p', 10, 0, 0, 0, 0) $$, '23514', null, 'invalid snapshot scope rejected');

-- progress snapshot: append-only (exercise the trigger as table owner)
reset role;
select throws_ok($$ update public.transformation_progress_snapshot set progress = 99 where id = 'snap_1' $$, 'P0001', 'transformation_activity is append-only', 'snapshot UPDATE blocked by trigger');
select throws_ok($$ delete from public.transformation_progress_snapshot where id = 'snap_1' $$, 'P0001', 'transformation_activity is append-only', 'snapshot DELETE blocked by trigger');

-- tenant isolation: a client role sees none of the internal-only rows
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_p_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.transformation_timeline), 0, 'client reads 0 timelines');
select is((select count(*)::int from public.transformation_kpi), 0, 'client reads 0 KPIs');
select is((select count(*)::int from public.transformation_progress_snapshot), 0, 'client reads 0 snapshots');
reset role;

select * from finish();
rollback;
