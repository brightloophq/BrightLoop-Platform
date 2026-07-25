-- =============================================================================
-- pgTAP · Phase D · D1 — Transformation Execution workspace tables.
-- Asserts existence, RLS-on, internal insert, seed idempotency (unique),
-- append-only activity, and cross-tenant isolation.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

-- ---- seed prerequisite rows as superuser (RLS bypassed) ---------------------
insert into public.clients (id, company) values ('cli_d1', 'D1 Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_d1_other', 'Other Co') on conflict do nothing;

-- ---- structure --------------------------------------------------------------
select has_table('public', 'transformation_workspace', 'workspace table exists');
select has_table('public', 'transformation_initiative', 'initiative table exists');
select has_table('public', 'transformation_activity', 'activity table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_workspace'::regclass), 'RLS on workspace');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_initiative'::regclass), 'RLS on initiative');
select ok((select relrowsecurity from pg_class where oid = 'public.transformation_activity'::regclass), 'RLS on activity');

-- ---- internal role: full write ---------------------------------------------
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$
  insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum)
  values ('txw_1', 'cli_d1', 'run_1', 'WS', 'chk_1') $$, 'internal owner INSERTs a workspace');
select lives_ok($$
  insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact)
  values ('init_1', 'txw_1', 'cli_d1', 'prop:1', 'Init', 'high', 'small', 'high') $$, 'internal owner INSERTs an initiative');
select lives_ok($$
  insert into public.transformation_activity (id, workspace_id, client_id, type, subject_type, subject_id, summary, command_id)
  values ('act_1', 'txw_1', 'cli_d1', 'workspace_created', 'workspace', 'txw_1', 'seeded', 'cmd_1') $$, 'internal owner INSERTs an activity');

-- seed idempotency identity: duplicate (scan_run_id, seed_checksum) rejected
select throws_ok($$
  insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum)
  values ('txw_dup', 'cli_d1', 'run_1', 'WS', 'chk_1') $$, '23505', null, 'duplicate seed rejected');

-- append-only activity: UPDATE and DELETE both blocked
select throws_ok($$ update public.transformation_activity set summary = 'x' where id = 'act_1' $$, null, null, 'activity UPDATE blocked');
select throws_ok($$ delete from public.transformation_activity where id = 'act_1' $$, null, null, 'activity DELETE blocked');
-- activity command_id is unique (idempotent append)
select throws_ok($$
  insert into public.transformation_activity (id, workspace_id, client_id, type, subject_type, subject_id, summary, command_id)
  values ('act_dup', 'txw_1', 'cli_d1', 'workspace_created', 'workspace', 'txw_1', 'seeded', 'cmd_1') $$, '23505', null, 'duplicate command_id rejected');

reset role;

-- ---- client role: tenant isolation -----------------------------------------
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_d1_other"}}', true);
set local role authenticated;

select is((select count(*)::int from public.transformation_workspace), 0, 'client role reads 0 workspaces (internal-only RLS)');
select is((select count(*)::int from public.transformation_initiative), 0, 'client role reads 0 initiatives');
select throws_ok($$
  insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum)
  values ('txw_x', 'cli_d1_other', 'run_x', 'WS', 'chk_x') $$, '42501', null, 'client cannot INSERT a workspace');

reset role;

select * from finish();
rollback;
