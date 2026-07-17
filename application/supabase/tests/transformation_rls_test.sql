-- =============================================================================
-- Sprint 1C — Transformation schema verification (DATABASE LAYER, pgTAP).
--
-- Runs against a REAL Postgres with the migrations applied:
--     supabase test db          (or: psql -f this file inside a txn)
--
-- Covers the Sprint 1C items that require a database:
--   1  migrations apply (tables/enums/triggers exist)
--   2  RLS enabled on every transformation table
--   3  Org A cannot READ Org B records
--   4  Org A cannot INSERT/UPDATE Org B records
--   5  authorized (internal) members can access permitted records
--   6  client-scoped users only access records within their client scope
--   7  approval CHECK: a decided approval must name an approver + timestamp
--      (full "approver == actor" enforcement is a service/RPC concern — see report)
--   9  foreign-key relationships are enforced
--   10 duplicate idempotency keys are rejected; NULL keys are unconstrained
--   12 parent deletes follow retention rules (client → cascade; user → set null)
--   +  the Move approval gate (human authority in the data model)
--
-- RLS impersonation: set `request.jwt.claims` (read by bl_role()/bl_client_id())
-- and `set local role authenticated`; `reset role` returns to the seeding superuser.
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---------------------------------------------------------------------------
-- SETUP (as the seeding superuser — RLS bypassed)
-- ---------------------------------------------------------------------------
insert into public.clients (id, company) values ('cli_A', 'Org A'), ('cli_B', 'Org B');

insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_owner', null, 'Owner',   'owner@x.co', 'owner',        null,    'active'),
  ('usr_temp',  null, 'Temp',    'temp@x.co',  'team_member',  null,    'active'),
  ('usr_a',     null, 'A Admin', 'a@x.co',     'client_admin', 'cli_A', 'active'),
  ('usr_b',     null, 'B Admin', 'b@x.co',     'client_admin', 'cli_B', 'active');

-- one internal-only signal and one client-readable health snapshot per org
insert into public.signals (id, client_id, title, created_by) values
  ('sig_A', 'cli_A', 'A signal', 'usr_temp'),
  ('sig_B', 'cli_B', 'B signal', null);

insert into public.business_health (id, client_id, score, captured_at) values
  ('bh_A', 'cli_A', 50, now()),
  ('bh_B', 'cli_B', 60, now());

-- a move + a granted approval for the gate / retention tests
insert into public.moves (id, client_id, title, intent, status) values
  ('mov_A', 'cli_A', 'Add triage', 'Cut delivery time', 'approved');
insert into public.approvals (id, client_id, subject_type, subject_id, decision, approver_user_id, decided_at)
  values ('apr_A', 'cli_A', 'move', 'mov_A', 'granted', 'usr_owner', now());

-- ---------------------------------------------------------------------------
-- ITEM 1 — migrations applied: every transformation table exists
-- ---------------------------------------------------------------------------
select has_table('public', 'signals', 'signals table exists');
select has_table('public', 'insights', 'insights table exists');
select has_table('public', 'recommendations', 'recommendations table exists');
select has_table('public', 'approvals', 'approvals table exists');
select has_table('public', 'moves', 'moves table exists');
select has_table('public', 'execution_records', 'execution_records table exists');
select has_table('public', 'measurements', 'measurements table exists');
select has_table('public', 'learnings', 'learnings table exists');
select has_table('public', 'business_health', 'business_health table exists');
select has_table('public', 'transformation_index', 'transformation_index table exists');
select has_table('public', 'operational_risks', 'operational_risks table exists');
select has_table('public', 'knowledge_assets', 'knowledge_assets table exists');

-- ---------------------------------------------------------------------------
-- ITEM 2 — RLS is enabled on every transformation table
-- ---------------------------------------------------------------------------
select is(
  (select bool_and(c.relrowsecurity)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('signals','insights','recommendations','approvals','moves',
                        'execution_records','measurements','learnings','business_health',
                        'transformation_index','operational_risks','knowledge_assets')),
  true,
  'RLS is enabled on all 12 transformation tables'
);

-- ---------------------------------------------------------------------------
-- ITEM 9 — foreign keys are enforced
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.insights (id, client_id, signal_id, summary)
     values ('ins_bad', 'cli_A', 'sig_DOES_NOT_EXIST', 's') $$,
  '23503',
  null,
  'FK: an insight cannot reference a non-existent signal'
);
select throws_ok(
  $$ insert into public.signals (id, client_id, title)
     values ('sig_bad', 'cli_DOES_NOT_EXIST', 't') $$,
  '23503',
  null,
  'FK: a signal cannot reference a non-existent client (tenant)'
);

