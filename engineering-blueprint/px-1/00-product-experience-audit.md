# PX.1 — Product Experience Audit

> **Sprint:** PX.1 · Product Experience (Dashboard Intelligence · Premium UX · Demo
> Data · Light/Dark Theme)
> **Status:** Audit — produced BEFORE any implementation, per the sprint brief.
> **Method:** Full-repo reconstruction (ENGINEERING_CONTEXT §1–22), a live run of the
> Next.js dev server, route + design-system exploration across all four surfaces, and
> DOM/token inspection of the running app. No production code was changed to produce
> this audit.
> **Scope guardrail:** This sprint POLISHES what exists. It does not redesign the
> sidebar, rename modules, change navigation hierarchy, alter the design language, or
> touch any backend/domain/RLS system. The 11 canonical PDFs in `docs/design/source/`
> remain the visual source of truth.

---

## 0. Executive summary

Auxion is architecturally complete and unusually disciplined — a token-only design
system, a signature `SystemMap` instrument, a GSAP preset motion layer, and four
fully-routed surfaces (public, admin command-center, workspace, portal). The gap PX.1
must close is **not** capability — it is **perceived life**. Three findings dominate:

1. **The dashboard reads live Supabase only, with no fallback dataset.** Every
   authenticated read adapter is built per-request against the caller's RLS session
   (`repositories.ts`). With an empty hosted DB — the state for demos, investor
   previews, and this sandbox — the Console, Signals, Business Scan, Activation, and
   the entire workspace/portal render *empty states and error alerts*, not "0
   everywhere" bugs but genuinely no data. This is the single biggest driver of the
   "feels empty" problem, and it is the reason **Demo Mode (Priority 2) is the
   keystone deliverable** — nearly every other priority (Dashboard Intelligence,
   Charts, Activity Timeline, System Map, AI outputs) depends on believable data
   existing to render.

2. **The theme system is 70% built and 0% wired.** `packages/ui/src/tokens/colors.css`
   already defines a *complete* dark palette under `[data-theme="dark"]` with shadow
   parity, and all 43 components consume semantic aliases — so they theme
   automatically the moment an ancestor carries `data-theme`. What is missing is
   purely the **runtime**: no `ThemeProvider`, no toggle, no `prefers-color-scheme`
   ("System") resolution, no persistence, no FOUC-prevention script, and `<html>`
   carries no `data-theme` at all. Priority 13 is therefore high-value and
   low-architectural-risk.

3. **Seven command-center modules are honest `ComingSoon` placeholders** (Insights,
   Recommendations, Approvals, Moves, Measurements, Knowledge, Settings) and several
   nav items are inert "soon" entries. These are intentional and must NOT be faked
   into looking real — but their **empty/coming-soon presentation** can be elevated
   from a bare frame to an educational, on-brand empty state (Priority 9).

Everything else — motion coverage, chart breadth, AI affordances, responsive polish —
is real but uneven, and is catalogued per surface below.

---

## 1. Cross-cutting systems

### 1.1 Theme (Priority 13) — greenfield runtime over a complete token set

| Layer | State | Evidence |
|---|---|---|
| Dark token values | ✅ Complete | `colors.css` `[data-theme="dark"], .bl-theme-dark` overrides every canon token (`--bg:#0B0C0F`, `--surface:#14161B`, `--ink:#ECEDEF`, `--signal:#E8912F`, `--positive:#46B98A`, …) + legacy aliases re-resolved |
| Shadow/elevation parity | ✅ Complete | `effects.css` overrides `--elevation-1…4` under dark |
| Scoped selectors | ✅ Works | `[data-theme]` attr + `.bl-theme-*` class; per-subtree theming already used by `Footer`, `CTASection`, login brand panel via `Section tone="dark"` |
| Component consumption | ✅ Automatic | all components use `var(--surface-card)` / `var(--text-primary)` etc. — no per-component dark CSS needed |
| Global switch on `<html>` | ❌ Missing | `apps/web/src/app/layout.tsx` sets no `data-theme`; app renders `:root` (light) |
| `ThemeProvider` / `useTheme` / toggle | ❌ Missing | none exist; only `MotionProvider` + `ToastProvider` |
| System / `prefers-color-scheme` | ❌ Missing | zero matches repo-wide |
| Persistence | ❌ Missing | no `localStorage` theme key |
| FOUC-prevention inline script | ❌ Missing | no pre-paint `data-theme` set |
| Default-theme doc conflict | ⚠️ Inconsistent | `layout.tsx` comment says "Dark-first"; `colors.css` `:root` = light; ENGINEERING_CONTEXT §7 says "Light-first". Live app = **light**. Must be resolved. |

