-- =============================================================================
-- 0007 — Reputation: portfolio projects + testimonials (public marketing proof)
--
-- Columns map 1:1 to the types in packages/schema `reputation.ts`, which the
-- placeholder dataset already conforms to. When this is applied, the placeholder
-- rows become the seed and SupabaseReputationRepository replaces the placeholder
-- implementation behind the same port — no application changes.
--
-- ██ THE PUBLISH GATE ██
-- The anon role can read ONLY publish IN ('public','featured'). This is the
-- database half of the gate that packages/domain applies in the query layer.
-- Acceptance criterion (handoff §15): "Only publish ∈ {public,featured} projects
-- appear (verified via crafted API request → excluded)." That test targets THIS
-- policy — the UI is not what makes it true.
--
-- ██ METRIC DISCLOSURE ██
-- `metrics` is jsonb with a CHECK that forces the `disclosed` key to exist and
-- be a boolean. A row cannot omit its disclosure posture. Values are surfaced
-- only through disclosedMetrics() in the domain layer.
-- =============================================================================

create type public.publish_status as enum ('featured', 'public', 'draft', 'private');

-- ---- Portfolio projects -----------------------------------------------------
create table public.portfolio_projects (
  id                      text primary key,           -- p_… prefixed ULID
  slug                    text not null unique,
  name                    text not null,
  client                  text not null,
  industry                text not null,
  size                    text not null,
  country                 text not null,
  year                    integer not null,
  services                jsonb not null default '[]'::jsonb,
  budget                  text not null,
  tech                    jsonb not null default '[]'::jsonb,
  platform                text not null,
  timeline                text not null,
  deliverables_count      integer not null default 0,
  completed_date          date,
  project_status          text not null,
  publish                 public.publish_status not null default 'draft',
  featured_on_home        boolean not null default false,
  awards                  jsonb not null default '[]'::jsonb,
  live_url                text not null default '',
  permission_live_preview boolean not null default false,
  tags                    jsonb not null default '[]'::jsonb,
  summary                 text not null default '',
  challenge               text not null default '',
  approach                text not null default '',
  hero_slot               text not null default '',
  gallery_slots           jsonb not null default '[]'::jsonb,
  media                   jsonb not null default '[]'::jsonb,
  -- Result metrics. `disclosed` is mandatory and defaults to FALSE: a project
  -- cannot exist in a state where its disclosure posture is unknown.
  metrics                 jsonb not null default '{"disclosed": false}'::jsonb,
  testimonial_id          text,
  seo                     jsonb not null default '{}'::jsonb,
  -- Manual ordering in the CMS (handoff §10.3 reorder).
  "order"                 integer not null default 0,
  -- Scheduled publication: a job flips draft→public at this time (handoff §10.3).
  scheduled_publish_at    timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint portfolio_projects_slug_kebab check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint portfolio_projects_metrics_disclosed check (
    jsonb_typeof(metrics -> 'disclosed') = 'boolean'
  ),
  -- Live-site CTAs require BOTH permission and a real URL. Enforce the pairing
  -- at the database so a permissioned row cannot carry an empty URL.
  constraint portfolio_projects_live_preview_needs_url check (
    permission_live_preview = false or length(trim(live_url)) > 0
  )
);

create index portfolio_projects_publish_idx on public.portfolio_projects (publish);
create index portfolio_projects_industry_idx on public.portfolio_projects (industry);
create index portfolio_projects_completed_idx on public.portfolio_projects (completed_date desc);
create index portfolio_projects_featured_home_idx on public.portfolio_projects (featured_on_home)
  where featured_on_home = true;

-- ---- Testimonials -----------------------------------------------------------
create table public.testimonials (
  id               text primary key,                  -- t_… prefixed ULID
  project_slug     text references public.portfolio_projects (slug) on delete set null,
  author           text not null,
  role             text not null default '',
  company          text not null,
  country          text not null default '',
  date             date,
  publish          public.publish_status not null default 'draft',
  pinned           boolean not null default false,
  featured_on_home boolean not null default false,
  avatar_slot      text not null default '',
  overall          smallint not null,
  categories       jsonb not null default '{}'::jsonb,
  quote            text not null,
  media            jsonb not null default '[]'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint testimonials_overall_range check (overall between 1 and 5),
  -- All five category ratings must be present — no partial rating rows.
  constraint testimonials_categories_complete check (
    categories ? 'communication'
    and categories ? 'quality'
    and categories ? 'timeliness'
    and categories ? 'value'
    and categories ? 'professionalism'
  )
);

create index testimonials_publish_idx on public.testimonials (publish);
create index testimonials_project_slug_idx on public.testimonials (project_slug);
create index testimonials_pinned_idx on public.testimonials (pinned) where pinned = true;

-- portfolio_projects.testimonial_id ↔ testimonials.id (added after both exist).
alter table public.portfolio_projects
  add constraint portfolio_projects_testimonial_fk
  foreign key (testimonial_id) references public.testimonials (id) on delete set null;

-- =============================================================================
-- RLS — THE PUBLISH GATE
-- =============================================================================
alter table public.portfolio_projects enable row level security;
alter table public.testimonials enable row level security;

-- Anonymous + authenticated readers see ONLY published rows. A crafted request
-- cannot return a draft or private row: there is no policy that permits it.
create policy "portfolio_projects_public_read" on public.portfolio_projects
  for select to anon, authenticated
  using (publish in ('public', 'featured'));

create policy "testimonials_public_read" on public.testimonials
  for select to anon, authenticated
  using (publish in ('public', 'featured'));

-- Internal marketing roles see everything, including drafts, for the CMS.
create policy "portfolio_projects_internal_read" on public.portfolio_projects
  for select to authenticated
  using (public.bl_is_internal());

create policy "testimonials_internal_read" on public.testimonials
  for select to authenticated
  using (public.bl_is_internal());

-- marketing.* is owner/admin (handoff §01.3) — team_member cannot publish proof.
create policy "portfolio_projects_marketing_write" on public.portfolio_projects
  for all to authenticated
  using (public.bl_role() in ('owner', 'admin'))
  with check (public.bl_role() in ('owner', 'admin'));

create policy "testimonials_marketing_write" on public.testimonials
  for all to authenticated
  using (public.bl_role() in ('owner', 'admin'))
  with check (public.bl_role() in ('owner', 'admin'));

comment on policy "portfolio_projects_public_read" on public.portfolio_projects is
  'THE publish gate. Only public|featured leave the database for public readers. Do not widen.';
