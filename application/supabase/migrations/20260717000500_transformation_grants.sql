-- =============================================================================
-- 0028 — Transformation domain: table privileges for the PostgREST roles.
--
-- WHY THIS EXISTS
--   RLS is enabled on all twelve transformation tables (migration 0027), but
--   PostgreSQL checks TABLE-LEVEL privileges BEFORE it ever evaluates a row
--   policy. Without a base grant, an authenticated request — a client reading its
--   own Transformation Progress, or an internal user going through the API — is
--   rejected at the table level with `permission denied for table …` (SQLSTATE
--   42501) and RLS never runs. Every other public table receives these grants via
--   Supabase's default privileges; these tables must match so that the ROW
--   POLICIES in 0027 — not a blanket table denial — are the authorization boundary.
--
-- ISOLATION IS UNCHANGED. The policies in 0027 still gate every row:
--   * internal-only tables deny clients by the absence of a client policy;
--   * business_health / transformation_index / approvals expose own-org reads only;
--   * all writes remain internal (WITH CHECK bl_is_internal()).
--   Granting `authenticated` insert/update/delete does NOT let a client write —
--   the RLS check still raises 42501 (see the pgTAP write-isolation assertions).
--   service_role is the trusted server key (it already bypasses RLS); the grant
--   only makes its table access explicit rather than relying on default privileges.
--
-- Additive & non-destructive. Recovery (manual): `revoke … on <tables> from
-- authenticated, service_role;`.
-- =============================================================================

grant select, insert, update, delete on table
  public.signals,
  public.insights,
  public.recommendations,
  public.approvals,
  public.moves,
  public.execution_records,
  public.measurements,
  public.learnings,
  public.business_health,
  public.transformation_index,
  public.operational_risks,
  public.knowledge_assets
to authenticated, service_role;
