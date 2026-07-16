# 01 · Architecture — Sitemap, Routes, Journeys, Roles, Navigation

> Covers required topics **1 (sitemap & route map)**, **2 (user journeys)**,
> **3 (roles & permissions)**, **13 (navigation behavior)**.

---

## 1. Sitemap & route map

Three route trees on three subdomains (or one app with path prefixes if you prefer a single
deploy — the boundary that matters is **auth + role**, not the host).

### 1.1 Public experience — `brightloop.co` (no auth, SEO-indexed)

```
/                                  Homepage
/services                          Services overview (Brand · Build · Automate · Grow)
/services/:discipline              Service detail (brand|build|automate|grow)
/industries                        Industries overview
/industries/:slug                  Industry detail
/packages                          Packages & pricing
/portfolio                         Portfolio / Success Stories (filter + search + paginate)
/portfolio/:slug                   Project case study (e.g. /portfolio/new-greenhouse)
/case-studies/:slug                Long-form case study (canonical variant of a project)
/testimonials                      Testimonial wall (aggregate + category ratings)
/assessment                        Business Health Assessment (funnel step 1)
/configurator                      Package Configurator (funnel step 2)
/recommendation                    AI Recommendation (funnel step 3, derived)
/roadmap                           Business Roadmap (funnel step 4, derived)
/contact                           Contact + booking (scheduler)
/legal/privacy                     Privacy Policy
/legal/terms                       Terms of Service
/legal/cookies                     Cookie Policy
/login  /signup  /reset  /verify   Authentication (see Auth prototype)
```

> **Prototype note:** the assessment→configurator→recommendation→roadmap funnel is implemented in
> the `Onboarding.html` prototype as a single state-machine-driven flow with a progress rail
> (`platform/app.jsx`). In production, expose the routes above so steps are deep-linkable and
> resumable, but keep the single orchestrator + progress rail UX.

### 1.2 Sales & activation — token/magic-link gated (`brightloop.co/x/…` or in-portal)

```
/proposal/:token                   Proposal review (client-facing, no full account required)
/contract/:token                   Contract / SOW review + e-signature
/payment/:token                    Deposit / payment (Stripe)
/activate/:token                   Account activation (set password, invite team) → portal
```

### 1.3 Client portal — `app.brightloop.co` (auth: `client_admin`, `client_member`)

```
/                                  Dashboard overview
/project                           Project progress (switcher if multiple projects)
/project/milestones                Milestones
/project/deliverables              Deliverables (list)
/project/deliverables/:id          Deliverable detail — approvals & revisions
/files                             Files
/messages                          Messages (threads)
/meetings                          Meetings (schedule + join)
/invoices                          Invoices & payments
/health                            Business Health Score
/recommendations                   Recommended services
/growth-roadmap                    Growth Roadmap
/notifications                     Notifications
/settings/account                  Account settings
/settings/team                     Team settings (client_admin only)
```

### 1.4 Admin command center — `admin.brightloop.co` (auth: `owner`, `admin`, `team_member`)

```
/                                  Executive overview
/leads                             Leads & CRM (pipeline)
/clients                           Clients (list) · /clients/:id (detail)
/projects                          Projects · /projects/:id
/milestones                        Milestones (cross-project)
/deliverables                      Deliverables (review queue)
/messages                          Messages (all threads)
/proposals                         Proposals · /proposals/:id
/contracts                         Contracts · /contracts/:id
/invoices                          Invoices & payments
/portfolio                         Portfolio & case-study management (Reputation CMS → Projects)
/reviews                           Testimonial & review moderation (Reputation CMS → Reviews)
/media                             Media library
/team                              Team & permissions
/analytics                         Analytics
/automation                        Automation monitoring
/content                           Content publishing (homepage feature flags, pages)
```

> Portfolio/reviews management is the existing **Reputation CMS** prototype
> (`platform/Reputation-CMS.html`), surfaced inside admin as the `/portfolio`, `/reviews`, and the
> homepage-feature portion of `/content`.

---

## 2. User journeys

### J1 — Prospect → paying client (the core loop)
1. Lands on **Homepage** → explores **Services / Industries / Packages** → views **Portfolio**
   and **Testimonials** for proof.
2. Starts **Business Health Assessment** (`clientLifecycle: prospect`). Answers questions →
   receives a **Health Score**.
3. Enters **Package Configurator**: selects modules; already-owned assets are de-duplicated; a
   live "from" estimate updates.
4. Sees **AI Recommendation** (derived from assessment + configuration) and a **Business Roadmap**.
5. **Books a strategy call** / creates an account (`prospect → member`).
6. Receives a **Proposal** (`proposal: sent`) → reviews → accepts (or requests changes → `revised`).
7. Signs **Contract** (`contract: signed_client → countersigned → active`).
8. Pays **deposit** (`payment: succeeded`, `invoice: paid`).
9. **Account activation** (`member → client_active`) → lands in **Portal**.