**Implication:** the sprint's theme work is entirely the runtime layer + resolving the
default. Low risk, high polish payoff. Light must be *intentionally designed*, not an
inverted dark — the current light palette (warm "Living Blueprint" paper `#F3F1EC`) is
already a deliberate design, which is a strong start.

### 1.2 Demo data (Priorities 1 & 2) — the keystone

- **Only data source seam:** `apps/web/src/lib/repositories.ts` (`import "server-only"`),
  the documented single place a data source is named. Reads are request-scoped +
  RLS-scoped; writes go through domain services. Nothing cached.
- **Existing precedent to extend:** `reputationSource()` returns `"placeholder"` when
  `BRIGHTLOOP_DATA_SOURCE=placeholder`, and `createReputationRepository({source:"placeholder"})`
  serves an in-memory dataset for **public** reputation/catalog content only.
  `isServingPlaceholderData()` / `PlaceholderNotice` already exist to flag non-real
  content honestly.
- **Gap:** every *authenticated* reader (dashboard, signals, core-surface, workspace,
  portal, billing, integrations…) has **no** placeholder path — each calls
  `createClient()` (cookie/RLS Supabase) directly with no fallback. On empty DB or read
  error the dashboard shows a `DashboardError` alert; it deliberately does not degrade
  to sample data.
- **Existing seed:** `supabase/seed.sql` is a LOCAL-only demo seed (a few `[DEMO]`
  testimonials + portfolio rows, incl. "The New Greenhouse"), run on `supabase db reset`,
  never pushed to the hosted DB. It does not populate the dashboard's transformation
  tables and is not a runtime demo mode.

**Recommended shape (respects architecture, no RLS bypass, auto-off in prod):** extend
the *same* env-gated `DataSource` pattern to the authenticated read adapters — a
`getDemoDashboardRepository()` / demo read-model source returning a deterministic,
server-only, richly-populated dataset (believable orgs: Onixus, The New Greenhouse,
Acme Construction, Kingston Logistics, Green Horizon) when demo mode is enabled, and
never in production. This is additive, mirrors `reputationSource()`, keeps demo data
out of the browser bundle, and writes nothing to the DB.

### 1.3 Motion (Priority 7) — strong system, uneven adoption

- **System is excellent:** `@brightloop/ui/motion` has a pure `PRESET` catalogue
  (`dashboardEntrance`, `metricReveal`, `pipelineReveal`, `drawer`, `pageTransition`,
  `modal*`, `toast*`), a `MotionProvider`, `useReducedMotion`, and canon curves. Rules
  are correct (transform+opacity only, reduced-motion honored, no ScrollTrigger).
- **Gaps:** no **animated counters** on `MetricCard`/`Stat` (an `AnimatedMetric`
  component exists in motion but adoption is partial); no chart-draw transitions; page
  transitions exist but are not applied uniformly across admin/workspace/portal; no
  skeleton *shimmer* discipline audit; success/confirmation micro-animations absent.
  Adoption, not invention, is the work.

### 1.4 Charts (Priority 8) — two instruments, no trend viz

- **Exists:** `SystemMap` (signature radial instrument) and `IndexGauge` (linear meter).
  Both are token-only, accessible (`role="img"` / `role="meter"`), reduced-motion-aware.
- **Missing entirely:** **no** sparkline, line, area, bar, or donut components (grep
  for `sparkline`/`<canvas>` → nothing). `MetricCard`/`Stat` show a figure + delta
  *text*, never a trend graphic. Revenue Trend, Business Health over time, Lead Funnel,
  Automation Coverage, Signal Distribution etc. have no visual today. This is the
  largest *new-component* need in the sprint — must be built token-only, theme-aware,
  accessible, and SSR-safe (deterministic; no `Math.random` at render).

### 1.5 AI experience (Priority 6) — present in Copilot, absent as per-page affordance

- Copilot is a real surface (`/workspace/copilot`, `loadCopilotBoot`, billing intent).
- But the brief's per-page AI affordances (Signals → "Generate Action Plan", Projects →
  "Delivery Risk Analysis", Clients → "Relationship Summary", Invoices → "Payment
  Prediction", Business Scan → "AI Explanation", etc.) do **not** exist as inline
  entry points. The deterministic AI provider (`createDeterministicAiProvider`) and the
  Phase-A reasoning contracts exist to back believable, non-fabricated demo outputs.

### 1.6 Empty states (Priority 9) — honest but bare

- The app is admirably honest: `ComingSoon`, `EmptyState`, `EmptyWorkspace`,
  `PlaceholderNotice`, and explicit "All clear" / "No activity yet" states already
  exist (dashboard has them). This is a real strength — nothing fakes data.
- **Gap:** most empty states are a title + line, not the brief's *educational* pattern
  (what the module does · why it matters · how to begin · suggested next action · AI
  assist · CTA). Upgrading the shared `EmptyState`/`EmptyWorkspace`/`ComingSoon`
  primitives lifts every surface at once.

