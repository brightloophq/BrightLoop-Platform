-- =============================================================================
-- 0023 — RLS audit helper (Sprint 9 hardening). A SECURITY DEFINER function that
-- reports RLS status + policy count for every public table, so we (and future
-- ops) can definitively verify no table ships with RLS disabled or unpolicied.
--
-- Execute is REVOKED from anon + authenticated — only the service role / postgres
-- can run it. It reads catalog metadata only, never row data.
-- =============================================================================
create or replace function public.bl_rls_audit()
returns table (table_name text, rls_enabled boolean, policy_count bigint)
language sql
security definer
set search_path = public, pg_catalog
as $$
  select c.relname::text,
         c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname;
$$;

revoke execute on function public.bl_rls_audit() from anon, authenticated;

comment on function public.bl_rls_audit() is
  'Ops audit: RLS status + policy count per public table. Service-role only.';
