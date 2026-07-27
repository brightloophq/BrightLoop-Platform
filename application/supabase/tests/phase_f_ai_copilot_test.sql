-- =============================================================================
-- pgTAP · Phase F · F2 — AI Copilot tables.
-- Existence + RLS + enum checks + optimistic concurrency (conversation) +
-- append-only turns/citations/actions + tenant isolation (other-org client sees
-- nothing; same-org client authors its own conversation + turns).
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_cop', 'Copilot Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_cop_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'copilot_conversation', 'conversation table exists');
select has_table('public', 'copilot_message', 'message table exists');
select has_table('public', 'copilot_citation', 'citation table exists');
select has_table('public', 'copilot_action', 'action table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.copilot_conversation'::regclass), 'RLS on conversation');
select ok((select relrowsecurity from pg_class where oid = 'public.copilot_message'::regclass), 'RLS on message');
select ok((select relrowsecurity from pg_class where oid = 'public.copilot_citation'::regclass), 'RLS on citation');
select ok((select relrowsecurity from pg_class where oid = 'public.copilot_action'::regclass), 'RLS on action');

-- seed as internal owner; conversation belongs to cli_cop
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.copilot_conversation (id, workspace_id, client_id, title, requested_by_user_id, correlation_id) values ('cv_1', 'ws_cop', 'cli_cop', 'Weekly check-in', 'u_int', 'corr_1') $$, 'insert conversation');
select throws_ok($$ insert into public.copilot_conversation (id, workspace_id, client_id, title, requested_by_user_id, correlation_id, panel) values ('cv_bad', 'ws_cop', 'cli_cop', 'X', 'u_int', 'c', 'nope') $$, '23514', null, 'invalid panel rejected');
select throws_ok($$ insert into public.copilot_conversation (id, workspace_id, client_id, title, requested_by_user_id, correlation_id, status) values ('cv_bad2', 'ws_cop', 'cli_cop', 'X', 'u_int', 'c', 'nope') $$, '23514', null, 'invalid status rejected');
select lives_ok($$ update public.copilot_conversation set status = 'archived', version = 2 where id = 'cv_1' and version = 1 $$, 'conversation active→archived v1→v2');

select lives_ok($$ insert into public.copilot_message (id, conversation_id, workspace_id, client_id, role, content, intent, state, order_index) values ('cm_1', 'cv_1', 'ws_cop', 'cli_cop', 'user', 'Summarize', 'summary', 'completed', 0) $$, 'insert user message');
select throws_ok($$ insert into public.copilot_message (id, conversation_id, workspace_id, client_id, role, order_index) values ('cm_bad', 'cv_1', 'ws_cop', 'cli_cop', 'nope', 1) $$, '23514', null, 'invalid role rejected');
select throws_ok($$ insert into public.copilot_message (id, conversation_id, workspace_id, client_id, role, state, order_index) values ('cm_bad2', 'cv_1', 'ws_cop', 'cli_cop', 'assistant', 'nope', 1) $$, '23514', null, 'invalid state rejected');
select lives_ok($$ insert into public.copilot_message (id, conversation_id, workspace_id, client_id, role, content, state, capability_key, order_index) values ('cm_2', 'cv_1', 'ws_cop', 'cli_cop', 'assistant', 'Done', 'completed', 'reporting.generate_report', 1) $$, 'insert assistant message');
select lives_ok($$ insert into public.copilot_citation (id, message_id, conversation_id, workspace_id, client_id, kind, ref_id, title) values ('cc_1', 'cm_2', 'cv_1', 'ws_cop', 'cli_cop', 'report', 'er_x', 'Exec report') $$, 'insert citation');
select throws_ok($$ insert into public.copilot_citation (id, message_id, conversation_id, workspace_id, client_id, kind, ref_id) values ('cc_bad', 'cm_2', 'cv_1', 'ws_cop', 'cli_cop', 'nope', 'x') $$, '23514', null, 'invalid citation kind rejected');
select lives_ok($$ insert into public.copilot_action (id, conversation_id, message_id, workspace_id, client_id, kind, label, capability_key, required_permission) values ('ca_1', 'cv_1', 'cm_2', 'ws_cop', 'cli_cop', 'generate_report', 'Generate an executive report', 'reporting.generate_report', 'report.generate') $$, 'insert action');
select throws_ok($$ insert into public.copilot_action (id, conversation_id, workspace_id, client_id, kind, label) values ('ca_bad', 'cv_1', 'ws_cop', 'cli_cop', 'nope', 'X') $$, '23514', null, 'invalid action kind rejected');

-- append-only: exercise the triggers as table owner
reset role;
select throws_ok($$ update public.copilot_message set content = 'edited' where id = 'cm_1' $$, 'P0001', 'transformation_activity is append-only', 'message UPDATE blocked');
select throws_ok($$ delete from public.copilot_citation where id = 'cc_1' $$, 'P0001', 'transformation_activity is append-only', 'citation DELETE blocked');
select throws_ok($$ update public.copilot_action set label = 'x' where id = 'ca_1' $$, 'P0001', 'transformation_activity is append-only', 'action UPDATE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_cop_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.copilot_conversation), 0, 'other-org client reads 0 conversations');
select is((select count(*)::int from public.copilot_message), 0, 'other-org client reads 0 messages');
reset role;

-- same-org client authors its OWN conversation + turn
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_cop"}}', true);
set local role authenticated;
select is((select count(*)::int from public.copilot_conversation), 1, 'same-org client reads its conversation');
select lives_ok($$ insert into public.copilot_conversation (id, workspace_id, client_id, title, requested_by_user_id, correlation_id) values ('cv_c', 'ws_cop', 'cli_cop', 'Client thread', 'u_c', 'corr_c') $$, 'same-org client creates a conversation');
select lives_ok($$ insert into public.copilot_message (id, conversation_id, workspace_id, client_id, role, content, order_index) values ('cm_c', 'cv_c', 'ws_cop', 'cli_cop', 'user', 'Hi', 0) $$, 'same-org client appends a turn');
reset role;

select * from finish();
rollback;
