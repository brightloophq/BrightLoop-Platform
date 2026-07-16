-- =============================================================================
-- 0011 — Analytics events (handoff §12 §25).
--
-- A typed, append-only event log. Handoff §08 Analytics: "real data only; no
-- placeholder KPIs shipped as if real", and §25: "server-side events for
-- anything financial or state-changing so the funnel/rev numbers in Admin
-- Analytics are real (not client-inferred)."
--
-- So Admin Analytics is computed from THIS table plus live entity counts —
-- never from a hardcoded figure. The taxonomy is domain.object.action.
--
-- RLS
--   * SELECT: internal roles only (analytics.* is owner/admin/team scope).
--     A client must never read the aggregate event stream.
--   * INSERT: any authenticated session may append its OWN event — a client
--     approving a deliverable legitimately emits `deliverable.approve`. The emit
--     always happens in our server-action code, but RLS cannot tell that apart
--     from a crafted request, so a determined client could inject a fake event.
--     Impact is data-quality, not exposure (they can't read the stream back).
--     A stricter design routes all writes through a SECURITY DEFINER function;
--     noted for hardening.
--   * No UPDATE/DELETE — append-only, enforced by trigger like transition_log.
-- =============================================================================

create table public.analytics_events (
  id         bigint generated always as identity primary key,
  name       text not null,                         -- domain.object.action
  actor_id   text,
  client_id  text,
  role       text,
  props      jsonb not null default '{}'::jsonb,
  source     text not null default 'server',        -- server | client
  at         timestamptz not null default now(),
  constraint analytics_events_source check (source in ('server', 'client'))
);

create index analytics_events_name_idx on public.analytics_events (name, at desc);
create index analytics_events_at_idx on public.analytics_events (at desc);
create index analytics_events_client_idx on public.analytics_events (client_id) where client_id is not null;

alter table public.analytics_events enable row level security;

create policy "analytics_events_select_internal" on public.analytics_events
  for select to authenticated
  using (public.bl_is_internal());

create policy "analytics_events_insert_any" on public.analytics_events
  for insert to authenticated
  with check (true);

-- Append-only: reuse the same immutability guard shape as transition_log.
create trigger analytics_events_no_update
  before update or delete on public.analytics_events
  for each row execute function public.bl_transition_log_immutable();

comment on table public.analytics_events is
  'Append-only typed event log (domain.object.action). Admin Analytics is computed from here + live counts — never a hardcoded KPI.';