-- ---------------------------------------------------------------------------
-- ITEM 7 — approval CHECK: a decided approval must name an approver + timestamp
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.approvals (id, client_id, subject_type, subject_id, decision)
     values ('apr_bad', 'cli_A', 'move', 'mov_A', 'granted') $$,
  '23514',
  null,
  'CHECK: a granted approval without approver/decided_at is rejected'
);
select lives_ok(
  $$ insert into public.approvals (id, client_id, subject_type, subject_id, decision)
     values ('apr_pending', 'cli_A', 'move', 'mov_A', 'pending') $$,
  'a pending approval needs no approver yet'
);

-- ---------------------------------------------------------------------------
-- ITEM 10 — idempotency keys: duplicates rejected, NULLs unconstrained
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.execution_records (id, client_id, move_id, idempotency_key)
     values ('exe_1', 'cli_A', 'mov_A', 'key-1') $$,
  'first execution with an idempotency key inserts'
);
select throws_ok(
  $$ insert into public.execution_records (id, client_id, move_id, idempotency_key)
     values ('exe_2', 'cli_A', 'mov_A', 'key-1') $$,
  '23505',
  null,
  'a duplicate idempotency key is rejected (retry-safe)'
);
select lives_ok(
  $$ insert into public.execution_records (id, client_id, move_id, idempotency_key)
     values ('exe_3', 'cli_A', 'mov_A', null), ('exe_4', 'cli_A', 'mov_A', null) $$,
  'multiple NULL idempotency keys are allowed (partial unique index)'
);

-- ---------------------------------------------------------------------------
-- MOVE APPROVAL GATE — human authority enforced in the database
-- ---------------------------------------------------------------------------
-- A move with no granted approval cannot enter 'executing'.
insert into public.moves (id, client_id, title, intent, status)
  values ('mov_noapp', 'cli_A', 'Ungated', 'x', 'approved');
select throws_ok(
  $$ update public.moves set status = 'executing' where id = 'mov_noapp' $$,
  '23514',
  null,
  'GATE: a move cannot execute without a granted approval'
);
-- The seeded move WITH a granted approval can execute once its approval is attached.
select lives_ok(
  $$ update public.moves set status = 'executing', approval_id = 'apr_A' where id = 'mov_A' $$,
  'GATE: a move with a granted approval may execute'
);

-- ---------------------------------------------------------------------------
-- ITEMS 3 / 6 — Org A (client_admin) READ isolation
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"usr_a","app_metadata":{"role":"client_admin","client_id":"cli_A"}}', true);
set local role authenticated;

select is( (select count(*)::int from public.business_health),
           1, 'client A reads only its own business_health (not Org B)' );
select is( (select count(*)::int from public.business_health where client_id = 'cli_B'),
           0, 'client A cannot read Org B business_health' );
select is( (select count(*)::int from public.signals),
           0, 'client A cannot read internal-only signals at all' );
select is( (select count(*)::int from public.approvals where client_id = 'cli_B'),
           0, 'client A cannot read Org B approvals' );

reset role;

-- ---------------------------------------------------------------------------
-- ITEM 4 — Org A cannot WRITE (insert/update) permitted or foreign records
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"usr_a","app_metadata":{"role":"client_admin","client_id":"cli_A"}}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.business_health (id, client_id, score, captured_at)
     values ('bh_forge', 'cli_A', 99, now()) $$,
  '42501',
  null,
  'client A cannot INSERT business_health (write is internal-only)'
);
select throws_ok(
  $$ insert into public.signals (id, client_id, title) values ('sig_forge', 'cli_B', 'x') $$,
  '42501',
  null,
  'client A cannot INSERT a signal into Org B (internal-only + isolation)'
);

reset role;

-- ---------------------------------------------------------------------------
-- ITEM 5 — authorized internal members can access permitted records
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"usr_owner","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select ok( (select count(*)::int from public.signals) >= 2,
           'an internal owner can read signals across all orgs' );
select lives_ok(
  $$ insert into public.signals (id, client_id, title) values ('sig_owner', 'cli_A', 'ok') $$,
  'an internal owner can insert a signal'
);

reset role;

-- ---------------------------------------------------------------------------
-- ITEM 12 — retention: parent deletes follow the intended rules
-- ---------------------------------------------------------------------------
-- client delete cascades to its transformation rows
delete from public.clients where id = 'cli_B';
select is( (select count(*)::int from public.signals where client_id = 'cli_B'),
           0, 'deleting a client cascades to its signals' );
select is( (select count(*)::int from public.business_health where client_id = 'cli_B'),
           0, 'deleting a client cascades to its business_health' );

-- deleting an actor sets created_by to NULL (attribution retained as null, row kept)
delete from public.users where id = 'usr_temp';
select is( (select created_by from public.signals where id = 'sig_A'),
           null, 'deleting an actor sets created_by to NULL (row is retained)' );

select * from finish();
rollback;
