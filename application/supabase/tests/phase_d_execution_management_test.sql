-- =============================================================================
-- pgTAP · Phase D · D3+D4 — Execution management tables.
-- Existence + RLS + FKs + checks + optimistic concurrency + append-only
-- assignment + tenant isolation.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_e', 'Exec Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_e_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'transformation_review', 'review table exists');
select has_table('public', 'transformation_task', 'task table exists');
select has_table('public', 'transformation_assignment', 'assignment table exists');
select has_table('public', 'transformation_dependency', 'dependency table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_task'::regclass), 'RLS on task');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_assignment'::regclass), 'RLS on assignment');

-- seed a workspace + initiative as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum) values ('txw_e', 'cli_e', 'run_e', 'WS', 'chk_e');
insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact) values ('init_a', 'txw_e', 'cli_e', 'p:a', 'A', 'high', 'small', 'high');
insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact) values ('init_b', 'txw_e', 'cli_e', 'p:b', 'B', 'high', 'small', 'high');

-- review: insert + optimistic decision
select lives_ok($$ insert into public.transformation_review (id, workspace_id, initiative_id, client_id, status) values ('rev_1', 'txw_e', 'init_a', 'cli_e', 'pending') $$, 'insert review');
select lives_ok($$ update public.transformation_review set status = 'approved', version = 2 where id = 'rev_1' and version = 1 $$, 'approve review v1→v2');
select throws_ok($$ insert into public.transformation_review (id, workspace_id, initiative_id, client_id, status) values ('rev_bad', 'txw_e', 'init_a', 'cli_e', 'bogus') $$, '23514', null, 'invalid review status rejected');

-- task: insert + status/priority checks
select lives_ok($$ insert into public.transformation_task (id, initiative_id, workspace_id, client_id, title, status, priority) values ('task_1', 'init_a', 'txw_e', 'cli_e', 'T', 'todo', 'medium') $$, 'insert task');
select throws_ok($$ update public.transformation_task set status = 'nope' where id = 'task_1' $$, '23514', null, 'invalid task status rejected');
select is((select count(*)::int from (select 1 where exists (select 1 from public.transformation_task where id = 'task_1' and status = 'todo')) x), 1, 'task persisted');

-- assignment: append-only
select lives_ok($$ insert into public.transformation_assignment (id, task_id, workspace_id, client_id, action, assignee_actor_id, assigned_by_actor_id) values ('asg_1', 'task_1', 'txw_e', 'cli_e', 'assigned', 'u_a', 'u_mgr') $$, 'insert assignment');
reset role;
select throws_ok($$ update public.transformation_assignment set action = 'reassigned' where id = 'asg_1' $$, 'P0001', 'transformation_activity is append-only', 'assignment UPDATE blocked by trigger');
select throws_ok($$ delete from public.transformation_assignment where id = 'asg_1' $$, 'P0001', 'transformation_activity is append-only', 'assignment DELETE blocked by trigger');

-- dependency: insert + unique
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;
select lives_ok($$ insert into public.transformation_dependency (id, workspace_id, client_id, from_initiative_id, to_initiative_id, type) values ('dep_1', 'txw_e', 'cli_e', 'init_a', 'init_b', 'depends_on') $$, 'insert dependency');
select throws_ok($$ insert into public.transformation_dependency (id, workspace_id, client_id, from_initiative_id, to_initiative_id, type) values ('dep_dup', 'txw_e', 'cli_e', 'init_a', 'init_b', 'depends_on') $$, '23505', null, 'duplicate dependency edge rejected');
select throws_ok($$ insert into public.transformation_dependency (id, workspace_id, client_id, from_initiative_id, to_initiative_id, type) values ('dep_bad', 'txw_e', 'cli_e', 'init_a', 'init_b', 'nope') $$, '23514', null, 'invalid dependency type rejected');
reset role;

-- tenant isolation: a client role sees none of the internal-only rows
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_e_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.transformation_task), 0, 'client reads 0 tasks');
select is((select count(*)::int from public.transformation_review), 0, 'client reads 0 reviews');
reset role;

select * from finish();
rollback;
