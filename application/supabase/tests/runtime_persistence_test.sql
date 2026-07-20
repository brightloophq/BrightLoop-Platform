-- =============================================================================
-- Phase B · Sprint 13A — runtime persistence RLS/pgTAP.
--
-- The runtime tables are INTERNAL-ONLY (mirrors signals / business_scans):
--   * internal roles (owner/admin/team_member) read + write across orgs
--   * client roles are denied read (0 rows) AND write (42501) — tenant isolation
--   * runtime_events is APPEND-ONLY: insert + select succeed, update/delete raise
--   * job_queue leases are isolated: a client role cannot see or claim work
-- Impersonation: set `request.jwt.claims` (read by bl_role()/bl_is_internal())
-- and `set local role authenticated`; `reset role` returns to the seeding superuser.
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---- SETUP (seeding superuser — RLS bypassed) ------------------------------
insert into public.clients (id, company) values ('cli_R1', 'Runtime Org A'), ('cli_R2', 'Runtime Org B');
insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_rt_owner', null, 'RT Owner', 'rto@x.co', 'owner',        null,     'active'),
  ('usr_rt_client', null, 'RT Client', 'rtc@x.co', 'client_admin', 'cli_R1', 'active');

-- ---- structure: every runtime table exists ---------------------------------
select has_table('public', 'intelligence_runs',            'intelligence_runs exists');
select has_table('public', 'intelligence_run_stages',      'intelligence_run_stages exists');
select has_table('public', 'intelligence_checkpoints',     'intelligence_checkpoints exists');
select has_table('public', 'intelligence_artifacts',       'intelligence_artifacts exists');
select has_table('public', 'reasoning_jobs',               'reasoning_jobs exists');
select has_table('public', 'provider_attempts',            'provider_attempts exists');
select has_table('public', 'intelligence_findings',        'intelligence_findings exists');
select has_table('public', 'intelligence_recommendations', 'intelligence_recommendations exists');
select has_table('public', 'competitor_snapshots',         'competitor_snapshots exists');
select has_table('public', 'proposal_versions',            'proposal_versions exists');
select has_table('public', 'narrative_versions',           'narrative_versions exists');
select has_table('public', 'runtime_events',               'runtime_events exists');
select has_table('public', 'job_queue',                    'job_queue exists');

-- ---- RLS enabled on every runtime table ------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_runs'::regclass),            'RLS on intelligence_runs');
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_run_stages'::regclass),      'RLS on intelligence_run_stages');
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_checkpoints'::regclass),     'RLS on intelligence_checkpoints');
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_artifacts'::regclass),       'RLS on intelligence_artifacts');
select ok((select relrowsecurity from pg_class where oid = 'public.reasoning_jobs'::regclass),               'RLS on reasoning_jobs');
select ok((select relrowsecurity from pg_class where oid = 'public.provider_attempts'::regclass),            'RLS on provider_attempts');
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_findings'::regclass),        'RLS on intelligence_findings');
select ok((select relrowsecurity from pg_class where oid = 'public.intelligence_recommendations'::regclass), 'RLS on intelligence_recommendations');
select ok((select relrowsecurity from pg_class where oid = 'public.competitor_snapshots'::regclass),         'RLS on competitor_snapshots');
select ok((select relrowsecurity from pg_class where oid = 'public.proposal_versions'::regclass),            'RLS on proposal_versions');
select ok((select relrowsecurity from pg_class where oid = 'public.narrative_versions'::regclass),           'RLS on narrative_versions');
select ok((select relrowsecurity from pg_class where oid = 'public.runtime_events'::regclass),               'RLS on runtime_events');
select ok((select relrowsecurity from pg_class where oid = 'public.job_queue'::regclass),                    'RLS on job_queue');

-- ---- internal role: full runtime write + read ------------------------------
select set_config('request.jwt.claims', '{"sub":"usr_rt_owner","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok(
  $$ insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key, created_by)
     values ('run_1', 'cli_R1', 'scan_1', 'pending', 'idem_run_1', 'usr_rt_owner') $$,
  'internal owner can INSERT an intelligence_run');

select lives_ok(
  $$ insert into public.intelligence_run_stages (id, run_id, client_id, scan_id, stage, status, attempt, idempotency_key)
     values ('stg_1', 'run_1', 'cli_R1', 'scan_1', 'discovery_planning', 'running', 0, 'idem_stg_1') $$,
  'internal owner can INSERT a run stage');

