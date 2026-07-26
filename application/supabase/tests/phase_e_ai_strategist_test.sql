-- =============================================================================
-- pgTAP · Phase E · E3 — AI Strategist tables.
-- Existence + RLS + checks + optimistic concurrency + append-only + tenant
-- isolation (a DIFFERENT-org client sees nothing; a SAME-org client may read +
-- submit feedback).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_s', 'Strat Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_s_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'strategy_session', 'session table exists');
select has_table('public', 'strategy_analysis', 'analysis table exists');
select has_table('public', 'business_finding', 'finding table exists');
select has_table('public', 'risk_assessment', 'risk table exists');
select has_table('public', 'recommendation', 'recommendation table exists');
select has_table('public', 'priority_score', 'priority score table exists');
select has_table('public', 'transformation_roadmap', 'roadmap table exists');
select has_table('public', 'strategy_citation', 'citation table exists');
select has_table('public', 'strategy_feedback', 'feedback table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.strategy_session'::regclass), 'RLS on session');
select ok((select relrowsecurity from pg_class where oid = 'public.recommendation'::regclass), 'RLS on recommendation');

-- seed as internal owner; session belongs to cli_s
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.strategy_session (id, workspace_id, client_id, title, requested_by_user_id) values ('sst_1', 'ws_s', 'cli_s', 'Growth', 'u_int') $$, 'insert session');
select throws_ok($$ insert into public.strategy_session (id, workspace_id, client_id, title, requested_by_user_id, status) values ('sst_bad', 'ws_s', 'cli_s', 'X', 'u_int', 'nope') $$, '23514', null, 'invalid session status rejected');
select lives_ok($$ update public.strategy_session set status = 'analyzing', version = 2 where id = 'sst_1' and version = 1 $$, 'session draft→analyzing v1→v2');

select lives_ok($$ insert into public.strategy_analysis (id, session_id, workspace_id, client_id, confidence) values ('san_1', 'sst_1', 'ws_s', 'cli_s', 70) $$, 'insert analysis');
select lives_ok($$ insert into public.business_finding (id, session_id, workspace_id, client_id, dimension, category, title) values ('sfi_1', 'sst_1', 'ws_s', 'cli_s', 'sales', 'weakness', 'No CRM') $$, 'insert finding');
select throws_ok($$ insert into public.business_finding (id, session_id, workspace_id, client_id, dimension, category, title) values ('sfi_bad', 'sst_1', 'ws_s', 'cli_s', 'nope', 'weakness', 'X') $$, '23514', null, 'invalid finding dimension rejected');
select lives_ok($$ insert into public.recommendation (id, session_id, workspace_id, client_id, title, priority) values ('src_1', 'sst_1', 'ws_s', 'cli_s', 'Adopt a CRM', 80) $$, 'insert recommendation');
select throws_ok($$ insert into public.recommendation (id, session_id, workspace_id, client_id, title, priority) values ('src_bad', 'sst_1', 'ws_s', 'cli_s', 'X', 150) $$, '23514', null, 'priority over 100 rejected');
select lives_ok($$ insert into public.priority_score (id, recommendation_id, session_id, workspace_id, client_id, business_impact, implementation_effort, urgency, risk_reduction, customer_value, strategic_alignment, automation_potential, total) values ('sps_1', 'src_1', 'sst_1', 'ws_s', 'cli_s', 90, 50, 60, 40, 70, 70, 40, 78) $$, 'insert priority score');
select lives_ok($$ insert into public.transformation_roadmap (id, session_id, workspace_id, client_id, phases) values ('sro_1', 'sst_1', 'ws_s', 'cli_s', '[]'::jsonb) $$, 'insert roadmap');
select lives_ok($$ insert into public.strategy_citation (id, session_id, workspace_id, client_id, recommendation_id, document_id, collection_id, chunk_id, similarity) values ('sci_1', 'sst_1', 'ws_s', 'cli_s', 'src_1', 'd', 'col', 'ch', 0.9) $$, 'insert citation');
select lives_ok($$ insert into public.strategy_feedback (id, session_id, workspace_id, client_id, kind, subject_user_id) values ('sfb_1', 'sst_1', 'ws_s', 'cli_s', 'approval', 'u_int') $$, 'insert feedback');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.strategy_analysis set confidence = 0 where id = 'san_1' $$, 'P0001', 'transformation_activity is append-only', 'analysis UPDATE blocked');
select throws_ok($$ delete from public.recommendation where id = 'src_1' $$, 'P0001', 'transformation_activity is append-only', 'recommendation DELETE blocked');

-- tenant isolation: a DIFFERENT-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_s_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.strategy_session), 0, 'other-org client reads 0 sessions');
select is((select count(*)::int from public.recommendation), 0, 'other-org client reads 0 recommendations');
reset role;

-- same-org client CAN read its strategy + submit feedback
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_s"}}', true);
set local role authenticated;
select is((select count(*)::int from public.strategy_session), 1, 'same-org client reads its session');
select lives_ok($$ insert into public.strategy_feedback (id, session_id, workspace_id, client_id, kind, subject_user_id, comment) values ('sfb_c', 'sst_1', 'ws_s', 'cli_s', 'comment', 'u_c', 'looks good') $$, 'same-org client submits feedback');
reset role;

select * from finish();
rollback;
