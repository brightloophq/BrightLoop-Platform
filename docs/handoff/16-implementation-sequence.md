# 16 · Recommended Implementation Sequence

> Covers required topic **30 (recommended implementation sequence)**. Ordered to de-risk early, unblock
> parallel work, and reach a demoable revenue loop fast. Each phase ends in something verifiable.

## Phase 0 — Foundations (blocks everything)
1. Repo + tooling (React/TS/Vite or Next.js), CI, environments.
2. Port design tokens (`reference/tokens/*`) and build the **component library** (`04` §6) with the
   documented prop contracts. Storybook or equivalent.
3. Generate DB schema, TypeScript types, and enums from `reference/schema.js`; set up Supabase, RLS
   scaffolding, and the **state-transition guard** + `transition_log`.
4. Auth (Supabase) with roles/claims; route guards for the three surfaces.

## Phase 1 — Public marketing + reputation (revenue-adjacent, SEO, parallelizable)
5. App shell: public Navbar/MegaMenu/Footer, routing, SSR/prerender setup.
6. Homepage, Services, Industries, Packages, Contact/booking, Legal shells.
7. **Reputation:** data layer from `reputation-data.js` semantics (publish-gated queries), Portfolio
   (filter/search/sort/paginate), Project case study (metric gating + SEO/JSON-LD), Testimonials.
8. SEO: meta/canonical/OG/JSON-LD, sitemap, robots.

## Phase 2 — Admin core (needed to feed everything with real content)
9. Admin shell + Executive overview.
10. **Reputation CMS** (Portfolio + Reviews + Content/home flags) — so real proof can be published.
11. Clients, Projects, Milestones, Deliverables (review/submit), Media library.
12. Leads/CRM.

## Phase 3 — Acquisition funnel
13. Assessment (resumable) → Health Score compute.
14. Configurator (de-dup + live estimate) → `Configuration`.
15. AI Recommendation + Roadmap + booking.

## Phase 4 — Sales & activation (closes the loop)
16. Proposals (admin build/send) + client Proposal review.
17. Contracts (e-sign + countersign).
18. Invoices + **Stripe** payment + webhooks.
19. Account activation → portal entry; `clientLifecycle` transitions wired end-to-end.

## Phase 5 — Client portal (serve the paying client)
20. Portal shell + Dashboard overview + Project/Milestones.
21. Deliverables approval loop (the key recurring UX).
22. Files, Messages, Meetings, Invoices, Notifications.
23. Health Score, Recommended services, Growth Roadmap, Settings (account/team).

## Phase 6 — Ops, integrations, hardening
24. n8n automations (intake, dunning, review requests, approval nudges) + Automation Monitoring.
25. Email templates + calendar sync; Analytics events + Admin Analytics from real data.
26. Accessibility audit (AA), performance budgets, security review (RLS/penetration of publish gate,
    webhook signature verification, CSP), consent/privacy flows.
27. Replace **all** placeholder content (see `13`) with real, approved data; pre-launch integrity checklist.

**Parallelization:** Phase 1 (public) and Phase 2 (admin) can run in parallel once Phase 0 lands, since both
sit on the shared component library + schema. Funnel (3) and Sales (4) depend on admin proposal/config plumbing.
Portal (5) depends on delivery entities from Phase 2.
