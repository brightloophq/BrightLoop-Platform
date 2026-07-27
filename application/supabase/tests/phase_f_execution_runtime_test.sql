-- =============================================================================
-- pgTAP · Phase F · F3 — Execution Runtime tables.
-- Existence + RLS + enum checks + optimistic concurrency (deployment) +
-- append-only history/logs + credential INTERNAL-ONLY isolation + tenant
-- isolation (other-org client sees nothing; same-org client reads deployments +
-- executions but never credential references) + unique idempotency constraints.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_rt', 'Runtime Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_rt_other', 'Other Co') on conflict do nothing;

-- structure + RLS
select has_table('public', 'runtime_registration', 'runtime registration table exists');
select has_table('public', 'runtime_deployment', 'deployment table exists');
select has_table('public', 'runtime_execution', 'execution table exists');
select has_table('public', 'runtime_credential_reference', 'credential reference table exists');
select has_table('public', 'runtime_deployment_event', 'deployment event table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.runtime_registration'::regclass), 'RLS on registration');
select ok((select relrowsecurity from pg_class where oid = 'public.runtime_deployment'::regclass), 'RLS on deployment');
select ok((select relrowsecurity from pg_class where oid = 'public.runtime_credential_reference'::regclass), 'RLS on credential reference');

-- seed as internal owner; everything belongs to cli_rt
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.runtime_registration (id, workspace_id, client_id, provider, display_name, environment, base_url_ref, created_by_user_id, correlation_id) values ('rt_1','ws_rt','cli_rt','n8n','Prod','production','urlref','u_int','c1') $$, 'insert runtime');
select throws_ok($$ insert into public.runtime_registration (id, workspace_id, client_id, provider, display_name, environment, base_url_ref, created_by_user_id, correlation_id, status) values ('rt_bad','ws_rt','cli_rt','n8n','X','production','u','u','c','nope') $$, '23514', null, 'invalid runtime status rejected');
select throws_ok($$ insert into public.runtime_registration (id, workspace_id, client_id, provider, display_name, environment, base_url_ref, created_by_user_id, correlation_id) values ('rt_bad2','ws_rt','cli_rt','zapier','X','production','u','u','c') $$, '23514', null, 'invalid provider rejected');

select lives_ok($$ insert into public.runtime_credential_reference (id, workspace_id, client_id, provider, secret_ref, created_by_user_id) values ('cr_1','ws_rt','cli_rt','n8n','ref_abc','u_int') $$, 'insert credential reference');

select lives_ok($$ insert into public.runtime_deployment (id, workspace_id, client_id, runtime_registration_id, provider, deployment_package_id, package_hash, workflow_definition_id, deployment_version, target_environment, requested_by_user_id, correlation_id, trace_id) values ('dep_1','ws_rt','cli_rt','rt_1','n8n','pkg_1','h1','wf_1',1,'production','u_int','c','t') $$, 'insert deployment');
select throws_ok($$ insert into public.runtime_deployment (id, workspace_id, client_id, runtime_registration_id, provider, deployment_package_id, package_hash, workflow_definition_id, deployment_version, target_environment, requested_by_user_id, correlation_id, trace_id, status) values ('dep_bad','ws_rt','cli_rt','rt_1','n8n','pkg_1','h','wf',2,'production','u','c','t','nope') $$, '23514', null, 'invalid deployment status rejected');
-- unique (package, runtime, version)
select throws_ok($$ insert into public.runtime_deployment (id, workspace_id, client_id, runtime_registration_id, provider, deployment_package_id, package_hash, workflow_definition_id, deployment_version, target_environment, requested_by_user_id, correlation_id, trace_id) values ('dep_dup','ws_rt','cli_rt','rt_1','n8n','pkg_1','h','wf',1,'production','u','c','t') $$, '23505', null, 'duplicate deployment version rejected');
-- optimistic concurrency: status is mutable via version bump
select lives_ok($$ update public.runtime_deployment set status='validating', version=2 where id='dep_1' and version=1 $$, 'deployment draft→validating v1→v2');

select lives_ok($$ insert into public.runtime_deployment_event (id, deployment_id, workspace_id, client_id, to_status, reason, correlation_id) values ('ev_1','dep_1','ws_rt','cli_rt','validating','v','c') $$, 'insert deployment event');
select lives_ok($$ insert into public.runtime_deployment_attempt (id, deployment_id, workspace_id, client_id, operation, idempotency_key, started_at) values ('at_1','dep_1','ws_rt','cli_rt','deploy','deploy:ws_rt:pkg_1:rt_1:h1', now()) $$, 'insert deployment attempt');
select lives_ok($$ insert into public.runtime_execution (id, workspace_id, client_id, deployment_id, runtime_registration_id, external_execution_id, correlation_id, trace_id) values ('ex_1','ws_rt','cli_rt','dep_1','rt_1','n8n_exec_1','c','t') $$, 'insert execution');
select throws_ok($$ insert into public.runtime_execution (id, workspace_id, client_id, deployment_id, runtime_registration_id, external_execution_id, correlation_id, trace_id) values ('ex_dup','ws_rt','cli_rt','dep_1','rt_1','n8n_exec_1','c','t') $$, '23505', null, 'duplicate external execution id rejected');
select lives_ok($$ insert into public.runtime_webhook_receipt (id, workspace_id, client_id, runtime_registration_id, provider, external_event_id, idempotency_key, received_at) values ('wh_1','ws_rt','cli_rt','rt_1','n8n','evt_1','webhook:n8n:rt_1:evt_1', now()) $$, 'insert webhook receipt');

-- append-only: exercise the triggers as table owner
reset role;
select throws_ok($$ update public.runtime_deployment_event set reason='x' where id='ev_1' $$, 'P0001', 'transformation_activity is append-only', 'deployment event UPDATE blocked');
select throws_ok($$ delete from public.runtime_execution_failure where id='nope' $$, 'P0001', 'transformation_activity is append-only', 'execution failure DELETE blocked (trigger fires before row check)');
select throws_ok($$ update public.runtime_webhook_receipt set status='processed' where id='wh_1' $$, 'P0001', 'transformation_activity is append-only', 'webhook receipt UPDATE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_rt_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.runtime_deployment), 0, 'other-org client reads 0 deployments');
select is((select count(*)::int from public.runtime_execution), 0, 'other-org client reads 0 executions');
reset role;

-- same-org client: reads its deployments + executions, but NEVER credential references
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_rt"}}', true);
set local role authenticated;
select is((select count(*)::int from public.runtime_deployment), 1, 'same-org client reads its deployment');
select is((select count(*)::int from public.runtime_execution), 1, 'same-org client reads its execution');
select is((select count(*)::int from public.runtime_credential_reference), 0, 'client CANNOT read credential references (internal-only)');
-- a client may not write a deployment (internal-only write)
select throws_ok($$ insert into public.runtime_deployment (id, workspace_id, client_id, runtime_registration_id, provider, deployment_package_id, package_hash, workflow_definition_id, deployment_version, target_environment, requested_by_user_id, correlation_id, trace_id) values ('dep_c','ws_rt','cli_rt','rt_1','n8n','pkg_2','h','wf',1,'production','u_c','c','t') $$, '42501', null, 'client cannot write a deployment');
reset role;

select * from finish();
rollback;
