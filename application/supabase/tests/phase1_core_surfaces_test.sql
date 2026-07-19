-- =============================================================================
-- Phase 1 core-surfaces RLS/pgTAP — business_scans / business_domains /
-- scan_findings. These are INTERNAL-ONLY tables (mirrors signals/insights):
--   * permitted internal roles (owner/admin/team_member) read + write across orgs
--   * client roles are denied read (0 rows) AND write (42501) — tenant isolation
-- Impersonation: set `request.jwt.claims` (read by bl_role()/bl_is_internal())
-- and `set local role authenticated`; `reset role` returns to the seeding superuser.
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

-- ---- SETUP (seeding superuser — RLS bypassed) ------------------------------
insert into public.clients (id, company) values ('cli_A', 'Org A'), ('cli_B', 'Org B');
insert into public.users (id, auth_user_id, name, email, role, client_id, status) values
  ('usr_owner', null, 'Owner',   'o@x.co', 'owner',        null,    'active'),
  ('usr_a',     null, 'A Admin', 'a@x.co', 'client_admin', 'cli_A', 'active');

-- ---- structure -------------------------------------------------------------
select has_table('public', 'business_scans',   'business_scans table exists');
select has_table('public', 'business_domains', 'business_domains table exists');
select has_table('public', 'scan_findings',    'scan_findings table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.business_scans'::regclass),   'RLS enabled on business_scans');
select ok((select relrowsecurity from pg_class where oid = 'public.business_domains'::regclass), 'RLS enabled on business_domains');
select ok((select relrowsecurity from pg_class where oid = 'public.scan_findings'::regclass),    'RLS enabled on scan_findings');

-- ---- permitted internal roles: owner can write + read ----------------------
select set_config('request.jwt.claims', '{"sub":"usr_owner","app_metadata":{"role":"owner"}}', true);
set local role authenticated;
select lives_ok(
  $$ insert into public.business_scans (id, client_id, status, baseline_index, target_index, created_by)
     values ('scn_A', 'cli_A', 'diagnosed', 34, 92, 'usr_owner') $$,
  'internal owner can INSERT a business_scan');
select lives_ok(
  $$ insert into public.business_domains (id, client_id, key, status, baseline_score)
     values ('dom_A', 'cli_A', 'sales', 'not_operating', 34) $$,
  'internal owner can INSERT a business_domain');
select lives_ok(
  $$ insert into public.scan_findings (id, scan_id, client_id, domain_key, finding, priority)
     values ('fnd_A', 'scn_A', 'cli_A', 'sales', 'No structured pipeline', 'high') $$,
  'internal owner can INSERT a scan_finding');
select ok((select count(*)::int from public.business_scans) >= 1, 'internal owner can READ business_scans');
reset role;

-- ---- permitted internal roles: team_member can read ------------------------
select set_config('request.jwt.claims', '{"sub":"usr_tm","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select ok((select count(*)::int from public.business_domains) >= 1, 'internal team_member can READ business_domains');
reset role;

-- ---- denied inaccessible tenant: client_admin cannot read ------------------
select set_config('request.jwt.claims', '{"sub":"usr_a","app_metadata":{"role":"client_admin","client_id":"cli_A"}}', true);
set local role authenticated;
select is((select count(*)::int from public.business_scans),   0, 'client cannot READ internal-only business_scans');
select is((select count(*)::int from public.business_domains), 0, 'client cannot READ internal-only business_domains');
select is((select count(*)::int from public.scan_findings),    0, 'client cannot READ internal-only scan_findings');

-- ---- denied inaccessible tenant: client_admin cannot write -----------------
select throws_ok(
  $$ insert into public.business_scans (id, client_id, status, baseline_index, target_index)
     values ('scn_forge', 'cli_A', 'diagnosed', 34, 92) $$,
  '42501', null, 'client cannot INSERT business_scans (write is internal-only)');
select throws_ok(
  $$ insert into public.business_domains (id, client_id, key, status)
     values ('dom_forge', 'cli_B', 'web', 'operating') $$,
  '42501', null, 'client cannot INSERT into another tenant business_domains');
reset role;

select * from finish();
rollback;
