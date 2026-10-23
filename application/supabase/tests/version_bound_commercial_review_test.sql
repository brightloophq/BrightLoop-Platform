-- Sprint 1C. Real inter-transaction races are covered by the adapter integration
-- suite; this rollback-only suite exercises direct privileged SQL boundaries.
begin;
create extension if not exists pgtap;
select no_plan();
insert into public.intelligence_runs (id, scan_id, status, idempotency_key)
  values ('vb_run', 'vb_scan', 'completed', 'vb_run');
insert into public.proposal_versions (id, run_id, scan_id, status, version, checksum, idempotency_key)
  values ('vb_p1', 'vb_run', 'vb_scan', 'needs_review', 1, 'p1', 'vb_p1');
insert into public.narrative_versions (id, run_id, scan_id, audience, status, version, checksum, idempotency_key)
  values ('vb_n1', 'vb_run', 'vb_scan', 'client', 'needs_review', 1, 'n1', 'vb_n1');
insert into public.intelligence_artifacts (id, run_id, scan_id, kind, version, checksum, validation_status, idempotency_key)
  values ('vb_r1', 'vb_run', 'vb_scan', 'internal_intelligence_report', 1, 'r1', 'valid', 'vb_r1');
create temporary table vb_binding (value jsonb);
insert into vb_binding values ('{"schemaVersion":1,"proposal":{"id":"vb_p1","version":1,"checksum":"p1"},"narrative":{"id":"vb_n1","version":1,"checksum":"n1"},"report":{"id":"vb_r1","version":1,"checksum":"r1"},"competitor":null,"coreProposal":null}');
grant select on vb_binding to authenticated, service_role;

prepare vb_review(text, text, jsonb, bigint) as
  insert into public.runtime_events (id, event_type, run_id, scan_id, aggregate_type, aggregate_id, sequence, payload)
  values ($1, $2, 'vb_run', 'vb_scan', 'intelligence_run', 'vb_run', $4,
    jsonb_build_object('by', '00000000-0000-4000-8000-000000000001', 'binding', $3));
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', true);
set local role authenticated;
select lives_ok(format('execute vb_review(%L,%L,%L,1)', 'vb_approved', 'runtime.review.approved', value), 'current bound approval accepted') from vb_binding;
select is((select payload -> 'binding' from public.runtime_events where id = 'vb_approved'),
  (select value from vb_binding), 'persisted binding contains only server-current identities');
select is((select actor from public.runtime_events where id = 'vb_approved'), '00000000-0000-4000-8000-000000000001', 'Sprint 1A actor stamping retained');
select lives_ok(format('execute vb_review(%L,%L,%L,2)', 'vb_rejected', 'runtime.review.rejected', value), 'rejection bound to current versions') from vb_binding;
select lives_ok(format('execute vb_review(%L,%L,%L,3)', 'vb_revision', 'runtime.review.revision_requested', value), 'revision request bound to current versions') from vb_binding;
reset role;

-- Direct table-owner writes bypass RLS but cannot bypass current binding checks.
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_forged', 'runtime.review.approved',
  jsonb_set(value, '{proposal,id}', '"forged"')), '40001', null, 'forged proposal identity denied under RLS bypass') from vb_binding;
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_forged_checksum', 'runtime.review.approved',
  jsonb_set(value, '{report,checksum}', '"forged"')), '40001', null, 'forged source checksum denied') from vb_binding;
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_extra', 'runtime.review.approved',
  value || '{"clientReady":true}'::jsonb), '40001', null, 'extra forged binding fields denied') from vb_binding;
select throws_ok($$execute vb_review('vb_null', 'runtime.review.approved', null, 90)$$,
  '40001', null, 'explicit null binding denied');

select throws_ok($$update public.intelligence_artifacts set envelope = '{"changed":true}' where id = 'vb_r1'$$,
  '55000', 'Reviewed source artifacts are append-only', 'source content cannot change under a reviewed identity');
