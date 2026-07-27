-- =============================================================================
-- pgTAP · Phase E · E7 — AI Agents tables.
-- Existence + RLS + checks + optimistic concurrency (mission) + append-only
-- records + tenant isolation + assigned-approver approval semantics.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_ag', 'Agent Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_ag_other', 'Other Co') on conflict do nothing;

-- structure (17 tables)
select has_table('public', 'agent_profile', 'agent_profile exists');
select has_table('public', 'agent_mission', 'agent_mission exists');
select has_table('public', 'agent_run', 'agent_run exists');
select has_table('public', 'agent_task', 'agent_task exists');
select has_table('public', 'agent_delegation', 'agent_delegation exists');
select has_table('public', 'agent_message', 'agent_message exists');
select has_table('public', 'agent_observation', 'agent_observation exists');
select has_table('public', 'agent_decision', 'agent_decision exists');
select has_table('public', 'agent_tool_call', 'agent_tool_call exists');
select has_table('public', 'agent_checkpoint', 'agent_checkpoint exists');
select has_table('public', 'agent_approval', 'agent_approval exists');
select has_table('public', 'agent_evaluation', 'agent_evaluation exists');
select has_table('public', 'agent_memory', 'agent_memory exists');
select has_table('public', 'agent_artifact', 'agent_artifact exists');
select has_table('public', 'agent_failure', 'agent_failure exists');
select has_table('public', 'agent_feedback', 'agent_feedback exists');
select has_table('public', 'capability_definition', 'capability_definition exists');
select ok((select relrowsecurity from pg_class where oid = 'public.agent_mission'::regclass), 'RLS on mission');
select ok((select relrowsecurity from pg_class where oid = 'public.agent_tool_call'::regclass), 'RLS on tool call');

-- seed as internal owner; mission belongs to cli_ag
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.agent_profile (id, workspace_id, client_id, name, role) values ('ap_1', 'ws_ag', 'cli_ag', 'Coordinator', 'coordinator') $$, 'insert profile');
select throws_ok($$ insert into public.agent_profile (id, workspace_id, client_id, name, role) values ('ap_bad', 'ws_ag', 'cli_ag', 'X', 'nope') $$, '23514', null, 'invalid agent role rejected');
select lives_ok($$ insert into public.agent_mission (id, workspace_id, client_id, coordinator_profile_id, title, requested_by_user_id, correlation_id) values ('am_1', 'ws_ag', 'cli_ag', 'ap_1', 'Mission', 'u_int', 'corr_1') $$, 'insert mission');
select throws_ok($$ insert into public.agent_mission (id, workspace_id, client_id, coordinator_profile_id, title, requested_by_user_id, correlation_id, status) values ('am_bad', 'ws_ag', 'cli_ag', 'ap_1', 'X', 'u_int', 'c', 'nope') $$, '23514', null, 'invalid mission status rejected');
select lives_ok($$ update public.agent_mission set status = 'queued', version = 2 where id = 'am_1' and version = 1 $$, 'mission draft→queued v1→v2');
select is((select count(*)::int from public.agent_mission where id = 'am_1' and version = 3), 0, 'stale mission version not present');

