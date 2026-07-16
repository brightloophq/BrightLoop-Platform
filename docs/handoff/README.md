# BrightLoop Platform — Claude Code Handoff Bundle

**Status:** Product design approved for development.
**Version:** 1.0 (consolidation of approved design work — no new features added).
**Design direction:** BrightLoop — *Brands. Systems. Growth.* Dark-first, toned-down premium.

---

## 0. How to read this bundle

This is a **development-ready specification**, not production code. Everything here was
designed and approved as interactive HTML/React prototypes. Your job in Claude Code is to
**recreate these designs in a real application stack** using the target codebase's patterns —
not to ship the prototype HTML directly.

The prototypes are **high-fidelity**: final colors, typography, spacing, component behavior,
copy, and interaction detail are all intentional. Recreate the UI faithfully. Where this spec
and a prototype disagree, **this spec wins**; where the spec is silent, the prototype is the
reference; where both are silent, see `17-open-decisions.md` — **do not invent requirements**.

### Recommended stack (from the design's integration boundaries)
The designs assume — but are not hard-coupled to — this stack. Confirm with the product owner
before deviating:
- **Frontend:** React + TypeScript + Vite (or Next.js if SSR/SEO for public pages is prioritized — see `10-behaviors.md` §SEO).
- **Backend / DB / Auth:** Supabase (Postgres + Row-Level Security + Auth + Storage).
- **Payments:** Stripe (Checkout / Payment Intents + webhooks).
- **Automation / workflows:** n8n.
- **Email:** transactional provider (Resend/Postmark) via n8n or backend.
- **Calendar / meetings:** Google Calendar + a scheduling provider (Cal.com / Calendly embed).

If SSR is chosen, the public marketing + reputation pages should be server-rendered for SEO;
the authenticated portal and admin can be a client-rendered SPA.

---

## 1. What is BrightLoop

BrightLoop is an integrated agency platform spanning four disciplines in one connected loop —
**Brand · Build · Automate · Grow** — with a public marketing/acquisition site, a self-serve
assessment → configurator → proposal funnel, a client portal, and an internal admin command
center. The whole system runs on one canonical data model and one set of state machines
(`reference/schema.js`).

The platform has four surfaces:

| Surface | Audience | Auth | Entry |
|---|---|---|---|
| **Public experience** | Prospects, visitors | none (public) | `brightloop.co/` |
| **Sales & activation** | Qualified leads becoming clients | magic-link / token | proposal link → portal |
| **Client portal** | Paying clients + their team | authenticated (client roles) | `app.brightloop.co/` |
| **Admin command center** | BrightLoop internal team | authenticated (internal roles) | `admin.brightloop.co/` |

---

## 2. Bundle contents

| File | Covers (of the 30 required topics) |
|---|---|
| `README.md` | Overview, fidelity, stack, integrity rules, **export to Claude Code** |
| `01-architecture.md` | (1) Sitemap & route map, (2) user journeys, (3) roles & permissions, (13) navigation behavior |
| `02-data-model.md` | (4) Data-model spec, (5) entity relationships / ERD |
| `03-state-machines.md` | (6) State machines, (7) valid & prohibited transitions |
| `04-design-system.md` | (10) Design tokens, (11) type/spacing/color/border/shadow/motion, (9) component inventory, (12) responsive behavior |
| `05-pages-public.md` | (8) Page-by-page — public experience |
| `06-pages-sales.md` | (8) Page-by-page — sales & activation |
| `07-pages-portal.md` | (8) Page-by-page — client portal |
| `08-pages-admin.md` | (8) Page-by-page — admin command center |
| `09-forms-and-states.md` | (14) Forms & validation, (15) empty/loading/error/success/waiting/disabled states |
| `10-behaviors.md` | (17) File upload, (18) search/filter/sort/pagination, (19) publishing & moderation, (20) SEO & structured data |
| `11-nfr.md` | (16) Auth/authz, (21) accessibility, (22) performance, (23) security & privacy |
| `12-integrations-and-analytics.md` | (24) Integration boundaries, (25) analytics events |
| `13-assets-and-placeholders.md` | (26) Asset inventory, (27) content placeholders needing real data |
| `14-mvp-vs-v2.md` | (28) MVP vs deferred V2 |
| `15-acceptance-criteria.md` | (29) Acceptance criteria per module |
| `16-implementation-sequence.md` | (30) Recommended implementation sequence |
| `17-open-decisions.md` | Unresolved decisions requiring product-owner input |
| `reference/` | Canonical machine-readable source: `schema.js` (data model + state machines + roles + tone map), `reputation-data.js`, `onboarding-data.js`, `dashboard-data.js`, `admin-data.js`, `tokens/*.css`, `styles.css` |

