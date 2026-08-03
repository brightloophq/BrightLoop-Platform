-- =============================================================================
-- pgTAP · Phase F · F4.2 — Google Workspace connectors.
-- The connectors reuse the F4.1 schema; the only DB change is the widened
-- connector_audit_event operation CHECK. Verify 'invoke' is now accepted and an
-- unknown operation is still rejected, using a real installation + internal actor.
-- =============================================================================
begin;
create extension if not exists pgtap;
select no_plan();

insert into public.clients (id, company) values ('cli_gw', 'Google WS Co') on conflict do nothing;

select set_config('request.jwt.claims', '{"sub":"u_int","app_metadata":{"role":"owner"}}', true);
set local role authenticated;

select lives_ok($$ insert into public.connector_installation (id, workspace_id, client_id, connector_id, display_name, auth_method, trigger_kind, created_by_user_id, correlation_id, idempotency_key) values ('ci_gw','ws_gw','cli_gw','google-gmail','Gmail','oauth2','polling','u_int','c1','install:ws_gw:google-gmail') $$, 'insert gmail installation (oauth2)');

-- the F4.2 change: 'invoke' is an accepted audit operation
select lives_ok($$ insert into public.connector_audit_event (id, connector_installation_id, workspace_id, client_id, operation, correlation_id, summary) values ('ca_gw','ci_gw','ws_gw','cli_gw','invoke','c','Invoked gmail.send') $$, 'audit operation invoke accepted');
-- an unknown operation is still rejected by the widened constraint
select throws_ok($$ insert into public.connector_audit_event (id, connector_installation_id, workspace_id, client_id, operation, correlation_id) values ('ca_bad','ci_gw','ws_gw','cli_gw','teleport','c') $$, '23514', null, 'unknown audit operation still rejected');

reset role;
select * from finish();
rollback;