select lives_ok(
  $$ insert into public.intelligence_checkpoints (id, run_id, client_id, scan_id, stage, status, idempotency_key)
     values ('cp_1', 'run_1', 'cli_R1', 'scan_1', 'discovery_planning', 'valid', 'idem_cp_1') $$,
  'internal owner can INSERT a checkpoint');

select lives_ok(
  $$ insert into public.intelligence_artifacts (id, run_id, client_id, scan_id, kind, version, checksum, validation_status, idempotency_key)
     values ('art_1', 'run_1', 'cli_R1', 'scan_1', 'evidence_bundle', 1, 'chk_abc', 'valid', 'idem_art_1') $$,
  'internal owner can INSERT an artifact');

select lives_ok(
  $$ insert into public.reasoning_jobs (id, run_id, client_id, scan_id, stage, task_type, status, idempotency_key)
     values ('job_1', 'run_1', 'cli_R1', 'scan_1', 'research', 'reasoning', 'pending', 'idem_job_1') $$,
  'internal owner can INSERT a reasoning job');

select lives_ok(
  $$ insert into public.provider_attempts (id, reasoning_job_id, run_id, client_id, scan_id, provider_id, attempt, status, idempotency_key)
     values ('att_1', 'job_1', 'run_1', 'cli_R1', 'scan_1', 'p-opaque', 0, 'succeeded', 'idem_att_1') $$,
  'internal owner can INSERT a provider attempt');

select lives_ok(
  $$ insert into public.proposal_versions (id, run_id, client_id, scan_id, status, version, checksum, idempotency_key)
     values ('prp_1', 'run_1', 'cli_R1', 'scan_1', 'draft', 1, 'chk_p1', 'idem_prp_1') $$,
  'internal owner can INSERT a proposal version');

select lives_ok(
  $$ insert into public.narrative_versions (id, run_id, client_id, scan_id, audience, status, version, checksum, idempotency_key)
     values ('nar_1', 'run_1', 'cli_R1', 'scan_1', 'client', 'draft', 1, 'chk_n1', 'idem_nar_1') $$,
  'internal owner can INSERT a narrative version');

select lives_ok(
  $$ insert into public.job_queue (id, job_type, client_id, run_id, scan_id, stage, status, idempotency_key)
     values ('q_1', 'advance_stage', 'cli_R1', 'run_1', 'scan_1', 'discovery_planning', 'queued', 'idem_q_1') $$,
  'internal owner can ENQUEUE a job');

select ok((select count(*)::int from public.intelligence_runs) >= 1, 'internal owner can READ intelligence_runs');
select ok((select count(*)::int from public.job_queue) >= 1,         'internal owner can READ job_queue');

-- ---- idempotency: a duplicate key is rejected by the unique constraint ------
select throws_ok(
  $$ insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key)
     values ('run_dup', 'cli_R1', 'scan_1', 'pending', 'idem_run_1') $$,
  '23505', null,
  'duplicate idempotency_key on intelligence_runs is rejected');

select throws_ok(
  $$ insert into public.intelligence_artifacts (id, run_id, client_id, scan_id, kind, version, checksum, idempotency_key)
     values ('art_dup', 'run_1', 'cli_R1', 'scan_1', 'evidence_bundle', 1, 'chk_other', 'idem_art_other') $$,
  '23505', null,
  'duplicate (run_id, kind, version) artifact is rejected');

select throws_ok(
  $$ insert into public.intelligence_run_stages (id, run_id, client_id, scan_id, stage, attempt, idempotency_key)
     values ('stg_dup', 'run_1', 'cli_R1', 'scan_1', 'discovery_planning', 0, 'idem_stg_other') $$,
  '23505', null,
  'duplicate (run_id, stage, attempt) is rejected');

-- ---- runtime_events: append-only -------------------------------------------
select lives_ok(
  $$ insert into public.runtime_events (id, event_type, run_id, aggregate_id, aggregate_type, client_id, scan_id, sequence, actor)
     values ('ev_1', 'pipeline.created', 'run_1', 'run_1', 'run', 'cli_R1', 'scan_1', 1, 'usr_rt_owner') $$,
  'internal owner can APPEND a runtime event');

-- Append-only, first line of defence: UPDATE/DELETE privileges are REVOKED, so an
-- authenticated role is denied at the table level (42501) before RLS or the
-- trigger is ever reached.
select throws_ok(
  $$ update public.runtime_events set event_type = 'tampered' where id = 'ev_1' $$,
  '42501', null,
  'UPDATE on runtime_events is denied to authenticated (privilege revoked)');

select throws_ok(
  $$ delete from public.runtime_events where id = 'ev_1' $$,
  '42501', null,
  'DELETE on runtime_events is denied to authenticated (privilege revoked)');

