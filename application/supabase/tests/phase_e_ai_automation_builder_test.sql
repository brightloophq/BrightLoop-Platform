-- =============================================================================
-- pgTAP · Phase E · E5 — AI Automation Builder tables.
-- Existence + RLS + checks + optimistic concurrency (intent) + append-only
-- definition records + tenant isolation (other-org client sees nothing; same-org
-- client reads + submits feedback).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_ab', 'AB Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_ab_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'execution_intent', 'execution intent table exists');
select has_table('public', 'automation_plan', 'automation plan table exists');
select has_table('public', 'workflow_definition', 'workflow definition table exists');
select has_table('public', 'workflow_step', 'workflow step table exists');
select has_table('public', 'trigger_definition', 'trigger definition table exists');
select has_table('public', 'action_definition', 'action definition table exists');
select has_table('public', 'condition_definition', 'condition definition table exists');
select has_table('public', 'variable_definition', 'variable definition table exists');
select has_table('public', 'integration_binding', 'integration binding table exists');
select has_table('public', 'deployment_package', 'deployment package table exists');
select has_table('public', 'automation_version', 'automation version table exists');
select has_table('public', 'automation_feedback', 'automation feedback table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.execution_intent'::regclass), 'RLS on intent');
select ok((select relrowsecurity from pg_class where oid = 'public.workflow_step'::regclass), 'RLS on workflow step');

-- seed as internal owner; automation belongs to cli_ab
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.execution_intent (id, workspace_id, client_id, planning_session_id, title, requested_by_user_id) values ('ei_1', 'ws_ab', 'cli_ab', 'pps_1', 'Automate', 'u_int') $$, 'insert intent');
select throws_ok($$ insert into public.execution_intent (id, workspace_id, client_id, planning_session_id, title, requested_by_user_id, status) values ('ei_bad', 'ws_ab', 'cli_ab', 'pps_1', 'X', 'u_int', 'nope') $$, '23514', null, 'invalid intent status rejected');
select lives_ok($$ update public.execution_intent set status = 'building', version = 2 where id = 'ei_1' and version = 1 $$, 'intent draft→building v1→v2');

select lives_ok($$ insert into public.automation_plan (id, execution_intent_id, workspace_id, client_id, status) values ('ap_1', 'ei_1', 'ws_ab', 'cli_ab', 'validated') $$, 'insert plan');
select lives_ok($$ update public.automation_plan set status = 'published' where id = 'ap_1' $$, 'plan status is mutable');
select lives_ok($$ insert into public.workflow_definition (id, automation_plan_id, execution_intent_id, workspace_id, client_id, name, entry_step_key) values ('wf_1', 'ap_1', 'ei_1', 'ws_ab', 'cli_ab', 'WF', 'trigger') $$, 'insert workflow');
select lives_ok($$ update public.workflow_definition set status = 'published', version = 2 where id = 'wf_1' $$, 'workflow status/version mutable');
select lives_ok($$ insert into public.workflow_step (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, key, kind, name) values ('st_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'trigger', 'trigger', 'Start') $$, 'insert step');
select throws_ok($$ insert into public.workflow_step (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, key, kind, name) values ('st_bad', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'x', 'nope', 'X') $$, '23514', null, 'invalid step kind rejected');
select lives_ok($$ insert into public.trigger_definition (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, kind, name) values ('tg_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'manual', 'Start') $$, 'insert trigger');
select lives_ok($$ insert into public.action_definition (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, kind, name) values ('ac_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'create_task', 'Do') $$, 'insert action');
select lives_ok($$ insert into public.variable_definition (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, key, scope, type) values ('vr_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'out', 'output', 'json') $$, 'insert variable');
select throws_ok($$ insert into public.variable_definition (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, key, scope, type) values ('vr_bad', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'x', 'nope', 'json') $$, '23514', null, 'invalid variable scope rejected');
select lives_ok($$ insert into public.integration_binding (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, provider, name, bound) values ('ib_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 'custom', 'Engine', true) $$, 'insert binding');
select lives_ok($$ insert into public.deployment_package (id, execution_intent_id, workflow_definition_id, workspace_id, client_id, target, status) values ('dp_1', 'ei_1', 'wf_1', 'ws_ab', 'cli_ab', 'n8n', 'ready') $$, 'insert deployment package');
select throws_ok($$ insert into public.deployment_package (id, execution_intent_id, workflow_definition_id, workspace_id, client_id, target) values ('dp_bad', 'ei_1', 'wf_1', 'ws_ab', 'cli_ab', 'nope') $$, '23514', null, 'invalid deployment target rejected');
select lives_ok($$ insert into public.automation_version (id, workflow_definition_id, execution_intent_id, workspace_id, client_id, version, status) values ('av_1', 'wf_1', 'ei_1', 'ws_ab', 'cli_ab', 1, 'published') $$, 'insert version');
select lives_ok($$ insert into public.automation_feedback (id, execution_intent_id, workspace_id, client_id, kind, subject_user_id) values ('af_1', 'ei_1', 'ws_ab', 'cli_ab', 'approval', 'u_int') $$, 'insert feedback');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.workflow_step set name = 'x' where id = 'st_1' $$, 'P0001', 'transformation_activity is append-only', 'workflow step UPDATE blocked');
select throws_ok($$ delete from public.automation_version where id = 'av_1' $$, 'P0001', 'transformation_activity is append-only', 'automation version DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_ab_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.execution_intent), 0, 'other-org client reads 0 intents');
select is((select count(*)::int from public.workflow_step), 0, 'other-org client reads 0 steps');
reset role;

-- same-org client reads its automation + submits feedback
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_ab"}}', true);
set local role authenticated;
select is((select count(*)::int from public.execution_intent), 1, 'same-org client reads its intent');
select lives_ok($$ insert into public.automation_feedback (id, execution_intent_id, workspace_id, client_id, kind, subject_user_id, comment) values ('af_c', 'ei_1', 'ws_ab', 'cli_ab', 'comment', 'u_c', 'nice') $$, 'same-org client submits feedback');
reset role;

select * from finish();
rollback;
