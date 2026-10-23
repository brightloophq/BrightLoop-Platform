-- Sprint 1A: exercise the database boundary directly, not the HTTP authorization.
-- All identities are synthetic. Claims below simulate gateway-verified JWTs;
-- ordinary API callers cannot SET request.jwt.claims themselves.
begin;
create extension if not exists pgtap;
select no_plan();

-- Separate parents keep cascade assertions independent of runtime_events' older
-- append-only trigger. The empty parents prove cleanup is not globally disabled.
insert into public.clients (id, company) values
  ('ci_review_client', 'Review test'), ('ci_prop_client', 'Proposal history test'),
  ('ci_narr_client', 'Narrative history test'), ('ci_empty_client', 'Empty test');
insert into public.users (id, name, email, role, status) values
  ('ci_prop_creator', 'Proposal author', 'ci-proposal@example.invalid', 'owner', 'active'),
  ('ci_narr_creator', 'Narrative author', 'ci-narrative@example.invalid', 'owner', 'active'),
  ('ci_empty_creator', 'Unreferenced author', 'ci-empty@example.invalid', 'owner', 'active');
insert into public.intelligence_runs (id, client_id, scan_id, idempotency_key) values
  ('ci_review_run', 'ci_review_client', 'ci_scan', 'ci_review_run'),
  ('ci_prop_run', 'ci_prop_client', 'ci_scan', 'ci_prop_run'),
  ('ci_narr_run', 'ci_narr_client', 'ci_scan', 'ci_narr_run'),
  ('ci_empty_run', null, 'ci_scan', 'ci_empty_run');

prepare ci_review(text, text, text, jsonb, bigint) as
  insert into public.runtime_events
    (id, event_type, run_id, aggregate_id, aggregate_type, client_id, sequence, actor, payload)
  values ($1, $2, 'ci_review_run', 'ci_review_run', 'intelligence_run', 'ci_review_client', $5, $3, $4);
prepare ci_proposal(text, integer, text) as
  insert into public.proposal_versions
    (id, run_id, client_id, scan_id, status, version, checksum, idempotency_key, supersedes_id, created_by, envelope)
  values ($1, 'ci_prop_run', 'ci_prop_client', 'ci_scan', 'needs_review', $2, $1, $1, $3,
    'ci_prop_creator', '{"scope":"original"}');
prepare ci_narrative(text, integer, text) as
  insert into public.narrative_versions
    (id, run_id, client_id, scan_id, audience, status, version, checksum, idempotency_key, supersedes_id, created_by, envelope)
  values ($1, 'ci_narr_run', 'ci_narr_client', 'ci_scan', 'client', 'needs_review', $2, $1, $1, $3,
    'ci_narr_creator', '{"text":"original"}');
execute ci_proposal('ci_p1', 1, null);
execute ci_narrative('ci_n1', 1, null);

-- Privilege checks prevent an RLS-filtered zero-row UPDATE from falsely passing.
select ok(not has_table_privilege(r, t, p), format('%s lacks %s on %s', r, p, t))
from (values ('authenticated'), ('service_role'), ('anon')) roles(r)
cross join (values ('public.proposal_versions'), ('public.narrative_versions')) tables(t)
cross join (values ('UPDATE'), ('DELETE'), ('TRUNCATE')) privileges(p);

-- Owner: all three review actions, including the actual web adapter shape
-- (actor NULL, payload.by = JWT sub). The DB fills actor authoritatively.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', true);
set local role authenticated;
select lives_ok(format(
  $$execute ci_review(%L, %L, null, '{"by":"00000000-0000-4000-8000-000000000001"}', %s)$$,
  'ci_owner_' || n, e, n), 'owner can append ' || e)
from (values (1, 'runtime.review.approved'), (2, 'runtime.review.rejected'), (3, 'runtime.review.revision_requested')) actions(n, e);
select is((select count(*)::int from public.runtime_events where id like 'ci_owner_%'
  and actor = '00000000-0000-4000-8000-000000000001'
  and payload ->> 'by' = actor), 3, 'owner attribution is stamped from JWT sub');
select lives_ok($$execute ci_proposal('ci_p2', 2, 'ci_p1')$$, 'owner appends proposal version');
select lives_ok($$execute ci_narrative('ci_n2', 2, 'ci_n1')$$, 'owner appends narrative version');