select is(
  (select event_type from public.runtime_events where id = 'ev_1'),
  'pipeline.created',
  'the appended event is unchanged after the tamper attempts');

select throws_ok(
  $$ insert into public.runtime_events (id, event_type, aggregate_id, aggregate_type, client_id, sequence)
     values ('ev_dup', 'pipeline.created', 'run_1', 'run', 'cli_R1', 1) $$,
  '23505', null,
  'duplicate (aggregate_type, aggregate_id, sequence) is rejected — deterministic ordering');

reset role;

-- ---- append-only, second line of defence: the trigger fires when RLS is -----
-- bypassed (seeding superuser / service_role paths).
select throws_ok(
  $$ update public.runtime_events set event_type = 'tampered' where id = 'ev_1' $$,
  'runtime_events is append-only',
  'UPDATE on runtime_events raises via the immutability trigger (RLS bypassed)');

select throws_ok(
  $$ delete from public.runtime_events where id = 'ev_1' $$,
  'runtime_events is append-only',
  'DELETE on runtime_events raises via the immutability trigger (RLS bypassed)');

-- ---- client role: denied read AND write across every runtime table ----------
select set_config('request.jwt.claims', '{"sub":"usr_rt_client","app_metadata":{"role":"client_admin","client_id":"cli_R1"}}', true);
set local role authenticated;

select is((select count(*)::int from public.intelligence_runs),            0, 'client role reads 0 intelligence_runs');
select is((select count(*)::int from public.intelligence_run_stages),      0, 'client role reads 0 run stages');
select is((select count(*)::int from public.intelligence_checkpoints),     0, 'client role reads 0 checkpoints');
select is((select count(*)::int from public.intelligence_artifacts),       0, 'client role reads 0 artifacts');
select is((select count(*)::int from public.reasoning_jobs),               0, 'client role reads 0 reasoning jobs');
select is((select count(*)::int from public.provider_attempts),            0, 'client role reads 0 provider attempts');
select is((select count(*)::int from public.intelligence_findings),        0, 'client role reads 0 findings');
select is((select count(*)::int from public.intelligence_recommendations), 0, 'client role reads 0 recommendations');
select is((select count(*)::int from public.competitor_snapshots),         0, 'client role reads 0 competitor snapshots');
select is((select count(*)::int from public.proposal_versions),            0, 'client role reads 0 proposal versions');
select is((select count(*)::int from public.narrative_versions),           0, 'client role reads 0 narrative versions');
select is((select count(*)::int from public.runtime_events),               0, 'client role reads 0 runtime events');
-- queue lease isolation: a client role can neither see nor claim work
select is((select count(*)::int from public.job_queue),                    0, 'client role reads 0 job_queue rows (lease isolation)');

select throws_ok(
  $$ insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key)
     values ('run_c', 'cli_R1', 'scan_c', 'pending', 'idem_run_c') $$,
  '42501', null,
  'client role cannot INSERT an intelligence_run');

select throws_ok(
  $$ insert into public.job_queue (id, job_type, client_id, status, idempotency_key)
     values ('q_c', 'advance_stage', 'cli_R1', 'queued', 'idem_q_c') $$,
  '42501', null,
  'client role cannot ENQUEUE a job');

select throws_ok(
  $$ insert into public.runtime_events (id, event_type, aggregate_id, aggregate_type, client_id, sequence)
     values ('ev_c', 'pipeline.created', 'run_1', 'run', 'cli_R1', 99) $$,
  '42501', null,
  'client role cannot APPEND a runtime event');

-- a client role cannot claim a lease on internal work: the statement matches no
-- rows under RLS. Verified after `reset role` so the check is not itself filtered.
update public.job_queue set lease_owner = 'rogue', lease_status = 'leased', status = 'leased'
  where status = 'queued';

reset role;

select is(
  (select count(*)::int from public.job_queue where lease_owner = 'rogue'),
  0,
  'client role cannot LEASE a queued job (queue lease isolation)');
select is(
  (select status::text from public.job_queue where id = 'q_1'),
  'queued',
  'the queued job is untouched after a client lease attempt');

-- ---- cross-tenant: an internal role is not scoped, but a client of org B is --
select set_config('request.jwt.claims', '{"sub":"usr_rt_client","app_metadata":{"role":"client_member","client_id":"cli_R2"}}', true);
set local role authenticated;
select is((select count(*)::int from public.intelligence_runs), 0, 'org-B client role sees no org-A runtime runs (cross-tenant denial)');
reset role;

select * from finish();
rollback;
