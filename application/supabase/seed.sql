-- =============================================================================
-- ██  LOCAL-ONLY DEMO SEED — NEVER PUSHED TO THE HOSTED PROJECT.  ██
--
-- The Supabase CLI runs this file ONLY on `supabase db reset` against a LOCAL
-- database. `supabase db push` does not execute it. That is deliberate and is
-- the approved decision (2026-07-16): the hosted project starts EMPTY.
--
-- WHY THE HOSTED DB STAYS EMPTY:
--   The owner has real, client-consented testimonials waiting for the Sprint 3
--   Reputation CMS. Seeding six invented case studies and five invented reviews
--   into the database that is about to hold real proof would mean hunting them
--   down later — and one wrong click would publish "Kemar Bailey" as a genuine
--   endorsement. The public site's honest empty states handle an empty database
--   correctly ("No published projects yet"), so there is nothing to paper over.
--
-- Every row below is SAMPLE COPY from the design bundle. None of it is real,
-- none of it is client-approved, and no business result is claimed anywhere:
-- `metrics.disclosed` is false on every project, exactly as in
-- docs/handoff/reference/reputation-data.js.
--
-- The `client` column is prefixed "[DEMO]" so a stray row is identifiable at a
-- glance, and every row is removable with:
--   delete from public.portfolio_projects where client like '[DEMO]%';
-- =============================================================================

-- Guard: refuse to seed anything that already holds data.
do $$
begin
  if (select count(*) from public.portfolio_projects) > 0 then
    raise exception 'portfolio_projects is not empty — refusing to seed demo data over real content';
  end if;
end $$;

-- ---- Testimonials first (portfolio_projects.testimonial_id references them) --
insert into public.testimonials
  (id, project_slug, author, role, company, country, date, publish, pinned, featured_on_home,
   avatar_slot, overall, categories, quote, media)
values
  ('t_greenhouse', null, 'Kemar Bailey', 'Founder', '[DEMO] The New Greenhouse', 'Jamaica',
   '2026-05-24', 'featured', true, true, 'rep-av-greenhouse', 5,
   '{"communication":5,"quality":5,"timeliness":5,"value":5,"professionalism":5}'::jsonb,
   'SAMPLE REVIEW — not a real client. They understood what we were building before we could fully explain it.',
   '[]'::jsonb),
  ('t_polishedpro', null, 'Danielle Foster', 'Owner', '[DEMO] PolishedPro Cleaners', 'Jamaica',
   '2025-11-10', 'featured', true, true, 'rep-av-polishedpro', 5,
   '{"communication":5,"quality":5,"timeliness":4,"value":5,"professionalism":5}'::jsonb,
   'SAMPLE REVIEW — not a real client. The booking system changed how we run.',
   '[]'::jsonb),
  ('t_meridian', null, 'Jordan Rivera', 'Founder', '[DEMO] Meridian Studio', 'United States',
   '2025-09-20', 'public', false, true, 'rep-av-meridian', 5,
   '{"communication":5,"quality":5,"timeliness":4,"value":5,"professionalism":5}'::jsonb,
   'SAMPLE REVIEW — not a real client. They rebuilt how the whole business runs.',
   '[]'::jsonb),
  ('t_verdant', null, 'Amara Osei', 'Director', '[DEMO] Verdant Wellness Collective', 'Canada',
   '2024-08-01', 'public', false, false, 'rep-av-verdant', 4,
   '{"communication":5,"quality":5,"timeliness":4,"value":4,"professionalism":5}'::jsonb,
   'SAMPLE REVIEW — not a real client. For the first time all five of us feel like one practice.',
   '[]'::jsonb);

-- ---- Portfolio projects ------------------------------------------------------
-- Publish states mirror the design bundle, INCLUDING one `private` row
-- (northwind-supply). That row is the fixture the publish-gate tests target:
-- it must never appear on the public site.
insert into public.portfolio_projects
  (id, slug, name, client, industry, size, country, year, services, budget, tech, platform,
   timeline, deliverables_count, completed_date, project_status, publish, featured_on_home,
   awards, live_url, permission_live_preview, tags, summary, challenge, approach,
   hero_slot, gallery_slots, media, metrics, testimonial_id, seo)