`reference/schema.js` is the **single source of truth** for entities, enums, roles, permissions,
and legal state transitions. Generate your DB schema, TypeScript types, and RLS policies from it.
The `*-data.js` files are **demo/placeholder datasets** — shapes are correct, values are not real.

---

## 3. Integrity requirements (non-negotiable)

These were explicit product constraints. Carry them into the codebase:

1. **No fabricated proof.** Do not ship invented testimonials, ratings, statistics, or business
   results. Every such value in `reference/*.js` is **placeholder** and must be replaced with
   real, client-approved content before production launch.
2. **Metrics stay undisclosed by default.** Portfolio result metrics (leads, revenue, conversion,
   time saved, SEO, automation savings) render **only** when `metrics.disclosed === true` AND a
   real value exists. The default UI shows an honest "results kept private at the client's request"
   state. Never auto-populate these.
3. **Only approved + published items appear publicly.** Portfolio projects and testimonials are
   public **only** when `publish ∈ {public, featured}`. `draft` and `private` are never served to
   the public site or its API. Enforce this in the query layer / RLS, not just the UI.
4. **Placeholder content is labeled.** Demo copy, names, and companies (The New Greenhouse,
   PolishedPro Cleaners, Meridian Studio, Harbor & Co, Verdant Wellness, Northwind Supply, etc.)
   are representative samples — see `13-assets-and-placeholders.md` for the full replace-before-launch list.
5. **Preserve the design system** and the toned-down premium visual direction. Use the tokens in
   `reference/tokens/`. Do not introduce new color families, gradients-as-decoration, or emoji.
6. **Flag, don't invent.** Anything genuinely undecided is in `17-open-decisions.md`. Add to it
   rather than guessing.

---

## 4. Fidelity & source prototypes

**High-fidelity.** Prototype source files live in the main project (not duplicated here to avoid
drift). Reference them by path while implementing:

| Domain | Prototype files (project-relative) |
|---|---|
| Public — homepage | `website/Homepage.html` + `website/{nav,hero,mid,proof,convert,app}.jsx` |
| Public — reputation (portfolio/case studies/testimonials) | `website/Reputation.html` + `website/rep-*.jsx` + `website/reputation-data.js` |
| Funnel — assessment/configurator/AI rec/roadmap/auth | `platform/Onboarding.html` + `platform/{auth,steps,configurator,roadmap,app,data}.js(x)` |
| Sales & activation | `platform/Sales.html` + `platform/sales.jsx` |
| Client portal | `platform/Dashboard.html` + `platform/{dash-app,dash-views,dashboard-data}.js(x)` |
| Admin command center | `platform/Admin.html` + `platform/{admin-app,admin-views,admin-data}.js(x)` |
| Auth screens | `platform/Auth.html` + `platform/auth.jsx` |
| Reputation CMS (admin) | `platform/Reputation-CMS.html` + `platform/reputation-cms.jsx` |
| Cross-cutting states | `platform/EdgeStates.html`, `platform/StateLibrary.html` |
| Design system reference | `readme.md`, `guidelines/*`, `components/*`, `tokens/*` |

If you received only this handoff folder, request the full project export (see below) — the
`reference/` files plus these specs are sufficient to build, but the prototypes are the visual
ground truth.

---

## 5. How to export / transfer this bundle into Claude Code

See the end of the delivery message for the exact copy-paste steps. In short:

1. **Download** this `design_handoff_brightloop_platform/` folder as a zip (a download card was
   provided in chat), and optionally the **whole project** for the prototype source + design system.
2. **Unzip into your repo**, e.g. `docs/handoff/` (specs) and commit `reference/schema.js` where
   your backend/types can import it (e.g. `packages/shared/schema.js`).
3. **Open the repo in Claude Code** and point it at `docs/handoff/README.md` first, then work
   module-by-module following `16-implementation-sequence.md`.
4. Use the suggested kickoff prompt in the delivery message.
