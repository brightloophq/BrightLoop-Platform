-- =============================================================================
-- Phase B · Sprint 13B — atomic queue-lease RPC.
--
-- ADDITIVE ONLY. Adds one function; no table or policy is altered.
--
-- WHY AN RPC
--   Leasing must not be a SELECT followed by an UPDATE — two workers polling
--   concurrently would both read the same row and both claim it. PostgREST cannot
--   express `UPDATE ... FROM (SELECT ... FOR UPDATE SKIP LOCKED)` in one round
--   trip, so the atomic statement lives here and the adapter calls it via rpc().
--
-- SECURITY
--   SECURITY INVOKER (the default) — the function runs as the CALLER, so the
--   job_queue RLS policy still applies and a non-internal role leases nothing.
--   This is deliberately NOT security definer: no privilege escalation, no
--   service-role assumption.
-- =============================================================================

create or replace function public.bl_lease_next_job(
  p_owner         text,
  p_lease_seconds integer,
  p_job_type      text default null,
  p_client_id     text default null
)
returns setof public.job_queue
language sql
volatile
as $$
  -- One statement: pick the next eligible row with SKIP LOCKED and mark it leased.
  -- Concurrent callers skip each other's locked rows, so a row is leased once.
  update public.job_queue q
     set status           = 'leased',
         lease_status     = 'leased',
         lease_owner      = p_owner,
         lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 1)),
         attempt          = q.attempt + 1,
         updated_at       = now()
   where q.id = (
     select c.id
       from public.job_queue c
      where c.status = 'queued'
        and c.available_at <= now()
        and (p_job_type  is null or c.job_type  = p_job_type)
        and (p_client_id is null or c.client_id = p_client_id)
      order by c.priority asc, c.available_at asc, c.created_at asc
      limit 1
      for update skip locked
   )
  returning q.*;
$$;

comment on function public.bl_lease_next_job(text, integer, text, text) is
  'Phase B runtime: atomically lease the next eligible queue job (FOR UPDATE SKIP LOCKED). SECURITY INVOKER — job_queue RLS still applies. Returns zero rows when nothing qualifies.';

-- Callable by the app roles; RLS on job_queue remains the real boundary.
grant execute on function public.bl_lease_next_job(text, integer, text, text) to authenticated, service_role;