values
  ('p_greenhouse', 'new-greenhouse', 'The New Greenhouse', '[DEMO] The New Greenhouse',
   'Agriculture', 'Micro (2–10)', 'Jamaica', 2026,
   '["Brand","Build","Grow"]'::jsonb, '$5K–$10K', '["Webflow","Google Workspace","Meta Ads"]'::jsonb,
   'Webflow', '7 weeks', 14, '2026-05-18', 'Live', 'featured', true,
   '["featured_project","client_favourite"]'::jsonb, 'https://example.com/greenhouse', true,
   '["local","sustainability","farm-to-table","identity"]'::jsonb,
   'SAMPLE — A grounded identity and conversion-first site for an urban-farming venture.',
   'SAMPLE — Strong word-of-mouth demand but no cohesive brand or online presence.',
   'SAMPLE — A warm brand system, then a single-page site routing orders into a shared inbox.',
   'rep-hero-greenhouse', '["rep-greenhouse-1","rep-greenhouse-2"]'::jsonb, '[]'::jsonb,
   '{"disclosed": false}'::jsonb, 't_greenhouse',
   '{"title":"[DEMO] The New Greenhouse — Case Study","description":"Sample case study.","ogImage":"rep-hero-greenhouse"}'::jsonb),

  ('p_polishedpro', 'polishedpro-cleaners', 'PolishedPro Cleaners', '[DEMO] PolishedPro Cleaners',
   'Home Services', 'Micro (2–10)', 'Jamaica', 2025,
   '["Brand","Build","Automate"]'::jsonb, '$10K–$25K', '["WordPress","Airtable","Zapier"]'::jsonb,
   'WordPress', '9 weeks', 19, '2025-11-02', 'Complete', 'featured', true,
   '["most_innovative"]'::jsonb, 'https://example.com/polishedpro', true,
   '["cleaning","booking","automation","local"]'::jsonb,
   'SAMPLE — A trustworthy brand and an automated booking-to-dispatch system.',
   'SAMPLE — Bookings came by phone and were tracked on a whiteboard.',
   'SAMPLE — Refreshed the brand and wired an automated scheduling pipeline.',
   'rep-hero-polishedpro', '["rep-polishedpro-1"]'::jsonb, '[]'::jsonb,
   '{"disclosed": false}'::jsonb, 't_polishedpro',
   '{"title":"[DEMO] PolishedPro Cleaners — Case Study","description":"Sample case study.","ogImage":"rep-hero-polishedpro"}'::jsonb),

  ('p_meridian', 'meridian-studio', 'Meridian Studio', '[DEMO] Meridian Studio',
   'Professional Services', 'Small (11–50)', 'United States', 2025,
   '["Brand","Build","Automate","Grow"]'::jsonb, '$25K+', '["Next.js","HubSpot","Notion"]'::jsonb,
   'Next.js', '12 weeks', 27, '2025-09-14', 'Ongoing', 'public', true,
   '["highest_roi"]'::jsonb, 'https://example.com/meridian', true,
   '["consulting","rebrand","crm","pipeline"]'::jsonb,
   'SAMPLE — A full rebrand, marketing site and intake-to-CRM automation.',
   'SAMPLE — A referral-only firm with no way to capture inbound interest.',
   'SAMPLE — New identity, marketing site, and automated intake feeding a CRM.',
   'rep-hero-meridian', '["rep-meridian-1"]'::jsonb, '[]'::jsonb,
   '{"disclosed": false}'::jsonb, 't_meridian',
   '{"title":"[DEMO] Meridian Studio — Case Study","description":"Sample case study.","ogImage":"rep-hero-meridian"}'::jsonb),

  ('p_verdant', 'verdant-wellness', 'Verdant Wellness', '[DEMO] Verdant Wellness Collective',
   'Health & Wellness', 'Micro (2–10)', 'Canada', 2024,
   '["Brand","Grow"]'::jsonb, '$5K–$10K', '["WordPress","Meta Ads","Notion"]'::jsonb,
   'WordPress', '6 weeks', 11, '2024-07-22', 'Complete', 'public', false,
   '["editors_choice"]'::jsonb, '', false,
   '["wellness","identity","content"]'::jsonb,
   'SAMPLE — A calm, credible brand for a multi-practitioner wellness collective.',
   'SAMPLE — Five practitioners with five different looks and no shared story.',
   'SAMPLE — Unified them under one warm brand with a lightweight content system.',
   'rep-hero-verdant', '["rep-verdant-1"]'::jsonb, '[]'::jsonb,
   '{"disclosed": false}'::jsonb, 't_verdant',
   '{"title":"[DEMO] Verdant Wellness — Case Study","description":"Sample case study.","ogImage":"rep-hero-verdant"}'::jsonb),

  -- publish = 'private' — the publish-gate fixture. MUST never be publicly visible.
  ('p_northwind', 'northwind-supply', 'Northwind Supply', '[DEMO] Northwind Supply Co',
   'Retail & E-commerce', 'Mid-market (51–250)', 'United States', 2023,
   '["Build","Automate","Grow"]'::jsonb, '$25K+', '["Shopify","HubSpot","Zapier"]'::jsonb,
   'Shopify Plus', '14 weeks', 31, '2023-10-30', 'Complete', 'private', false,
   '[]'::jsonb, '', false,
   '["ecommerce","b2b","operations"]'::jsonb,
   'SAMPLE — A B2B commerce rebuild for an industrial supply distributor.',
   'SAMPLE — A large catalogue and manual quoting made ordering slow.',
   'SAMPLE — Rebuilt with trade pricing and automated quote-to-order handoffs.',
   'rep-hero-northwind', '[]'::jsonb, '[]'::jsonb,
   '{"disclosed": false}'::jsonb, null,
   '{"title":"[DEMO] Northwind Supply — Case Study","description":"Sample case study.","ogImage":"rep-hero-northwind"}'::jsonb);

-- Link testimonials back to their projects now that both exist.
update public.testimonials set project_slug = 'new-greenhouse'       where id = 't_greenhouse';
update public.testimonials set project_slug = 'polishedpro-cleaners' where id = 't_polishedpro';
update public.testimonials set project_slug = 'meridian-studio'      where id = 't_meridian';
update public.testimonials set project_slug = 'verdant-wellness'     where id = 't_verdant';
