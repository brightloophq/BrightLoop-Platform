-- =============================================================================
-- Phase D · Sprint D1 — Transformation Execution: Workspace Foundation.
--
-- ADDITIVE ONLY. Three new tables that begin AFTER Phase C Report Assembly:
-- a Transformation Workspace seeded from a certified proposal, its Initiatives,
-- and an append-only Activity log. Touches no Phase A–C table, enum, or policy.
-- Internal-only RLS for D1 (operator workspace); client exposure arrives later.
-- =============================================================================

-- ---- workspace --------------------------------------------------------------
create table public.transformation_workspace (
  id                   text primary key,
  client_id            text references public.clients (id) on delete cascade,
  scan_run_id          text not null,
  report_artifact_id   text,
  proposal_artifact_id text,
  title                text not null,
  objectives           jsonb not null default '[]'::jsonb,
  status               text not null default 'seeded' check (status in ('seeded')),
  seed_checksum        text not null,
  version              integer not null default 1 check (version > 0),
  created_at           timestamptz not null default now(),
  -- the idempotency identity: one workspace per (scan, content-addressed seed)
  unique (scan_run_id, seed_checksum)
);
create index transformation_workspace_client_idx on public.transformation_workspace (client_id);
create index transformation_workspace_scan_idx on public.transformation_workspace (scan_run_id);
comment on table public.transformation_workspace is
  'Phase D D1: an executable transformation workspace seeded from a certified Phase C proposal.';

-- ---- initiative -------------------------------------------------------------
create table public.transformation_initiative (
  id                      text primary key,
  workspace_id            text not null references public.transformation_workspace (id) on delete cascade,
  client_id               text references public.clients (id) on delete cascade,
  source_proposal_item_id text not null,
  title                   text not null,
  objective               text,
  priority                text not null check (priority in ('critical', 'high', 'medium', 'low')),
  effort                  text not null check (effort in ('small', 'medium', 'large', 'unknown')),
  business_impact         text not null check (business_impact in ('low', 'moderate', 'high')),
  dependencies            jsonb not null default '[]'::jsonb,
  supporting_evidence_ids jsonb not null default '[]'::jsonb,
  proposal_artifact_id    text not null default '',
  execution_status        text not null default 'seeded' check (execution_status in ('seeded')),
  created_at              timestamptz not null default now()
);
create index transformation_initiative_workspace_idx on public.transformation_initiative (workspace_id);
create index transformation_initiative_client_idx on public.transformation_initiative (client_id);
comment on table public.transformation_initiative is
  'Phase D D1: a unit of executable work, seeded 1:1 from a proposal item (priority/effort/evidence carried verbatim).';

-- ---- activity (append-only audit + event source) ----------------------------
create table public.transformation_activity (
  id           text primary key,
  workspace_id text not null references public.transformation_workspace (id) on delete cascade,
  client_id    text references public.clients (id) on delete cascade,
  type         text not null check (type in ('workspace_created', 'initiative_seeded')),
  subject_type text not null check (subject_type in ('workspace', 'initiative')),
  subject_id   text not null,
  summary      text not null,
  command_id   text not null,
  at           timestamptz not null default now(),
  unique (command_id)
);
create index transformation_activity_workspace_idx on public.transformation_activity (workspace_id);
create index transformation_activity_client_idx on public.transformation_activity (client_id);
comment on table public.transformation_activity is
  'Phase D D1: append-only audit + event source for the transformation workspace. Never updated or deleted.';

-- ---- append-only enforcement ------------------------------------------------
create or replace function public.bl_txexec_append_only() returns trigger
  language plpgsql as $$
begin
  raise exception 'transformation_activity is append-only';
end; $$;
create trigger transformation_activity_no_mutation
  before update or delete on public.transformation_activity
  for each row execute function public.bl_txexec_append_only();

-- ---- RLS + grants (internal-only for D1) ------------------------------------
alter table public.transformation_workspace enable row level security;
alter table public.transformation_initiative enable row level security;
alter table public.transformation_activity enable row level security;

create policy "transformation_workspace_internal_all" on public.transformation_workspace
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
create policy "transformation_initiative_internal_all" on public.transformation_initiative
  for all to authenticated using (public.bl_is_internal()) with check (public.bl_is_internal());
-- append-only: internal may SELECT + INSERT only; UPDATE/DELETE blocked by trigger AND grant.
create policy "transformation_activity_internal_read" on public.transformation_activity
  for select to authenticated using (public.bl_is_internal());
create policy "transformation_activity_internal_insert" on public.transformation_activity
  for insert to authenticated with check (public.bl_is_internal());

grant select, insert, update, delete on public.transformation_workspace to authenticated;
grant select, insert, update, delete on public.transformation_initiative to authenticated;
grant select, insert on public.transformation_activity to authenticated; -- no update/delete grant
grant all on public.transformation_workspace to service_role;
grant all on public.transformation_initiative to service_role;
grant select, insert on public.transformation_activity to service_role;