select throws_ok($$delete from public.intelligence_artifacts where id = 'vb_r1'$$,
  '55000', 'Reviewed source artifacts are append-only', 'source identity cannot be deleted');
select throws_ok($$truncate public.intelligence_artifacts$$,
  '55000', 'Reviewed source artifacts are append-only', 'TRUNCATE cannot bypass source history');

insert into public.proposal_versions (id, run_id, scan_id, status, version, checksum, idempotency_key, supersedes_id)
  values ('vb_p2', 'vb_run', 'vb_scan', 'needs_review', 2, 'p2', 'vb_p2', 'vb_p1');
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_stale_proposal', 'runtime.review.approved', value),
  '40001', null, 'pricing or scope revision makes old approval precondition stale') from vb_binding;
update vb_binding set value = jsonb_set(value, '{proposal}', '{"id":"vb_p2","version":2,"checksum":"p2"}');
select lives_ok(format('execute vb_review(%L,%L,%L,4)', 'vb_p2_approved', 'runtime.review.approved', value), 're-review of revised proposal accepted') from vb_binding;

insert into public.narrative_versions (id, run_id, scan_id, audience, status, version, checksum, idempotency_key, supersedes_id)
  values ('vb_n2', 'vb_run', 'vb_scan', 'client', 'needs_review', 2, 'n2', 'vb_n2', 'vb_n1');
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_stale_narrative', 'runtime.review.rejected', value),
  '40001', null, 'stale rejection cannot target a newer narrative') from vb_binding;
update vb_binding set value = jsonb_set(value, '{narrative}', '{"id":"vb_n2","version":2,"checksum":"n2"}');

insert into public.intelligence_artifacts (id, run_id, scan_id, kind, version, checksum, validation_status, idempotency_key)
  values ('vb_r2', 'vb_run', 'vb_scan', 'internal_intelligence_report', 2, 'r2', 'valid', 'vb_r2');
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_stale_report', 'runtime.review.approved', value),
  '40001', null, 'report revision invalidates old binding') from vb_binding;
update vb_binding set value = jsonb_set(value, '{report}', '{"id":"vb_r2","version":2,"checksum":"r2"}');

insert into public.intelligence_artifacts (id, run_id, scan_id, kind, version, checksum, idempotency_key)
  values ('vb_c1', 'vb_run', 'vb_scan', 'competitor_snapshot', 1, 'c1', 'vb_c1');
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_stale_competitor', 'runtime.review.approved', value),
  '40001', null, 'new competitor source invalidates previously absent source') from vb_binding;
update vb_binding set value = jsonb_set(value, '{competitor}', '{"id":"vb_c1","version":1,"checksum":"c1"}');
insert into public.intelligence_artifacts (id, run_id, scan_id, kind, version, checksum, idempotency_key)
  values ('vb_core1', 'vb_run', 'vb_scan', 'proposal', 1, 'core1', 'vb_core1');
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_stale_core', 'runtime.review.approved', value),
  '40001', null, 'core proposal source invalidates old binding') from vb_binding;
update vb_binding set value = jsonb_set(value, '{coreProposal}', '{"id":"vb_core1","version":1,"checksum":"core1"}');

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_team', 'runtime.review.approved', value),
  '42501', null, 'current binding does not grant team-member approval authority') from vb_binding;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok(format('execute vb_review(%L,%L,%L,90)', 'vb_service', 'runtime.review.approved', value),
  '42501', null, 'current binding does not grant service-token approval authority') from vb_binding;
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', true);
select lives_ok(format('execute vb_review(%L,%L,%L,5)', 'vb_current', 'runtime.review.approved', value), 'current full package can be re-reviewed') from vb_binding;
select is((select payload -> 'binding' -> 'proposal' ->> 'id' from public.runtime_events where id = 'vb_approved'),
  'vb_p1', 'historical approval keeps its original version binding');
select is((select count(*)::int from public.runtime_events where id like 'vb_stale_%' or id like 'vb_forged%'),
  0, 'forged and stale bound decisions leave no audit record');
deallocate vb_review;
select * from finish();
rollback;