select throws_ok($$execute ci_review('ci_spoof_actor', 'runtime.review.approved', 'someone_else', '{"by":"00000000-0000-4000-8000-000000000001"}', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'forged actor is rejected');
select throws_ok($$execute ci_review('ci_spoof_by', 'runtime.review.approved', null, '{"by":"someone_else"}', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'forged payload.by is rejected');
select throws_ok($$execute ci_review('ci_missing_by', 'runtime.review.approved', null, '{}', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'missing payload.by is rejected');
select throws_ok($$execute ci_review('ci_number_by', 'runtime.review.approved', null, '{"by":123}', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'non-string payload.by is rejected');
select throws_ok($$execute ci_review('ci_array_payload', 'runtime.review.approved', null, '[]', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'non-object payload is rejected');
select throws_ok($$update public.runtime_events set actor = 'someone_else' where id = 'ci_owner_1'$$,
  '42501', null, 'persisted review attribution cannot be edited');
select throws_ok($$delete from public.runtime_events where id = 'ci_owner_1'$$,
  '42501', null, 'persisted review cannot be deleted');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000002","app_metadata":{"role":"admin"}}', true);
set local role authenticated;
select lives_ok(format(
  $$execute ci_review(%L, %L, '00000000-0000-4000-8000-000000000002', '{"by":"00000000-0000-4000-8000-000000000002"}', %s)$$,
  'ci_admin_' || n, e, n), 'admin can append ' || e)
from (values (4, 'runtime.review.approved'), (5, 'runtime.review.rejected'), (6, 'runtime.review.revision_requested')) actions(n, e);
select lives_ok($$execute ci_proposal('ci_p3', 3, 'ci_p2')$$, 'admin appends proposal version');
select lives_ok($$execute ci_narrative('ci_n3', 3, 'ci_n2')$$, 'admin appends narrative version');
reset role;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select throws_ok(format(
  $$execute ci_review(%L, %L, null, '{"by":"00000000-0000-4000-8000-000000000003","role":"owner"}', 90)$$,
  'ci_team_' || n, e), '42501', 'Review requires authenticated owner/admin identity',
  'team member cannot append ' || e || ' even with payload role=owner')
from (values (1, 'runtime.review.approved'), (2, 'runtime.review.rejected'), (3, 'runtime.review.revision_requested')) actions(n, e);
select lives_ok($$execute ci_review('ci_team_operational', 'pipeline.stage_started', null, '{}', 7)$$,
  'team member retains legitimate operational events');
select lives_ok($$execute ci_proposal('ci_p4', 4, 'ci_p3')$$, 'team member appends proposal version');
select lives_ok($$execute ci_narrative('ci_n4', 4, 'ci_n3')$$, 'team member appends narrative version');
select is((select count(*)::int from public.proposal_versions where run_id = 'ci_prop_run'), 4, 'internal reads preserved');

select throws_ok(format('update public.%I set status = %L where id = %L', t, 'tampered', i),
  '42501', null, t || ' UPDATE denied by table privileges')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok(format('delete from public.%I where id = %L', t, i),
  '42501', null, t || ' DELETE denied by table privileges')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok(format('truncate table public.%I', t), '42501', null, t || ' TRUNCATE denied')
from (values ('proposal_versions'), ('narrative_versions')) versions(t);
reset role;

-- Independently prove the revised RLS predicate: the trigger is disabled only
-- inside this rollback-only isolated test transaction, then immediately restored.
alter table public.runtime_events disable trigger runtime_events_review_authority;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000003","app_metadata":{"role":"team_member"}}', true);
set local role authenticated;
select throws_ok($$execute ci_review('ci_policy_only', 'runtime.review.approved', '00000000-0000-4000-8000-000000000003', '{"by":"00000000-0000-4000-8000-000000000003"}', 90)$$,
  '42501', null, 'RLS independently denies team-member review insertion');
reset role;
alter table public.runtime_events enable trigger runtime_events_review_authority;

-- Both client roles are denied even for their own client. Anonymous denial is
-- tested separately below, rather than assuming authenticated client coverage.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004","app_metadata":{"role":"client_admin","client_id":"ci_prop_client"}}', true);
set local role authenticated;
select throws_ok($$execute ci_review('ci_client_review', 'runtime.review.approved', null, '{"by":"00000000-0000-4000-8000-000000000004"}', 90)$$,
  '42501', null, 'client admin cannot review');
select throws_ok($$execute ci_review('ci_client_operational', 'pipeline.created', null, '{}', 90)$$,
  '42501', null, 'client cannot append ordinary events');
select throws_ok($$execute ci_proposal('ci_client_p', 10, 'ci_p4')$$, '42501', null, 'client cannot append proposals');
select throws_ok($$execute ci_narrative('ci_client_n', 10, 'ci_n4')$$, '42501', null, 'client cannot append narratives');
select is((select count(*)::int from public.proposal_versions where run_id = 'ci_prop_run'), 0, 'client cannot read own-org proposal history');
select is((select count(*)::int from public.narrative_versions where run_id = 'ci_narr_run'), 0, 'client cannot read other-org narrative history');
reset role;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000004","app_metadata":{"role":"client_member","client_id":"ci_narr_client"}}', true);
set local role authenticated;
select throws_ok($$execute ci_review('ci_member_review', 'runtime.review.rejected', null, '{"by":"00000000-0000-4000-8000-000000000004"}', 90)$$,
  '42501', null, 'client member cannot review');
select is((select count(*)::int from public.narrative_versions where run_id = 'ci_narr_run'), 0, 'client member cannot read own-org narrative history');
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$execute ci_review('ci_anon_review', 'runtime.review.approved', null, '{}', 90)$$, '42501', null, 'anonymous review denied');
select throws_ok($$execute ci_review('ci_anon_operational', 'pipeline.created', null, '{}', 90)$$, '42501', null, 'anonymous operational event denied');
select throws_ok($$execute ci_proposal('ci_anon_p', 10, 'ci_p4')$$, '42501', null, 'anonymous proposal append denied');
select throws_ok($$execute ci_narrative('ci_anon_n', 10, 'ci_n4')$$, '42501', null, 'anonymous narrative append denied');
reset role;

-- Run the same trigger with RLS bypassed to prove the policy is not the only
-- protection. set_config is evaluated before throws_ok for each synthetic case.
select throws_ok(
  format($$execute ci_review('ci_bad_identity', 'runtime.review.approved', null, '{"by":"00000000-0000-4000-8000-000000000001"}', 90) /* %s */$$,
    set_config('request.jwt.claims', claims, true)),
  '42501', 'Review requires authenticated owner/admin identity', description)
from (values
  ('{}', 'missing claims rejected with RLS bypassed'),
  ('[]', 'non-object claims rejected'),
  ('{"role":"authenticated","app_metadata":{"role":"owner"}}', 'missing subject rejected'),
  ('{"role":"authenticated","sub":"","app_metadata":{"role":"owner"}}', 'empty subject rejected'),
  ('{"role":"authenticated","sub":"not-a-uuid","app_metadata":{"role":"owner"}}', 'malformed subject rejected'),
  ('{"role":"authenticated","sub":123,"app_metadata":{"role":"owner"}}', 'numeric subject rejected'),
  ('{"role":"authenticated","sub":{},"app_metadata":{"role":"owner"}}', 'object subject rejected'),
  ('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001"}', 'missing application role rejected'),
  ('{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":["owner"]}}', 'malformed application role rejected'),
  ('{"sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', 'missing API role rejected'),
  ('{"role":"service_role","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', 'service token with copied owner metadata rejected'),
  ('not-json', 'malformed claims JSON rejected safely')
) cases(claims, description);

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
set local role service_role;
select throws_ok($$execute ci_review('ci_service_review', 'runtime.review.approved', null, '{}', 90)$$,
  '42501', 'Review requires authenticated owner/admin identity', 'identity-free service role cannot approve');
select lives_ok($$execute ci_review('ci_service_operational', 'pipeline.created', null, '{}', 8)$$,
  'service role retains system operational events without human identity');
select lives_ok($$execute ci_proposal('ci_p5', 5, 'ci_p4')$$, 'service role retains proposal generation');
select lives_ok($$execute ci_narrative('ci_n5', 5, 'ci_n4')$$, 'service role retains narrative generation');
select throws_ok(format('update public.%I set status = %L where id = %L', t, 'tampered', i),
  '42501', null, t || ' service UPDATE denied')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok(format('delete from public.%I where id = %L', t, i),
  '42501', null, t || ' service DELETE denied')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok($$execute ci_review('ci_service_spoof', 'runtime.review.rejected', null, '{"by":"00000000-0000-4000-8000-000000000001"}', 90)$$,
  '42501', 'Review requires authenticated owner/admin identity', 'service role cannot supply a human identity in payload');
select set_config('request.jwt.claims', '{"role":"service_role","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', true);
select throws_ok($$execute ci_review('ci_service_metadata', 'runtime.review.approved', null, '{"by":"00000000-0000-4000-8000-000000000001"}', 90)$$,
  '42501', 'Review requires authenticated owner/admin identity', 'actual service-role session cannot review with copied owner metadata');
reset role;

-- A privileged session carrying genuine user claims remains subject to the same
-- authority/attribution checks. The server must forward the verified user JWT,
-- not synthesize claims from a service request's body.
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000001","app_metadata":{"role":"owner"}}', true);
set local role service_role;
select lives_ok($$execute ci_review('ci_forwarded_user', 'runtime.review.approved', null, '{"by":"00000000-0000-4000-8000-000000000001"}', 9)$$,
  'verified owner identity still works on a privileged server path');
select throws_ok($$execute ci_review('ci_privileged_spoof', 'runtime.review.approved', 'different', '{"by":"00000000-0000-4000-8000-000000000001"}', 90)$$,
  '42501', 'Review attribution must match authenticated subject', 'RLS bypass does not bypass attribution checks');
reset role;

-- Table owner bypasses grants/RLS, so these reach the actual history triggers.
select throws_ok(format('update public.%I set envelope = %L::jsonb where id = %L', t, '{"tampered":true}', i),
  'P0001', t || ' is append-only', t || ' owner UPDATE blocked by trigger')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok(format('delete from public.%I where id = %L', t, i),
  'P0001', t || ' is append-only', t || ' owner DELETE blocked by trigger')
from (values ('proposal_versions', 'ci_p1'), ('narrative_versions', 'ci_n1')) versions(t, i);
select throws_ok(format('truncate table public.%I', t),
  '0A000', null, t || ' owner TRUNCATE blocked by referencing immutable proposal lineage')
from (values ('proposal_versions'), ('narrative_versions')) versions(t);

-- Verify ON DELETE CASCADE and SET NULL implications separately for each table.
select throws_ok($$delete from public.intelligence_runs where id = 'ci_prop_run'$$,
  'P0001', 'proposal_versions is append-only', 'run cascade cannot erase proposal history');
select throws_ok($$delete from public.intelligence_runs where id = 'ci_narr_run'$$,
  'P0001', 'narrative_versions is append-only', 'run cascade cannot erase narrative history');
select throws_ok($$delete from public.clients where id = 'ci_prop_client'$$,
  'P0001', 'proposal_versions is append-only', 'client cascade cannot erase proposal history');
select throws_ok($$delete from public.clients where id = 'ci_narr_client'$$,
  'P0001', 'narrative_versions is append-only', 'client cascade cannot erase narrative history');
select throws_ok($$delete from public.users where id = 'ci_prop_creator'$$,
  'P0001', 'proposal_versions is append-only', 'user deletion cannot SET NULL proposal created_by');
select throws_ok($$delete from public.users where id = 'ci_narr_creator'$$,
  'P0001', 'narrative_versions is append-only', 'user deletion cannot SET NULL narrative created_by');
select throws_ok($$update public.proposal_versions set supersedes_id = null where id = 'ci_p2'$$,
  'P0001', 'proposal_versions is append-only', 'proposal predecessor link cannot be cleared');
select throws_ok($$update public.narrative_versions set supersedes_id = null where id = 'ci_n2'$$,
  'P0001', 'narrative_versions is append-only', 'narrative predecessor link cannot be cleared');
select lives_ok($$delete from public.intelligence_runs where id = 'ci_empty_run'$$, 'empty run cleanup remains possible');
select lives_ok($$delete from public.clients where id = 'ci_empty_client'$$, 'unreferenced client cleanup remains possible');
select lives_ok($$delete from public.users where id = 'ci_empty_creator'$$, 'unreferenced user cleanup remains possible');

select is((select envelope from public.proposal_versions where id = 'ci_p1'), '{"scope":"original"}'::jsonb,
  'original proposal content survives mutation and cascade attempts');
select is((select envelope from public.narrative_versions where id = 'ci_n1'), '{"text":"original"}'::jsonb,
  'original narrative content survives mutation and cascade attempts');
select is((select count(*)::int from public.proposal_versions where run_id = 'ci_prop_run'), 5, 'all proposal versions retained');
select is((select count(*)::int from public.narrative_versions where run_id = 'ci_narr_run'), 5, 'all narrative versions retained');
select is((select count(*)::int from public.proposal_versions newer join public.proposal_versions older
  on newer.supersedes_id = older.id where newer.run_id = 'ci_prop_run' and newer.version = older.version + 1),
  4, 'proposal superseding chain retained');
select is((select count(*)::int from public.narrative_versions newer join public.narrative_versions older
  on newer.supersedes_id = older.id where newer.run_id = 'ci_narr_run' and newer.version = older.version + 1),
  4, 'narrative superseding chain retained');
select is((select created_by from public.proposal_versions where id = 'ci_p1'), 'ci_prop_creator', 'proposal author reference retained');
select is((select created_by from public.narrative_versions where id = 'ci_n1'), 'ci_narr_creator', 'narrative author reference retained');
select is((select count(*)::int from public.runtime_events where id like 'ci_spoof_%' or id = 'ci_bad_identity'),
  0, 'rejected review attempts leave no event');

deallocate ci_review;
deallocate ci_proposal;
deallocate ci_narrative;
select * from finish();
rollback;
