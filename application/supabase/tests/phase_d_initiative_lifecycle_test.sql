-- =============================================================================
-- pgTAP · Phase D · D2 — Initiative Lifecycle schema.
-- Asserts the version column, the widened status + activity-type checks, an
-- optimistic-concurrency UPDATE, and that an out-of-range status is rejected.
-- (Transition legality itself is enforced in the pure domain state machine.)
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_d2', 'D2 Co') on conflict do nothing;

-- structure: version column exists
select has_column('public', 'transformation_initiative', 'version', 'initiative.version exists');

-- seed a workspace + initiative as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$
  insert into public.transformation_workspace (id, client_id, scan_run_id, title, seed_checksum)
  values ('txw_d2', 'cli_d2', 'run_d2', 'WS', 'chk_d2') $$, 'seed workspace');
select lives_ok($$
  insert into public.transformation_initiative (id, workspace_id, client_id, source_proposal_item_id, title, priority, effort, business_impact, execution_status, version)
  values ('init_d2', 'txw_d2', 'cli_d2', 'prop:1', 'Init', 'high', 'small', 'high', 'seeded', 1) $$, 'seed initiative v1');

-- lifecycle status values are accepted
select lives_ok($$ update public.transformation_initiative set execution_status = 'planned', version = 2 where id = 'init_d2' and version = 1 $$, 'seeded → planned (optimistic v1→v2)');
select is((select version from public.transformation_initiative where id = 'init_d2'), 2, 'version bumped to 2');

-- optimistic concurrency: an update against a stale version matches 0 rows
select is((select count(*)::int from (update public.transformation_initiative set execution_status = 'active', version = 3 where id = 'init_d2' and version = 1 returning 1) u), 0, 'stale-version UPDATE matches 0 rows');

-- an out-of-range status is rejected by the check constraint (23514)
select throws_ok($$ update public.transformation_initiative set execution_status = 'bogus' where id = 'init_d2' $$, '23514', null, 'invalid status rejected');

-- lifecycle activity types are accepted
select lives_ok($$
  insert into public.transformation_activity (id, workspace_id, client_id, type, subject_type, subject_id, summary, command_id)
  values ('act_d2', 'txw_d2', 'cli_d2', 'initiative_planned', 'initiative', 'init_d2', 'planned', 'init_d2:planned') $$, 'initiative_planned activity accepted');
select throws_ok($$
  insert into public.transformation_activity (id, workspace_id, client_id, type, subject_type, subject_id, summary, command_id)
  values ('act_bad', 'txw_d2', 'cli_d2', 'bogus_type', 'initiative', 'init_d2', 'x', 'x') $$, '23514', null, 'invalid activity type rejected');

reset role;

select * from finish();
rollback;