### 1.7 Responsive & a11y (Priorities 10 & 11)

- Responsive tokens/utilities exist (`responsive.css`, `.bl-grid`, `OperationalTable`
  collapses to cards, mobile drawer nav). Needs a systematic per-route audit
  (overflow, touch targets ≥44px, table→card fidelity) rather than assumed-good.
- a11y foundation is good (semantic roles on charts, focus ring token, skip-link,
  reduced-motion). Theme work must preserve contrast in *both* palettes; a WCAG AA
  contrast pass on the light theme specifically is warranted.

### 1.8 Performance (Priority 12)

- RSC-first reads, Suspense + skeletons, no client-side data waterfalls observed. Dev
  first-compile is slow (~15s) but that's dev-only. New chart components must be
  memoized and must not re-render on theme toggle beyond the CSS variable swap. Demo
  dataset must be server-only so it never ships to the browser.

---

## 2. Per-surface audit

### 2.1 Public marketing `(public)/` — strongest surface

- **Matches design:** yes — real pages (home, services, packages, portfolio, case
  studies, testimonials, contact, start funnel), canonical components, `PlaceholderNotice`
  where prices/content are still sample.
- **Unfinished / placeholder:** prices on `/packages` & `/services` are placeholder
  (flagged honestly). Real testimonials are pending the CMS (do not seed).
- **Theme:** dark sections (`Footer`, `CTASection`) already use `data-theme="dark"`;
  will need to cooperate with a global toggle (nested theme scopes must still win
  locally where intended).
- **Priority for PX.1:** LOW — mostly polish + ensure theme toggle works pre-auth.

### 2.2 Auth `(auth)/` — clean

- `/login`, `/forgot-password`, `/reset-password` render real forms; login has a dark
  brand panel. Confirmed live (auth wall correctly redirects `/admin/*` → `/login`).
- **PX.1:** ensure the theme toggle is reachable pre-auth and login looks polished in
  both themes; add subtle entrance motion.

### 2.3 Admin command-center `admin/` (Auxion transformation cycle) — the headline surface