### J2 — Active client in portal
Dashboard overview → track **project progress / milestones** → **approve or request revisions** on
deliverables → exchange **messages** → **schedule meetings** → **pay invoices** → monitor **Business
Health Score** → review **recommended services** and **growth roadmap**. Notifications drive re-entry.

### J3 — Client approval loop (most frequent recurring action)
Milestone reaches `waiting_client_approval` → client sees an **action card** + notification →
opens deliverable → **Approve** (`approved → final`) **or** **Request revision** (captures feedback,
bumps version, reopens the deliverable for a new submission).

### J4 — Internal: lead → delivery
Admin works **Leads/CRM** pipeline (`new → qualified → proposal_sent → won`) → builds/sends
**Proposal** → **Contract** → **Invoice** → on payment, **creates Project**, assigns manager, defines
**Milestones/Deliverables** → team delivers → submits for client approval → tracks in **Projects**.

### J5 — Internal: reputation publishing
Admin creates a **portfolio project** (`draft`) → uploads media → fills case study → sets result
metrics **only if client-approved** (`disclosed`) → sets `publish = public|featured` → optionally
`featuredOnHome` → moderates the linked **testimonial** (approve, pin, feature). Public site updates.

---

## 3. Roles & permissions

Source of truth: `reference/schema.js` → `ROLES`, `PERMISSIONS`. Enforce **twice**: in the UI
(hide/disable) **and** at the data layer (Supabase RLS). UI-only enforcement is not acceptable for
anything in the integrity list.

| Role | Scope | Capabilities (summary) |
|---|---|---|
| `owner` | internal | `*` — everything, including team/permissions & billing config |
| `admin` | internal | clients, projects, finance, marketing, automation, analytics, settings; team read |
| `team_member` | internal | read/update projects; full deliverables/messages/meetings; read clients |
| `client_admin` | client | own project read; approve deliverables; pay invoices; sign contract; invite team; reports; own settings |
| `client_member` | client | own project read; comment on deliverables; read reports |

**Authorization boundaries**
- Client roles are scoped to **their own** client org's records (`own.*`). RLS predicate:
  `row.clientId = auth.client_id`.
- Internal roles are scoped by capability, not ownership; `team_member` is read-mostly on clients
  and cannot touch finance/marketing/automation/settings.
- Destructive/financial actions (`finance.*`, `settings.*`, `team.*`) are `owner`/`admin` only.
- Signing (`own.contract.sign`) and paying (`own.invoices.pay`) are `client_admin` only, never
  `client_member`.

See `11-nfr.md` for the full auth/authz requirements and `15-acceptance-criteria.md` for
per-module permission acceptance tests.

---

## 4. Navigation behavior

### Public
- **Sticky top header** (`--header-h: 72px`, `z-index --z-sticky:40`). Transparent over hero;
  on scroll >8px it gains `background: rgba(11,18,32,0.72)`, `backdrop-filter: blur(14px)`, and a
  `--border-subtle` bottom border (transition 300ms).
- **Services mega-menu** on hover (desktop) / tap (touch): 2×2 grid of the four disciplines with
  icon + label + one-line description; `z-index --z-dropdown:45`.
- Primary nav: Services (mega), Framework, Work (→ /portfolio), About, Insights + primary CTA
  "Book a Strategy Call".
- **Reputation sub-nav** (portfolio/testimonials) shares the sticky-glass header with an underline
  tab indicator; detail pages use a "← Back to portfolio" affordance, not a full nav change.

### Portal & Admin
- **Left sidebar** navigation (collapsible), **top bar** with context (project switcher in portal,
  global search + notifications + account menu). Active route highlighted.
- Portal groups nav as: Overview · Project (progress/milestones/deliverables) · Files · Messages ·
  Meetings · Invoices · Growth (health/recommendations/roadmap) · Settings.
- Admin groups nav as: Overview · Sales (leads/proposals/contracts) · Delivery
  (clients/projects/milestones/deliverables/messages) · Finance (invoices) · Marketing
  (portfolio/reviews/media/content) · Ops (team/analytics/automation).

### Responsive nav (see `04-design-system.md` §responsive for breakpoints)
- **≥1024px:** full sidebar (portal/admin) / full horizontal nav + mega-menu (public).
- **768–1023px:** sidebar collapses to icon rail (portal/admin); public keeps horizontal nav,
  mega-menu becomes tap.
- **<768px:** hamburger → slide-in drawer (`z-index --z-overlay:50`) for all surfaces; public CTA
  persists; filter panels become bottom/side drawers (see portfolio behavior in `10-behaviors.md`).
- Drawer/menu: trap focus, close on Escape and scrim click, restore focus to the trigger.
