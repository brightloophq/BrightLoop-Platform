-- =============================================================================
-- Scan finding provenance — the column that makes "replace on import" safe.
--
--     supabase test db
--
-- What has to be true:
--   1  a finding defaults to `manual`, so nothing already written is at risk
--   2  an imported row records which scan run it came from
--   3  a manual row cannot claim a source run
--   4  the enum admits exactly two values
--   5  deleting a finding removes exactly that row
-- =============================================================================

begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_prov', 'Provenance Client');
insert into public.business_scans (id, client_id, status, baseline_index, target_index)
  values ('scn_prov', 'cli_prov', 'diagnosed', 40, 92);

-- ---------------------------------------------------------------------------
-- 1 · the default is manual
-- ---------------------------------------------------------------------------
insert into public.scan_findings (id, scan_id, client_id, domain_key, finding, priority)
  values ('fnd_typed', 'scn_prov', 'cli_prov', 'web', 'Owner answers the phone at night', 'medium');

select is( (select source::text from public.scan_findings where id = 'fnd_typed'),
           'manual', 'a finding written without a source is manual, never an import' );
select is( (select source_run_id from public.scan_findings where id = 'fnd_typed'),
           null, 'and names no scan run' );

-- ---------------------------------------------------------------------------
-- 2 · an import records the run it came from
-- ---------------------------------------------------------------------------
insert into public.scan_findings (id, scan_id, client_id, domain_key, finding, priority, source, source_run_id)
  values ('fnd_scanned', 'scn_prov', 'cli_prov', 'sales', 'Weak lead capture', 'high', 'import', 'run_prov');

select is( (select source_run_id from public.scan_findings where id = 'fnd_scanned'),
           'run_prov', 'an imported finding records which scan produced it' );

-- ---------------------------------------------------------------------------
-- 3 · a manual row cannot claim a scan run
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.scan_findings (id, scan_id, client_id, domain_key, finding, source, source_run_id)
     values ('fnd_bad', 'scn_prov', 'cli_prov', 'web', 'Hand written', 'manual', 'run_prov') $$,
  '23514', null, 'a manual finding cannot cite a scan run it did not come from'
);

-- ---------------------------------------------------------------------------
-- 4 · the vocabulary is closed
-- ---------------------------------------------------------------------------
select set_eq(
  $$ select unnest(enum_range(null::public.finding_source))::text $$,
  array['manual', 'import'],
  'finding_source admits exactly manual and import'
);

-- ---------------------------------------------------------------------------
-- 5 · removing a finding removes exactly one row
-- ---------------------------------------------------------------------------
delete from public.scan_findings where id = 'fnd_scanned';
select is( (select count(*)::integer from public.scan_findings where scan_id = 'scn_prov'),
           1, 'deleting the imported row leaves the hand-written one' );
select is( (select id from public.scan_findings where scan_id = 'scn_prov'),
           'fnd_typed', 'and it is the one a person wrote' );

select * from finish();
rollback;