| Route | State | PX.1 focus |
|---|---|---|
| `/admin/dashboard` (Console) | ✅ Real, fully built (SystemMap, hero MetricCards, pipeline, attention panel, activity feed, quick-links, empty/error/skeleton states) | **Priority 1 + 4 + 5:** with demo data it becomes the signature screen — animated counters, trend sparklines on cards, richer activity timeline, "why care" copy on each card |
| `/admin/business-scan` | ✅ Real (SystemMap blueprint, baseline IndexGauge, findings table + add form) | AI "Explanation", chart polish, motion |
| `/admin/activation` | ✅ Real (assembly sequence, per-domain activate) | motion, completion animation, empty-state copy |
| `/admin/signals` (+new/detail) | ✅ Real (summary cards, filterable table, detail) | AI "Generate Action Plan", animated counters, signal-distribution chart |
| `/admin/insights` | ⛔ `ComingSoon` (canonical rebuild pending PR #6 — do NOT resurrect) | educational empty state only |
| `/admin/recommendations`, `/approvals`, `/moves`, `/measurements`, `/knowledge`, `/settings` | ⛔ `ComingSoon` placeholders | educational empty states; keep honest |

- **System Map (Priority 3):** the `SystemMap` component is the signature instrument
  and already renders health/lit-state per node with a live-core pulse. The brief wants
  it elevated to *the* signature experience — hover/click interactions, per-node
  tooltips (health, status, completion, activity, connections), and node→module
  navigation. Today it renders no links (router-agnostic) and minimal interaction. This
  is a focused, high-impact enhancement.
- **Agency back-office (real):** Leads, Proposals (+detail), Contracts, Conversations
  (+detail), Clients (+detail), Projects (+detail), Invoices, Portfolio (+new/detail),
  Reviews, Analytics (real, computed from `analytics_events`), Automation. All real,
  all empty without data → **all benefit from demo data + per-page AI affordances +
  chart polish.**

### 2.4 Workspace `workspace/` (premium client experience) — large, real, data-hungry

- Dashboard, Projects, AI Team, Copilot, Automations, Deployments, Runtimes,
  Integrations (+ Marketplace), Executions, Reports, Approvals, Activity, Billing,
  Settings — mostly backed by real read models. This surface is where "premium
  enterprise OS" is won or lost; it is the most data-dependent and therefore most
  reliant on Demo Mode to feel alive.
- **PX.1:** demo data, chart/timeline population, motion adoption, theme parity, empty
  states, and a responsive pass (dense tables).

### 2.5 Portal `portal/` (client portal) — real, focused

- Dashboard, Project, Deliverables (+detail), Proposals, Contracts, Invoices,
  Notifications, Discovery chat; Files/Meetings/Settings are inert "soon".
- **PX.1:** demo data, empty-state education, theme parity, mobile polish (clients are
  likelier on mobile).

---

## 3. Priority-by-priority readiness

| # | Priority | Readiness | Blocking dependency |
|---|---|---|---|
| 1 | Dashboard Intelligence | Structure done; needs data + viz | **Demo Mode (2)** |
| 2 | Demo Dataset | Seam exists (`repositories.ts`); needs demo source for authed readers | — (keystone) |
| 3 | System Map signature | Component exists; needs interaction/tooltips/nav | Demo Mode for health values |
| 4 | Dashboard Cards | Cards exist; need "why care" copy + trend viz | Charts (8), Demo Mode (2) |
| 5 | Activity Timeline | `ActivityTimeline` exists + dashboard feed | Demo Mode (2) |
| 6 | AI Experience | Copilot real; per-page affordances absent | deterministic AI provider (exists) |
| 7 | Motion | System excellent; adoption uneven | — |
| 8 | Charts | Only SystemMap + IndexGauge; no trend viz | **new token-only chart primitives** |
| 9 | Empty States | Honest but bare | upgrade shared primitives |
| 10 | Responsive | Foundation good; needs systematic audit | — |
| 11 | Visual polish | Token-disciplined; needs consistency sweep | — |
| 12 | Performance | Good RSC posture | keep demo data server-only |
| 13 | Light/Dark/System | Tokens complete; runtime 0% | resolve default; build provider/toggle/persistence/FOUC |

---

## 4. Risks & non-negotiables (carried into implementation)

- **Do not fabricate real-looking data as if genuine.** Demo Mode must be clearly
  gated, server-only, off in production, and (where user-facing on real client
  surfaces) labeled via the existing `PlaceholderNotice` pattern. Never seed the
  consented real testimonials into code (they await the Reputation CMS).
- **Do not resurrect PR #6 Insights** — the canonical rebuild is a separate phase;
  `/admin/insights` stays an (upgraded) empty state.
- **No architecture/backend/RLS/domain changes.** PX.1 is presentation + a
  demo-read-source + a theme runtime, all additive.
- **Token-only, always.** New charts/timelines/theme code use `var(--…)` semantic
  tokens; no hardcoded colors; both palettes must be validated.
- **Determinism.** Demo data and any chart geometry must be deterministic (no
  `Math.random`/`Date.now` at render) to stay SSR-safe and test-stable, per the
  domain-package discipline.
- **Sandbox limit is honest:** no Docker/Supabase/live-DB and no authenticated internal
  session here, so authenticated *visual* review of real data runs only on Vercel
  previews. Demo Mode is precisely what makes local + preview visual review possible.

---

## 5. Proposed PX.1 delivery plan (for approval)

PX.1 as briefed spans ~80 routes, 4 surfaces, 13 priorities, a theme runtime, and a
demo-data platform — far larger than one sprint gate. Recommended slicing into
independently-shippable sub-sprints, each ending at the standard gate
(`typecheck lint test build`) + report + stop-for-approval:

- **PX.1a — Theme Runtime.** ThemeProvider + Light/Dark/System toggle (header + profile
  menu + Settings→Appearance) + persistence + FOUC-prevention script + `data-theme` on
  `<html>` + resolve the default + WCAG AA light-theme contrast pass + both-theme
  validation. *Lowest risk, immediately visible, unblocks "polished in both themes".*
- **PX.1b — Demo Mode + Demo Dataset.** Extend the `DataSource` seam to authenticated
  read adapters; deterministic server-only demo dataset (believable orgs) covering
  dashboard/signals/scan/activation/workspace/portal; env + easy toggle; auto-off in
  prod. *Keystone — unblocks 1, 3, 4, 5.*
- **PX.1c — Chart primitives.** Token-only, theme-aware, accessible sparkline/line/
  area/bar/donut + funnel, with motion draw-in. *Unblocks 8 and the card/dashboard viz.*
- **PX.1d — Dashboard Intelligence + System Map + Activity + Cards.** Priorities 1,3,4,5
  on top of b + c.
- **PX.1e — AI affordances.** Per-page AI entry points backed by the deterministic
  provider (6).
- **PX.1f — Motion adoption + Empty states + Responsive + Visual polish.** Priorities
  7,9,10,11,12 sweep.
- **PX.1g — Certification + before/after capture + ENGINEERING_CONTEXT + PX.1 report.**

Screenshots/before-after are captured on Vercel previews per sub-sprint (the sandbox
can render the public + demo-mode surfaces locally but not authenticated real-DB data).

---

*End of audit. Implementation begins only after scope/sequencing is approved.*
