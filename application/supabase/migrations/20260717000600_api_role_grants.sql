-- =============================================================================
-- 0029 — Restore explicit API-role privileges across the public schema.
--
-- WHY THIS EXISTS
--   Until the Sprint 3 live-database harness, these migrations had never been
--   applied AND exercised through Supabase's API roles — the app has run in
--   `placeholder` data mode, so nothing ever connected as `authenticated` or
--   `service_role`. RLS is enabled on every public table, but PostgreSQL checks
--   TABLE-LEVEL privileges BEFORE it evaluates a row policy, and no migration ever
--   granted them. Against a freshly migrated database the API roles are therefore
--   denied at the table level ("permission denied for table …") and RLS never
--   runs. `service_role` bypasses RLS but STILL needs the base grant, which is why
--   even a service-role seed of `clients` was rejected.
--
--   This restores the standard Supabase grant posture so the ROW POLICIES — not a
--   blanket table denial — are the authorization boundary. It generalises the
--   transformation-only grant in 0028 to the whole schema.
--
-- SCOPE & SAFETY
--   * authenticated + service_role only — the roles the app's authenticated and
--     server-side paths use. `anon` is intentionally NOT broadened here; the
--     public-site anon read path is a separate concern with its own RLS review.
--   * RLS is UNCHANGED and remains the boundary. Append-only tables
--     (transition_log, analytics_events) keep their UPDATE/DELETE-blocking
--     triggers regardless of any grant. Internal-only tables deny non-internal
--     rows via their policies' bl_is_internal() checks.
--
-- Additive & non-destructive. Recovery: `revoke … from authenticated, service_role`.
-- =============================================================================

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on all tables in schema public
  to authenticated, service_role;

grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Future tables/sequences created in this schema inherit the same posture, so a
-- new migration never silently reintroduces the table-level denial fixed above.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
