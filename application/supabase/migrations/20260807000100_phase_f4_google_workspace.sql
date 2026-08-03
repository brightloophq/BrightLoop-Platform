-- =============================================================================
-- Phase F · Sprint F4.2 — Google Workspace connectors. ADDITIVE ONLY.
-- The F4.2 connectors (Gmail/Calendar/Drive/Contacts) reuse the ENTIRE F4.1
-- Integration Platform schema — no new tables. The single schema change is that
-- capability INVOCATION (the F4.2 completion of the F4.1 capability model) records
-- an audit row with operation 'invoke', so the connector_audit_event operation
-- CHECK constraint is widened to include it. No table, column, index, RLS policy,
-- grant, or trigger is otherwise touched.
-- =============================================================================

alter table public.connector_audit_event drop constraint connector_audit_event_operation_check;
alter table public.connector_audit_event add constraint connector_audit_event_operation_check
  check (operation in ('install','configure','enable','disable','revoke','validate','health_check','rotate_secret','oauth_begin','oauth_complete','webhook_ingest','poll','invoke'));