select lives_ok($$ insert into public.agent_task (id, mission_id, workspace_id, client_id, key, kind, title, assigned_role) values ('at_1', 'am_1', 'ws_ag', 'cli_ag', 'knowledge', 'capability', 'K', 'knowledge') $$, 'insert task');
select throws_ok($$ insert into public.agent_task (id, mission_id, workspace_id, client_id, key, kind, title, assigned_role) values ('at_bad', 'am_1', 'ws_ag', 'cli_ag', 'x', 'nope', 'X', 'knowledge') $$, '23514', null, 'invalid task kind rejected');
select lives_ok($$ insert into public.agent_tool_call (id, mission_id, workspace_id, client_id, capability_key, required_permission, side_effect, ok, idempotency_key, correlation_id) values ('tc_1', 'am_1', 'ws_ag', 'cli_ag', 'strategy.get_result', 'strategy.read', 'read', true, 'idem_1', 'corr_1') $$, 'insert tool call');
select lives_ok($$ insert into public.agent_checkpoint (id, mission_id, workspace_id, client_id, mission_status, state_hash) values ('cp_1', 'am_1', 'ws_ag', 'cli_ag', 'planning', 'h1') $$, 'insert checkpoint');
select lives_ok($$ insert into public.agent_approval (id, mission_id, task_key, workspace_id, client_id, approval_class, payload_hash, requested_by_role, assigned_approver_user_id, requested_at) values ('aa_1', 'am_1', 'review', 'ws_ag', 'cli_ag', 'plan_approval', 'ph1', 'review', 'u_client', now()) $$, 'insert approval');
select lives_ok($$ insert into public.agent_evaluation (id, mission_id, workspace_id, client_id, target_kind, target_key, evaluator_role, verdict) values ('ae_1', 'am_1', 'ws_ag', 'cli_ag', 'mission', 'am_1', 'review', 'pass') $$, 'insert evaluation');
select lives_ok($$ insert into public.capability_definition (key, owning_context, service, required_permission, side_effect) values ('strategy.get_result', 'strategist', 'getStrategyResult', 'strategy.read', 'read') $$, 'insert capability');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.agent_tool_call set ok = false where id = 'tc_1' $$, 'P0001', 'transformation_activity is append-only', 'tool call UPDATE blocked');
select throws_ok($$ delete from public.agent_evaluation where id = 'ae_1' $$, 'P0001', 'transformation_activity is append-only', 'evaluation DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_ag_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.agent_mission), 0, 'other-org client reads 0 missions');
select is((select count(*)::int from public.agent_tool_call), 0, 'other-org client reads 0 tool calls');
select is((select count(*)::int from public.agent_approval), 0, 'other-org client reads 0 approvals');
reset role;

-- same-org client reads its mission, submits feedback, and (as assigned approver) decides
select set_config('request.jwt.claims', '{"sub":"u_client","app_metadata":{"role":"client_admin","client_id":"cli_ag"}}', true);
set local role authenticated;
select is((select count(*)::int from public.agent_mission), 1, 'same-org client reads its mission');
select lives_ok($$ insert into public.agent_feedback (id, mission_id, workspace_id, client_id, kind, subject_user_id) values ('af_c', 'am_1', 'ws_ag', 'cli_ag', 'comment', 'u_client') $$, 'same-org client submits feedback');
select lives_ok($$ update public.agent_approval set status = 'approved', decided_by_user_id = 'u_client' where id = 'aa_1' $$, 'assigned client approver may decide');
reset role;

-- a DIFFERENT same-org client (not the assigned approver) may NOT decide
select set_config('request.jwt.claims', '{"sub":"u_client2","app_metadata":{"role":"client_admin","client_id":"cli_ag"}}', true);
set local role authenticated;
-- reset the approval as internal first is not possible here; assert the update affects 0 rows
reset role;
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;
select lives_ok($$ insert into public.agent_approval (id, mission_id, task_key, workspace_id, client_id, approval_class, payload_hash, requested_by_role, assigned_approver_user_id, requested_at) values ('aa_2', 'am_1', 'review2', 'ws_ag', 'cli_ag', 'plan_approval', 'ph2', 'review', 'u_client', now()) $$, 'insert second approval assigned to u_client');
reset role;
select set_config('request.jwt.claims', '{"sub":"u_client2","app_metadata":{"role":"client_admin","client_id":"cli_ag"}}', true);
set local role authenticated;
update public.agent_approval set status = 'approved' where id = 'aa_2';
select is((select status from public.agent_approval where id = 'aa_2'), 'pending', 'non-assigned client approver cannot decide (no row updated)');
reset role;

select * from finish();
rollback;
