-- =============================================================================
-- Phase B · Sprint 13B — bl_lease_next_job() atomic lease RPC.
--
-- Verifies: the function exists, leases in priority/available_at/created_at
-- order, marks the row leased with owner + bounded expiry, increments attempt,
-- skips jobs that are not yet available, returns zero rows when nothing
-- qualifies, honours the job_type/client_id filters, and — because it is
-- SECURITY INVOKER — leases NOTHING for a client role (RLS still applies).
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---- SETUP (seeding superuser — RLS bypassed) ------------------------------
insert into public.clients (id, company) values ('cli_L1', 'Lease Org A'), ('cli_L2', 'Lease Org B');
insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_l_owner',  null, 'L Owner',  'lo@x.co', 'owner',        null,     'active'),
  ('usr_l_client', null, 'L Client', 'lc@x.co', 'client_admin', 'cli_L1', 'active');

insert into public.intelligence_runs (id, client_id, scan_id, status, idempotency_key)
values ('run_L', 'cli_L1', 'scan_L', 'pending', 'idem_run_L');

-- three eligible jobs (distinct priorities) + one not-yet-available + one leased
insert into public.job_queue (id, job_type, client_id, run_id, scan_id, status, priority, available_at, idempotency_key) values
  ('q_mid',   'advance_stage', 'cli_L1', 'run_L', 'scan_L', 'queued', 5,  now() - interval '1 minute', 'idem_q_mid'),
  ('q_first', 'advance_stage', 'cli_L1', 'run_L', 'scan_L', 'queued', 1,  now() - interval '1 minute', 'idem_q_first'),
  ('q_last',  'advance_stage', 'cli_L1', 'run_L', 'scan_L', 'queued', 9,  now() - interval '1 minute', 'idem_q_last'),
  ('q_future','advance_stage', 'cli_L1', 'run_L', 'scan_L', 'queued', 0,  now() + interval '1 hour',   'idem_q_future'),
  ('q_other', 'send_report',   'cli_L2', 'run_L', 'scan_L', 'queued', 0,  now() - interval '1 minute', 'idem_q_other');

-- ---- structure --------------------------------------------------------------
select has_function('public', 'bl_lease_next_job', 'bl_lease_next_job() exists');

-- ---- internal role: leases in priority order --------------------------------
select set_config('request.jwt.claims', '{"sub":"usr_l_owner","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select is(
  (select id from public.bl_lease_next_job('worker_1', 60, 'advance_stage', null)),
  'q_first',
  'leases the lowest-priority-number job first');

select is(
  (select id from public.bl_lease_next_job('worker_2', 60, 'advance_stage', null)),
  'q_mid',
  'leases the next job by priority on a second call (the first is no longer queued)');

-- the leased row carries owner, status and a bounded expiry; attempt incremented
select is((select status::text      from public.job_queue where id = 'q_first'), 'leased',   'leased job status is leased');
select is((select lease_status::text from public.job_queue where id = 'q_first'), 'leased',   'leased job lease_status is leased');
select is((select lease_owner        from public.job_queue where id = 'q_first'), 'worker_1', 'lease_owner is recorded');
select is((select attempt            from public.job_queue where id = 'q_first'), 1,          'attempt is incremented on lease');
select ok((select lease_expires_at   from public.job_queue where id = 'q_first') > now(),      'lease_expires_at is in the future');
select ok((select lease_expires_at   from public.job_queue where id = 'q_first') <= now() + interval '61 seconds',
          'lease_expires_at is bounded by the requested duration');

-- ---- a job that is not yet available is never leased ------------------------
select is(
  (select count(*)::int from public.bl_lease_next_job('worker_3', 60, 'advance_stage', null)),
  1,
  'a third call leases the last eligible advance_stage job');
select is(
  (select count(*)::int from public.bl_lease_next_job('worker_4', 60, 'advance_stage', null)),
  0,
  'no rows returned once every eligible job is leased (q_future stays queued)');
select is((select status::text from public.job_queue where id = 'q_future'), 'queued',
          'a job whose available_at is in the future is left queued');

-- ---- filters ----------------------------------------------------------------
select is(
  (select id from public.bl_lease_next_job('worker_5', 60, 'send_report', null)),
  'q_other',
  'job_type filter selects only matching work');

insert into public.job_queue (id, job_type, client_id, run_id, scan_id, status, priority, available_at, idempotency_key)
values ('q_tenant', 'advance_stage', 'cli_L2', 'run_L', 'scan_L', 'queued', 0, now() - interval '1 minute', 'idem_q_tenant');
select is(
  (select count(*)::int from public.bl_lease_next_job('worker_6', 60, 'advance_stage', 'cli_L1')),
  0,
  'client_id filter prevents leasing another tenant''s job');
select is(
  (select id from public.bl_lease_next_job('worker_7', 60, 'advance_stage', 'cli_L2')),
  'q_tenant',
  'client_id filter leases the matching tenant''s job');

reset role;

-- ---- client role: SECURITY INVOKER means RLS still applies ------------------
insert into public.job_queue (id, job_type, client_id, run_id, scan_id, status, priority, available_at, idempotency_key)
values ('q_rls', 'advance_stage', 'cli_L1', 'run_L', 'scan_L', 'queued', 0, now() - interval '1 minute', 'idem_q_rls');

select set_config('request.jwt.claims', '{"sub":"usr_l_client","app_metadata":{"role":"client_admin","client_id":"cli_L1"}}', true);
set local role authenticated;

select is(
  (select count(*)::int from public.bl_lease_next_job('rogue_worker', 60, null, null)),
  0,
  'a client role leases NOTHING through the RPC (SECURITY INVOKER + RLS)');

reset role;

select is((select status::text from public.job_queue where id = 'q_rls'), 'queued',
          'the job remains queued after a client-role RPC attempt');
select is((select count(*)::int from public.job_queue where lease_owner = 'rogue_worker'), 0,
          'no row was ever leased by the rogue worker');

select * from finish();
rollback;
