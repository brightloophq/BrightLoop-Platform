-- =============================================================================
-- pgTAP · Phase F · F4.1 — Integration Platform tables.
-- Existence + RLS + enum checks + optimistic concurrency (installation) +
-- append-only history/events + secret/oauth INTERNAL-ONLY isolation + tenant
-- isolation (other-org client sees nothing; same-org client reads installations,
-- events + health but never secret references or oauth grants) + unique
-- idempotency constraints.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_int', 'Integration Co') on conflict do nothing;
insert into public.clients (id, company) values ('cli_int_other', 'Other Co') on conflict do nothing;

-- structure + RLS
select has_table('public', 'connector_installation', 'installation table exists');
select has_table('public', 'connector_secret_reference', 'secret reference table exists');
select has_table('public', 'connector_health_snapshot', 'health snapshot table exists');
select has_table('public', 'connector_event', 'event table exists');
select has_table('public', 'connector_webhook_receipt', 'webhook receipt table exists');
select has_table('public', 'connector_polling_cursor', 'polling cursor table exists');
select has_table('public', 'connector_oauth_grant', 'oauth grant table exists');
select has_table('public', 'connector_audit_event', 'audit event table exists');
select ok((select relrowsecurity from pg_class where oid = 'public.connector_installation'::regclass), 'RLS on installation');
select ok((select relrowsecurity from pg_class where oid = 'public.connector_secret_reference'::regclass), 'RLS on secret reference');
select ok((select relrowsecurity from pg_class where oid = 'public.connector_oauth_grant'::regclass), 'RLS on oauth grant');

-- seed as internal owner; everything belongs to cli_int
select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, trigger_kind, created_by_user_id, correlation_id, idempotency_key) values ('ci_1','ws_int','cli_int','fake-connector','My Fake','api_key','webhook','u_int','c1','install:ws_int:fake-connector') $$, 'insert installation');
select throws_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, created_by_user_id, correlation_id, idempotency_key, status) values ('ci_bad','ws_int','cli_int','fake-connector','X','api_key','u','c','k1','nope') $$, '23514', null, 'invalid installation status rejected');
select throws_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, created_by_user_id, correlation_id, idempotency_key) values ('ci_bad2','ws_int','cli_int','fake-connector','X','carrier-pigeon','u','c','k2') $$, '23514', null, 'invalid auth method rejected');
-- unique (workspace, connector): one install per connector per workspace
select throws_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, created_by_user_id, correlation_id, idempotency_key) values ('ci_dup','ws_int','cli_int','fake-connector','Dup','api_key','u','c','install:ws_int:fake-connector-2') $$, '23505', null, 'duplicate install (workspace,connector) rejected');
-- optimistic concurrency: status is mutable via version bump
select lives_ok($$ update public.connector_installation set status='validating', version=2 where id='ci_1' and version=1 $$, 'installation configuring→validating v1→v2');

select lives_ok($$ insert into public.connector_secret_reference (id, workspace_id, client_id, connector_installation_id, connector_id, purpose, secret_ref, created_by_user_id) values ('cs_1','ws_int','cli_int','ci_1','fake-connector','credential','csec_abc','u_int') $$, 'insert secret reference');
select throws_ok($$ insert into public.connector_secret_reference (id, workspace_id, client_id, connector_installation_id, connector_id, purpose, secret_ref, created_by_user_id, validation_state) values ('cs_bad','ws_int','cli_int','ci_1','fake-connector','credential','x','u','not-a-state') $$, '23514', null, 'invalid validation state rejected');

