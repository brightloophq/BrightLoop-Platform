-- =============================================================================
-- pgTAP · Phase E · E8 — Platform Certification tables.
-- Existence + RLS + checks + optimistic concurrency (run) + append-only records +
-- internal-only isolation (clients have NO certification access).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_ct', 'Cert Co') on conflict do nothing;

select has_table('public', 'certification_run', 'certification_run exists');
select has_table('public', 'certification_result', 'certification_result exists');
select has_table('public', 'certification_issue', 'certification_issue exists');
select has_table('public', 'certification_exception', 'certification_exception exists');
select ok((select relrowsecurity from pg_class where oid = 'public.certification_run'::regclass), 'RLS on run');
select ok((select relrowsecurity from pg_class where oid = 'public.certification_issue'::regclass), 'RLS on issue');

-- internal owner may run certification
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.certification_run (id, workspace_id, client_id, title, requested_by_user_id, correlation_id) values ('cr_1', 'ws_ct', 'cli_ct', 'Cert', 'u_int', 'corr_1') $$, 'insert run');
select throws_ok($$ insert into public.certification_run (id, workspace_id, client_id, title, requested_by_user_id, correlation_id, outcome) values ('cr_bad', 'ws_ct', 'cli_ct', 'X', 'u_int', 'c', 'nope') $$, '23514', null, 'invalid outcome rejected');
select lives_ok($$ update public.certification_run set status = 'completed', outcome = 'passed', version = 2 where id = 'cr_1' and version = 1 $$, 'run version bump');
select lives_ok($$ insert into public.certification_result (id, run_id, workspace_id, client_id, category, outcome) values ('cres_1', 'cr_1', 'ws_ct', 'cli_ct', 'security', 'passed') $$, 'insert result');
select throws_ok($$ insert into public.certification_result (id, run_id, workspace_id, client_id, category, outcome) values ('cres_bad', 'cr_1', 'ws_ct', 'cli_ct', 'nope', 'passed') $$, '23514', null, 'invalid category rejected');
select lives_ok($$ insert into public.certification_issue (id, run_id, workspace_id, client_id, category, severity, code, title) values ('ci_1', 'cr_1', 'ws_ct', 'cli_ct', 'security', 'high', 'x.y', 'issue') $$, 'insert issue');
select lives_ok($$ insert into public.certification_exception (id, run_id, workspace_id, client_id, issue_code, reason, approved_by_user_id) values ('ce_1', 'cr_1', 'ws_ct', 'cli_ct', 'x.y', 'documented', 'u_int') $$, 'insert exception');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.certification_result set score = 1 where id = 'cres_1' $$, 'P0001', 'transformation_activity is append-only', 'result UPDATE blocked');
select throws_ok($$ delete from public.certification_issue where id = 'ci_1' $$, 'P0001', 'transformation_activity is append-only', 'issue DELETE blocked');

-- a client role has NO certification access (internal-only)
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_ct"}}', true);
set local role authenticated;
select is((select count(*)::int from public.certification_run), 0, 'client reads 0 certification runs');
select is((select count(*)::int from public.certification_result), 0, 'client reads 0 certification results');
reset role;

select * from finish();
rollback;
