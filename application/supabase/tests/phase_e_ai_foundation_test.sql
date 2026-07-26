-- =============================================================================
-- pgTAP · Phase E · E1 — AI Foundation tables.
-- Existence + RLS + checks + unique constraints + optimistic concurrency +
-- append-only (versions/results/usage/cost/audit/messages/evaluations) + tenant
-- isolation.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_ai', 'AI Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_ai_other', 'Other Co') on conflict do nothing;

-- structure
select has_table('public', 'ai_provider', 'provider table exists');
select has_table('public', 'ai_prompt', 'prompt table exists');
select has_table('public', 'ai_prompt_version', 'prompt version table exists');
select has_table('public', 'ai_prompt_execution', 'execution table exists');
select has_table('public', 'ai_prompt_result', 'result table exists');
select has_table('public', 'ai_usage_record', 'usage table exists');
select has_table('public', 'ai_cost_record', 'cost table exists');
select has_table('public', 'ai_audit_event', 'audit table exists');
select has_table('public', 'ai_conversation', 'conversation table exists');
select has_table('public', 'ai_conversation_message', 'message table exists');
select has_table('public', 'ai_evaluation_result', 'evaluation table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_prompt'::regclass), 'RLS on prompt');
select ok((select relrowsecurity from pg_class where oid = 'public.ai_audit_event'::regclass), 'RLS on audit');

-- seed as internal owner
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

-- prompt + version (unique per version) + optimistic concurrency
select lives_ok($$ insert into public.ai_prompt (id, workspace_id, client_id, name, owner_user_id, status) values ('pr_1', 'ws_ai', 'cli_ai', 'Summarizer', 'u_int', 'draft') $$, 'insert prompt');
select lives_ok($$ insert into public.ai_prompt_version (id, prompt_id, workspace_id, client_id, version, created_by_user_id) values ('pv_1', 'pr_1', 'ws_ai', 'cli_ai', 1, 'u_int') $$, 'insert version 1');
select throws_ok($$ insert into public.ai_prompt_version (id, prompt_id, workspace_id, client_id, version, created_by_user_id) values ('pv_dup', 'pr_1', 'ws_ai', 'cli_ai', 1, 'u_int') $$, '23505', null, 'duplicate prompt version rejected');
select lives_ok($$ update public.ai_prompt set status = 'active', active_version = 1, version = 2 where id = 'pr_1' and version = 1 $$, 'publish prompt v1→v2');
select throws_ok($$ insert into public.ai_prompt (id, workspace_id, client_id, name, owner_user_id, status) values ('pr_bad', 'ws_ai', 'cli_ai', 'X', 'u_int', 'nope') $$, '23514', null, 'invalid prompt status rejected');

-- execution + result + usage + cost + audit
select lives_ok($$ insert into public.ai_prompt_execution (id, workspace_id, client_id, prompt_id, prompt_version, mode, provider, model, status, requested_by_user_id) values ('ex_1', 'ws_ai', 'cli_ai', 'pr_1', 1, 'completion', 'anthropic', 'claude-sonnet-5', 'succeeded', 'u_int') $$, 'insert execution');
select throws_ok($$ insert into public.ai_prompt_execution (id, workspace_id, client_id, mode, provider, model, status, requested_by_user_id) values ('ex_bad', 'ws_ai', 'cli_ai', 'completion', 'nope', 'm', 'succeeded', 'u_int') $$, '23514', null, 'invalid provider rejected');
select lives_ok($$ insert into public.ai_prompt_result (id, execution_id, workspace_id, client_id, content) values ('rs_1', 'ex_1', 'ws_ai', 'cli_ai', 'hello') $$, 'insert result');
select lives_ok($$ insert into public.ai_usage_record (id, execution_id, workspace_id, client_id, provider, model, prompt_tokens, completion_tokens, total_tokens, user_id) values ('us_1', 'ex_1', 'ws_ai', 'cli_ai', 'anthropic', 'claude-sonnet-5', 10, 5, 15, 'u_int') $$, 'insert usage');
select lives_ok($$ insert into public.ai_cost_record (id, execution_id, workspace_id, client_id, total_cost, pricing_version) values ('co_1', 'ex_1', 'ws_ai', 'cli_ai', 0.01, 'e1-2026-07') $$, 'insert cost');
select lives_ok($$ insert into public.ai_audit_event (id, execution_id, workspace_id, client_id, provider, model, user_id, status) values ('au_1', 'ex_1', 'ws_ai', 'cli_ai', 'anthropic', 'claude-sonnet-5', 'u_int', 'succeeded') $$, 'insert audit');

-- conversation + message (unique per sequence)
select lives_ok($$ insert into public.ai_conversation (id, workspace_id, client_id, provider, model, created_by_user_id) values ('cv_1', 'ws_ai', 'cli_ai', 'anthropic', 'claude-sonnet-5', 'u_int') $$, 'insert conversation');
select lives_ok($$ insert into public.ai_conversation_message (id, conversation_id, workspace_id, client_id, role, content, sequence) values ('mg_0', 'cv_1', 'ws_ai', 'cli_ai', 'user', 'hi', 0) $$, 'insert message 0');
select throws_ok($$ insert into public.ai_conversation_message (id, conversation_id, workspace_id, client_id, role, content, sequence) values ('mg_dup', 'cv_1', 'ws_ai', 'cli_ai', 'user', 'again', 0) $$, '23505', null, 'duplicate message sequence rejected');

-- evaluation (score bounds)
select lives_ok($$ insert into public.ai_evaluation_result (id, execution_id, workspace_id, client_id, evaluator, outcome, score) values ('ev_1', 'ex_1', 'ws_ai', 'cli_ai', 'rubric', 'pass', 90) $$, 'insert evaluation');
select throws_ok($$ insert into public.ai_evaluation_result (id, execution_id, workspace_id, client_id, evaluator, outcome, score) values ('ev_bad', 'ex_1', 'ws_ai', 'cli_ai', 'rubric', 'pass', 150) $$, '23514', null, 'score over 100 rejected');

-- append-only: exercise the trigger as table owner
reset role;
select throws_ok($$ update public.ai_prompt_version set notes = 'x' where id = 'pv_1' $$, 'P0001', 'transformation_activity is append-only', 'version UPDATE blocked');
select throws_ok($$ delete from public.ai_audit_event where id = 'au_1' $$, 'P0001', 'transformation_activity is append-only', 'audit DELETE blocked');
select throws_ok($$ update public.ai_usage_record set total_tokens = 0 where id = 'us_1' $$, 'P0001', 'transformation_activity is append-only', 'usage UPDATE blocked');

-- tenant isolation: a client role sees none of the internal-only rows
select set_config('request.jwt.claims', '{"sub":"u_cli","app_metadata":{"role":"client_admin","client_id":"cli_ai_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.ai_prompt), 0, 'client reads 0 prompts');
select is((select count(*)::int from public.ai_audit_event), 0, 'client reads 0 audit events');
select is((select count(*)::int from public.ai_conversation), 0, 'client reads 0 conversations');
reset role;

select * from finish();
rollback;