select lives_ok($$ insert into public.connector_health_snapshot (id, connector_installation_id, workspace_id, client_id, level, checked_at) values ('ch_1','ci_1','ws_int','cli_int','healthy', now()) $$, 'insert health snapshot');
select lives_ok($$ insert into public.connector_event (id, connector_installation_id, workspace_id, client_id, connector_id, type, external_id, source, occurred_at, ingested_at, idempotency_key) values ('ce_1','ci_1','ws_int','cli_int','fake-connector','message.received','ext_1','webhook', now(), now(), 'event:ci_1:webhook:ext_1:message.received') $$, 'insert event');
select throws_ok($$ insert into public.connector_event (id, connector_installation_id, workspace_id, client_id, connector_id, type, external_id, source, occurred_at, ingested_at, idempotency_key) values ('ce_dup','ci_1','ws_int','cli_int','fake-connector','message.received','ext_1','webhook', now(), now(), 'event:ci_1:webhook:ext_1:message.received') $$, '23505', null, 'duplicate event idempotency key rejected');
select lives_ok($$ insert into public.connector_webhook_receipt (id, connector_installation_id, workspace_id, client_id, connector_id, external_event_id, idempotency_key, received_at) values ('cw_1','ci_1','ws_int','cli_int','fake-connector','ext_1','webhook:ci_1:ext_1', now()) $$, 'insert webhook receipt');
select lives_ok($$ insert into public.connector_polling_cursor (id, connector_installation_id, workspace_id, client_id, to_cursor, event_count, sequence, idempotency_key, polled_at) values ('cp_1','ci_1','ws_int','cli_int','2',2,1,'poll:ci_1:genesis', now()) $$, 'insert polling cursor');
select lives_ok($$ insert into public.connector_oauth_grant (id, connector_installation_id, workspace_id, client_id, connector_id, state_token, redirect_uri, created_by_user_id) values ('co_1','ci_1','ws_int','cli_int','fake-oauth','st_ci_1_n1','https://app/redirect','u_int') $$, 'insert oauth grant');
select lives_ok($$ insert into public.connector_audit_event (id, connector_installation_id, workspace_id, client_id, operation, to_status, correlation_id) values ('ca_1','ci_1','ws_int','cli_int','install','pending_configuration','c') $$, 'insert audit event');

-- append-only: exercise the triggers as table owner
reset role;
select throws_ok($$ update public.connector_event set type='x' where id='ce_1' $$, 'P0001', 'transformation_activity is append-only', 'event UPDATE blocked');
select throws_ok($$ delete from public.connector_health_snapshot where id='ch_1' $$, 'P0001', 'transformation_activity is append-only', 'health snapshot DELETE blocked');
select throws_ok($$ update public.connector_webhook_receipt set status='processed' where id='cw_1' $$, 'P0001', 'transformation_activity is append-only', 'webhook receipt UPDATE blocked');
select throws_ok($$ delete from public.connector_audit_event where id='ca_1' $$, 'P0001', 'transformation_activity is append-only', 'audit event DELETE blocked');

-- tenant isolation: another-org client sees nothing
select set_config('request.jwt.claims', '{"sub":"u_o","app_metadata":{"role":"client_admin","client_id":"cli_int_other"}}', true);
set local role authenticated;
select is((select count(*)::int from public.connector_installation), 0, 'other-org client reads 0 installations');
select is((select count(*)::int from public.connector_event), 0, 'other-org client reads 0 events');
reset role;

-- same-org client: reads its installations, events + health, but NEVER secrets/oauth
select set_config('request.jwt.claims', '{"sub":"u_c","app_metadata":{"role":"client_admin","client_id":"cli_int"}}', true);
set local role authenticated;
select is((select count(*)::int from public.connector_installation), 1, 'same-org client reads its installation');
select is((select count(*)::int from public.connector_event), 1, 'same-org client reads its event');
select is((select count(*)::int from public.connector_health_snapshot), 1, 'same-org client reads its health snapshot');
select is((select count(*)::int from public.connector_secret_reference), 0, 'client CANNOT read secret references (internal-only)');
select is((select count(*)::int from public.connector_oauth_grant), 0, 'client CANNOT read oauth grants (internal-only)');
-- a client may not write an installation (internal-only write)
select throws_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, created_by_user_id, correlation_id, idempotency_key) values ('ci_c','ws_int','cli_int','fake-oauth','X','oauth2','u_c','c','install:ws_int:fake-oauth') $$, '42501', null, 'client cannot write an installation');
reset role;

select * from finish();
rollback;
