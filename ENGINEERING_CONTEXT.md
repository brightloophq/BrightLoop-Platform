# Auxion — Engineering Context

> Orientation for future AI sessions and new engineers. Factual and concise.
> **Maintenance rule: update this file at the end of every completed sprint**
> (add the sprint to "Completed sprints", adjust "Next planned sprint", revise any
> convention that changed). Last updated: after **Phase D · Sprint D8 (Engineering
> Certification)** — Phase D D1–D7 complete and merged; D8 certifies production
> readiness. Previously: **Phase C · Sprint C3 (Discovery/
> Crawler Runtime)** — the first real, SSRF-guarded website ingress into the pipeline.
>
> **Two work tracks run in parallel.** (A) The **transformation-cycle product**
> (Signals → Insights → …), tracked in §4/§10/§12. (B) The **Business Intelligence
> Engine** (the async scan/reasoning backend): **Phase A** (Sprints 1–12) built it
> as deterministic contracts + pure logic; **Phase B** (Sprint 13A–C) added the
> durable runtime — persistence, repositories, services, and queue orchestration —
> tracked in §13. Sprint numbers are per-track — "Sprint 5" means Signals in track A
> and Discovery/Crawl in track B; always read them with their track.

---

## 1. What this is

**Auxion** is a Business Transformation Operating System — a multi-tenant web app
where an internal team (Auxion staff) runs a structured transformation cycle for
client organizations. The public brand is **Auxion**; internal package names stay
`@brightloop/*`, CSS variables are `--bl-*`, and the `brightloop.co` domain is
intentionally retained. Do **not** "fix" these to say Auxion — the rebrand was
deliberate and scoped to user-facing surfaces only.

The core product concept is the **transformation cycle**:

```
Signal → Insight → Recommendation → Approval → Move → Execution → Measurement → Learning
```

plus cross-cutting entities: Business Health, Transformation Index, Operational
Risk, Knowledge Asset. Signals is the first fully built module (Sprint 5).

---

## 2. Repository layout

Monorepo: **pnpm 9.15.0 workspaces + Turborepo**. The git root
(`BrightLoop-Platform/`) has **no** `package.json`; the workspace root is
**`application/`**. The Product Bible (`product-bible/`, chapters 00–19) and the
Engineering Blueprint (`engineering-blueprint/`) are authoritative product/eng docs.

```
application/
  packages/
    schema/   @brightloop/schema  — SINGLE SOURCE OF TRUTH: roles+capabilities,
              state machines, entities (Zod), status tones, transformation +
              reputation + catalog contracts. Depends on nothing.
    domain/   @brightloop/domain  — service layer + repository PORTS + pure logic
              (capability checks, transition guards, view builders, events).
    data/     @brightloop/data    — repository BINDINGS: Supabase adapters +
              row↔domain mappers. The only place a data source is named.
    db/       @brightloop/db      — Supabase: migrations live in
              application/supabase/migrations; generated types at
              packages/db/generated/database.types.ts (never hand-edit).
    ui/       @brightloop/ui      — design system: tokens (CSS), components,
              and the GSAP motion layer (@brightloop/ui/motion).
  apps/web/   @brightloop/web     — Next.js 15 App Router (React 19) app.
  supabase/   config.toml, migrations/ (28), tests/ (pgTAP), seed.
  scripts/    db-verify.sh, bootstrap-owner.mjs
```

- `schema/domain/data/db` are **built to `dist`** and consumed as compiled output;
  their relative imports use explicit **`.js`** extensions. Turbo `test`/`build`
  have `dependsOn: ["^build"]`, so run cross-package work via `pnpm turbo run …`.
- `ui` is consumed **as source** (Next `transpilePackages`); its relative imports
  are **extensionless** (webpack resolves `.ts`/`.tsx`). Do not add `.js` there.

Stack: Next 15, React 19, TypeScript 5.7, Node 22, Supabase (Postgres 17),
Turborepo, Vitest 2.1, GSAP 3 + @gsap/react.

---

## 3. Architecture: three-layer integrity

Every state change passes three independent layers; none trusts the others:

1. **Capability** (service layer) — `assertCapability(actor, cap)` in
   `@brightloop/domain`. `may(actor, cap)` is the non-throwing UI-gating variant.
2. **Lifecycle guard** — `assertTransition(machine, from, to)` in the service AND
   the Postgres `bl_assert_transition('<machine>','<col>')` `BEFORE UPDATE` trigger,
   validated against the `state_transitions` table (a SQL mirror of `MACHINES`).
3. **RLS** — Postgres row-level security is the real boundary. Helpers:
   `bl_role()`, `bl_client_id()`, `bl_is_internal()`, `bl_is_finance()`, reading
   `auth.jwt() -> app_metadata`. An append-only `transition_log` records audits.

**Rule: never bypass the service to write tables from React/route handlers.**
Reads may query Supabase directly (RLS-scoped), but mutations go through the
domain service so all three layers apply.

### Surfaces, auth, tenancy
One deployable serves four surfaces via route groups + a middleware subdomain
rewrite (`admin.host/x → /admin/x`, `app.host/x → /portal/x`):
- **public** — marketing (anon).
- **admin** (`/admin/*`) — internal roles: `owner`, `admin`, `team_member`.
- **portal** (`/portal/*`) — client roles: `client_admin`, `client_member`.

Auth: `getActor()` (`apps/web/src/lib/auth.ts`) reads **verified** JWT claims via
`supabase.auth.getClaims()` (ES256), returning `Actor { userId, role, clientId }`
(`clientId` null for internal). `requireSurface("admin"|"portal")` guards every
protected layout (redirect if wrong role). Internal-only tables (e.g. `signals`,
`transition_log`) have RLS `using (bl_is_internal())` — clients cannot see them.

Because internal internal pages must live under `/admin/*` (subdomain rewrite),
there is **one** admin shell (`apps/web/src/app/admin/layout.tsx` +
`AppSidebar.tsx`); do not create a parallel shell.

---

## 4. Completed sprints

| Sprint | Outcome |
|---|---|
| **1** | Transformation **schema foundation** — enums, 12 tables, `state_transitions` + guard trigger + `moves_approval_gate`, 16 RLS policies, pgTAP suite. |
| **2** | Transformation **domain layer** — `TransformationService` (capability→guard→approval-gate→audit→event), `TransformationRepository` port, Supabase adapter + mappers. |
| **3** | **Live DB validation harness** — CI `db-verify` job (Supabase CLI + Docker): migrate → pgTAP → RLS → adapter integration tests → generated-type drift check; local `pnpm --filter @brightloop/db db:verify`. Fixed a systemic grant gap (migrations 0028/0029 grant API roles) and regenerated types. |
| **4** | **Dashboard foundation + GSAP motion system** — motion layer in `@brightloop/ui/motion`, typed dashboard read model + adapter, refined `/admin` shell (premium sidebar + mobile drawer), dashboard page, transformation section placeholders. |
| **4.1** | **Dashboard refinement + shared primitives** — centralized motion **preset system**, "operational canvas" (3 zones: Executive Overview → Transformation Loop → Operational Feed), and reusable primitives: `SectionHeader`, `OperationalPanel`, `MetricCard`, `PipelineNode`, `AttentionRow`, `SkeletonBlock`. |
| **5** | **Signals module** — first end-to-end vertical slice (list/create/detail, lifecycle, audit, dashboard reflection). See §10. **Merged to `main` via PR #4 (merge commit `bd20276`, 2026-07-18).** |

### Phase D — Transformation Execution (all merged to `main`)

| Sprint | Outcome | PR / merge |
|---|---|---|
| **D1** | Workspace foundation — seed a transformation workspace from a certified proposal; initiatives + activity; internal-only RLS. | ✅ complete |
| **D2** | Initiative lifecycle — `seeded→planned→active→completed→archived`; optimistic concurrency. | PR #50 |
| **D3+D4** | Execution management — reviews/approvals, tasks, assignments (append-only), dependency graph (cycle-safe). | PR #51 |
| **D5+D6** | Planning & Performance — timelines, milestones, KPIs, DERIVED progress + workspace-health policies, append-only progress snapshots. | PR #52 (`b09b81e`) |
| **D7** | Collaboration — activity feed, internal notifications, subscriptions, mentions, inbox lifecycle, read receipts, unread counts. | PR #53 (`497887c`) |
| **D8** | **Engineering certification & hardening** — architecture/invariant/authorization/tenant/RLS/append-only/migration/concurrency/idempotency/read-model audits + certification test suites (authorization matrix, E2E flows A–E, tenant isolation, concurrency, performance benchmark) + production docs. No new product capability. See `engineering-blueprint/phase-d/CERTIFICATION.md`. | this PR |

Phase D bounded contexts: transformation workspace, initiative lifecycle, execution
management, planning & performance, collaboration. Layering is Schema → Domain
(pure) → Repository Ports → Application Use-Cases → Read Models → Data Adapters →
Database (RLS) → Web UI. Additive migrations only; append-only history via the
`bl_txexec_append_only()` trigger; internal-only capabilities (no client access).

(Prior product work — reputation CMS, leads/clients, delivery, sales, funnel,
conversations, hardening, Auxion rebrand — predates these transformation sprints
and is on `main`.)

**A separate track — the canonical UI migration and the Business Intelligence
Engine — has since landed on `main`:** Phase 0 (PR #8), Phase 1 core surfaces
(PRs #9, #12), **Phase A engine Sprints 1–12 (PRs #13–#18, #20, #21, #23, #25, #26, #27)**,
**Phase B runtime Sprints 13A–C (PRs #29, #30)**, and **Phase C Sprints C1 —
Product API Bridge (PR #32) and C2 — Live Claude Provider Adapter (PR #35)**. These
are detailed in §13; the merge log is §11. (The system architecture handbook —
`docs/architecture/SYSTEM_ARCHITECTURE.md` — landed via PR #34.)

---

## 5. Repository conventions

- **Reads** happen in `async` server components (RSC), querying Supabase directly
  (RLS-scoped) or via typed read adapters. **Writes** happen in `"use server"`
  server actions following: authenticate → resolve tenant from trusted server
  context → `assertCapability` → validate (shared Zod) → call domain service →
  `revalidatePath(...)` → return a typed `ActionResult { ok; error? }` or redirect.
- Per-request data access is created in `apps/web/src/lib/repositories.ts`
  (`import "server-only"`), **never cached** (a memoized client would pin one
  user's session/RLS view). Getters build a request-scoped client each call.
- **No service-role key in browser code.** The cookie client (anon/publishable key
  + session) is the only client-facing path; service role is server-only and rare.
- Admin pages: `export const dynamic = "force-dynamic"`, `export const metadata`.
- **No `loading.tsx`/`error.tsx`.** The pattern is Suspense + a skeleton fallback
  and inline `try/catch` → `<Alert tone="danger">` / `<EmptyState>`.
- URL-driven list state: filters/search/sort/page live in `searchParams`, parsed
  by pure fail-safe parsers (see `lib/portfolio-params.ts`, `signals` query parser)
  — invalid values default, never throw; Back/Forward + shareable URLs work.
- "Coming Soon" future modules are real framed pages (`ComingSoon`), not 404s.
- Icons: string-named via the `Icon` map in `packages/ui` (add new icons there).

---

## 6. Coding standards

- **TypeScript everywhere; no `any`.** Typed inputs/outputs, explicit errors, fail
  loudly (throw with a clear message rather than returning a silent `null`).
- ESLint = `tseslint.configs.recommended`: `no-explicit-any` **on**;
  `consistent-type-imports` **on** (inline `import { type X }`); `no-unused-vars`
  ignores `^_`. `no-unsafe-*` are off (recommended, not strict-type-checked).
- Generated DB types are authoritative; the write adapter uses **one documented**
  `as unknown as SupabaseClient` cast (domain models statuses as `string` while
  generated columns are strict enum literals). **New/read adapters must be fully
  typed** against generated types — no cast, no `any` (see the dashboard and
  signals read adapters).
- Pure domain logic has **no** DB-client dependency; it is unit-testable.
- Prettier is configured (`pnpm format` / `format:check`).

---

## 7. Design system (`@brightloop/ui`)

- **Tokens only** — never hardcode color/spacing/type. CSS vars: colors `--bl-*`
  + scales (`--navy-*`, `--blue-*`, `--slate-*`) and semantic aliases
  (`--bg-base`, `--surface-card`, `--surface-inset`, `--text-primary/secondary/muted`,
  `--border-hairline/default`, `--action-primary`, `--danger/warning/info`);
  spacing `--space-0..10` (4px base); radius `--radius-sm..2xl` (3–10px, sharp);
  type `--fs-*` (Sora display + IBM Plex body/mono); motion `--dur-fast/base/slow`
  (140/240/420ms), `--ease-out`. Imported once: `import "@brightloop/ui/tokens.css"`.
- **Light-first**, dark opt-in via `data-theme="dark"` / `<Section tone="dark">`.
- Components are `Component.tsx` + co-located `Component.module.css` (**CSS Modules**,
  not Tailwind). No `cn`/`clsx` util — compose classes with
  `[...].filter(Boolean).join(" ")`.
- **Design language = "operational canvas":** layered instrument surfaces on a
  toned backdrop, restrained color, controlled density, compact radii, the
  signature connected-rail/loop motif, meaningful (not decorative) elevation.
  Litmus test: *"Would it still look like Auxion with the logo removed?"*
- Reusable operational primitives (reuse before adding new): `SectionHeader`,
  `OperationalPanel`, `MetricCard`, `PipelineNode`, `AttentionRow`, `SkeletonBlock`,
  `OperationalTable`, `FilterBar`, `DetailField`/`DetailGrid`, `ActivityTimeline`,
  `EmptyWorkspace`, `FormSection`, `Toast`/`ToastProvider`/`useToast`, plus
  `Button`, `Input`, `Textarea`, `Alert`, `Badge`, `EmptyState`, `Pagination`.
  Promote page markup to a shared primitive only when genuinely reusable.

---

## 8. Motion system (`@brightloop/ui/motion`)

- GSAP is isolated inside `@brightloop/ui`; the app imports from
  `@brightloop/ui/motion` and **never imports `gsap` directly**.
- `MotionProvider` registers the `@gsap/react` plugin once and publishes the live
  `prefers-reduced-motion` value; every animation uses `useGSAP()` (auto-cleanup).
- **Centralized presets** are the single source of truth for timing:
  `presets.config.ts` (`PRESET`, pure, token-derived, tested) + `presets.ts`
  (builders). Catalogue: `dashboardEntrance`, `metricReveal`, `pipelineReveal`,
  `drawer` (open/close), `pageTransition`, `modalEnter/Exit`, `toastEnter/Exit`.
  **Do not hand-write component timelines** — add a preset if none fits.
- Rules: transform + opacity **only**; respect reduced motion (snap, no shimmer);
  content visible by default (no blank-screen-waiting-for-JS); **no ScrollTrigger**;
  CSS transitions for ordinary hover/focus/color.

---

## 9. Testing & verification

- **Vitest per package** (Node env; the repo does **not** use jsdom/RTL — tests
  target pure logic and extracted functions, not React rendering).
- Test kinds: domain/pure unit tests; shared-schema validation; DB **integration**
  tests gated behind env + a separate config (`test:integration`); **pgTAP**
  (transition guards + RLS/cross-tenant) via `supabase test db`; authorization
  (capability + fail-closed) tests. Do not weaken tests or replace assertions with
  snapshots alone.
- **The gate** (must be green before commit):
  `pnpm turbo run typecheck lint test build` (24 tasks).
- **Live DB verification:** `pnpm --filter @brightloop/db db:verify` (needs Docker +
  Supabase CLI) reproduces the CI `db-verify` job locally.
- **Sandbox limitation:** this dev environment has **no** Docker/Supabase/DB and
  **no** usable authenticated internal session, so live-DB steps and authenticated
  visual review run only in CI / on preview deploys. State this honestly; never
  claim a visual review that did not happen.

---

## 10. Signals module (Sprint 5) — the reference vertical slice

Canonical **`signals`** columns (no migration was needed): `id, client_id, title,
detail, status, source_ref, evidence (jsonb EvidenceItem[]), created_by,
created_at`. Lifecycle machine `signal`: **detected → validated → prioritized →
archived** (plus detected/validated → archived; archived terminal). **No** columns
for priority/severity/category/assignee/`updated_at` — priority is expressed by the
*Prioritized* state; ownership is by role (Product Bible); audit/history lives in
`transition_log`. Capabilities reused: `transformation.read` (read),
`transformation.signals.write` (create + transition).

Shape to copy for the next transformation module:
- **Domain** (`packages/domain/src/transformation/signals.ts`): fail-safe URL query
  parser, `buildSignalListView` / `buildSignalDetailView`, machine-derived
  available actions, read/write authorization helpers — all pure + tested.
- **Data** (`packages/data/src/transformation/signals.read.ts`): fully-typed read
  adapter — bounded `list` (filter/search/sort + `range` + exact count, selected
  columns), `getById`, `listTransitions`, `summary` (head counts), org lookup; no
  N+1 (names resolved via `.in()`).
- **Writes**: reuse `TransformationService.createSignal` / `transitionSignal`.
- **Routes**: `/admin/signals` (list), `/new` (create), `/[signalId]` (detail) — the
  nav item now points to the real module; other placeholders preserved.
- **Dashboard integration**: mutations `revalidatePath('/admin/dashboard')`; the
  dashboard read model is unchanged (no duplicated business logic).
- **Known limitation**: assignment is a scoped gap (no assignee column) — reported,
  not invented.

---

## 11. Branching, CI, and merge process

- **One sprint per branch.** Create `sprint/NN-name` off synchronized
  `origin/main`. **Never commit to `main` directly.**
- Sprint gate discipline: implement → run the full gate → produce a report → **stop
  and wait for explicit commit instruction** (do not auto-commit/push/PR).
- Commit messages end with the Co-Authored-By trailer. PR bodies end with the
  Claude Code generated line.
- **CI** (`.github/workflows/ci.yml`) triggers on push to `main` and PRs to `main`
  (a plain feature-branch push does **not** trigger CI — open a PR). Jobs:
  1. `verify` — typecheck · lint · test · build.
  2. `db-verify` — migrate · pgTAP · RLS · adapter integration · type-drift
     (ephemeral Supabase via Docker).
  3. `secret-scan` — gitleaks.
  Preview deploys: **Vercel** on each PR (sole deploy provider — production from
  `main`, previews per PR).
- **Merge**: non-fast-forward **merge commit** (`gh pr merge <n> --merge`), matching
  Sprints 3–4.1. After merge: sync `main`, delete local + remote branch, prune.
- **Merge log (chronological, all on `main`):**
  - Transformation track: Sprint 3 (#1), Sprint 4 (#2), Sprint 4.1 (#3),
    **Sprint 5 Signals (#4, `bd20276`)**.
  - Canonical UI + core surfaces: Phase 0 design-system (#8, `7460efa`),
    Phase 1A/B/C core surfaces (#9, `43e0865`), Phase 1 visual-fidelity (#12, `6453bd4`).
  - **Business Intelligence Engine — Phase A:** Sprint 1 engine skeleton (#13,
    `8c79426`), Sprint 2 provider registry + routing (#14, `38d4c9f`), Sprint 3
    Evidence Engine (#15, `3f30ba9`), Sprint 4 Intelligence Graph (#16, `932d5e2`),
    Sprint 5 Discovery/Crawl orchestration (#17, `a7167e4`), Sprint 6 AI Reasoning
    Orchestrator (#18, `dd4b3aa`), Sprint 7 AI Provider Execution Layer (#20, `c615f76`),
    Sprint 8 End-to-End Business Intelligence Pipeline (#21, `05e1b0a`), Sprint 9
    Recommendation Engine & Decision Science (#23, `331ac37`), Sprint 10 Competitor
    Intelligence Framework (#25, `81538cd`), Sprint 11 Proposal Intelligence Engine
    (#26, `df92f8c`).
- **Still open:** PR #6 (Insights canonical rebuild — pending, see §13); PR #5 (a
  Sprint 5 docs-only record) is **superseded by this update** and can be closed.
- **Note on the auto-mode merge classifier:** in this environment `gh pr merge` is
  sometimes blocked by the permission classifier; when that happens the user merges
  from the PR page (the code + CI are already green).

---

## 12. Current state & what's next (both tracks)

**Track A — transformation-cycle product.** Signals (§10) is the one complete
vertical slice. **Insights** is the next stage (Signal → Insight): build it mirroring
Signals — reuse `TransformationService` (`createInsight` / `transitionInsight`;
machine `insight`: generated → endorsed / dismissed), a typed insights read adapter,
list/create/detail routes over the `/admin/insights` placeholder, shared operational
primitives + motion presets; an Insight links to an existing Signal + Evidence; no
schema change expected (the `insights` table + machine exist from track-A Sprint 1) —
verify against the canonical model first. **Caveat:** PR #6 opened an early Insights
build but is held for a **canonical rebuild against `10-Insights.pdf`** (a richer
AI-native case file); reconcile to that PDF, don't resurrect the old build (§13).
Subsequent A stages: Recommendations → Approvals (gate already enforced) → Moves →
Execution → Measurement → Learning.

**Track B — Business Intelligence Engine.** **Phase roadmap:**

- **Phase A — deterministic intelligence foundation ✅** (Sprints 1–12, §13)
- **Phase B — durable runtime foundation ✅** (Sprint 13A–C, §13)
- **Phase C — productization** (exposing the engine to the product):
  - **C1 Product API Bridge ✅** (the application boundary, §13)
  - **C2 Live Claude Provider Adapter ✅** (the first production provider, §13)
  - **C2.1 Controlled Runtime Driver ✅** (the one-turn execution seam, §13)
  - **C3 Discovery/Crawler Runtime ✅** (the first real website ingress, §13)
  - C4 Internal Prospect Scanner ⏭
  - C5 Report & Proposal Rendering
  - C6 Client Portal Integration

**Phase A sprints (all merged, §13):**

- Sprint 1 ✅ Engine Skeleton · Sprint 2 ✅ Provider Registry & Routing ·
  Sprint 3 ✅ Evidence Engine & Confidence Model · Sprint 4 ✅ BI Graph ·
  Sprint 5 ✅ Discovery & Crawl Orchestration · Sprint 6 ✅ AI Reasoning Orchestrator ·
  Sprint 7 ✅ AI Provider Execution Layer · Sprint 8 ✅ End-to-End BI Pipeline ·
  Sprint 9 ✅ Recommendation Engine & Decision Science ·
  Sprint 10 ✅ Competitor Intelligence Framework · Sprint 11 ✅ Proposal Intelligence
  Engine · Sprint 12 ✅ Report & Narrative Engine

**Phase B sprints (all merged, §13):** Sprint 13A ✅ Runtime Persistence · Sprint 13B
✅ Repository Ports & Typed Adapters · Sprint 13C ✅ Runtime Services & Queue
Orchestration.

**Phase A is deterministic contracts + pure logic** — no real I/O: no live model
call, no production provider SDK, no crawler runtime, no browser automation. **Phase
B makes runs durable** — persistence, RLS, an atomic Postgres job queue, and the
services/coordinator that drive the 13-stage pipeline — but still calls no provider
and runs no worker daemon: the queue is Postgres and a caller drives one turn at a
time. Everything remains deterministic and testable without a network.

**Deferred to Phase C (in no fixed order):**
1. **Live provider adapters** — real vendor implementations of the Sprint-7
   `ReasoningProviderAdapter` seam, replacing the in-memory test adapter.
2. **Crawler + discovery runtime** — real fetching behind the Sprint-5 contracts,
   with the SSRF/robots guards already specified. Competitor discovery (Sprint 10)
   defines its inputs but likewise does not execute.
3. **Service pricing** — Sprint 9 delivered the recommendation *mathematics* and
   Sprint 11 the proposal *structure*, but **pricing itself is still deferred**:
   `effort`/budget stay abstract units, `InvestmentStructureInputs` carries only the
   inputs a future pricing engine will consume, and financial EV/ROI are reported
   unavailable rather than estimated.
4. **Rendering, export & signature** — the internal intelligence report,
   DecisionBrief, and ProposalArtifact are **data contracts only**. PDF generation,
   client-facing UI, contracts, and e-signature integration are all unbuilt.
5. **Operator UI over the runtime** — the API bridge now exists (C1, §13): eight
   `/api/scans` route handlers drive `RuntimeCoordinator` through the
   `@brightloop/application` boundary. What remains is the UI itself — components,
   pages, and client-side wiring over these endpoints.

**Runtime + persistence is no longer deferred — Phase B built it (§13). The
application boundary is no longer deferred — C1 built it (§13).**

Whichever is chosen, the pure contracts stay authoritative and the layers are
extended, never rewritten.

---

## 13. Canonical design system (Auxion) — binding UI specification

The **11 PDFs in `docs/design/source/`** (00-Design-System, 08-Auxion-DNA "source
of truth", 09-Rebrand-Migration-Handoff "for engineering", + the eight surfaces)
are the **binding canonical visual + UX specification**. When code conflicts with a
PDF, the PDF wins. Do **not** infer UI from prior BrightLoop implementations.

**Adapt-first policy (governs all UI migration):** preserve the engineering
foundation (repositories, domain services, repository ports, RLS, migrations,
pgTAP, tests, server actions, permissions/capabilities, events, routing, CI,
package structure). Adapt *presentation* and shared UI infrastructure; extend
rather than rewrite; replace only what a PDF explicitly redefines. Internal
identifiers (`@brightloop/*`, `--bl-*`, `brightloop.co`) are intentionally
retained — only the **visible** identity is Auxion.

**Phase 0 — canonical design-system migration — MERGED to `main` via PR #8
(merge commit `7460efa`).**

**Phase 1 — core surfaces (Business Scan, Activation, Console)** on branch
`implementation/phase-1-core-surfaces`. Human/system-entered data; Auxiliary AI
engine deferred. Additive schema only, on the existing migration/RLS/pgTAP/
generated-type/repository/domain-service/capability patterns. Routes:
`/admin/business-scan`, `/admin/activation`, `/admin/dashboard` (visible term
"Console").

- **Phase 1A — COMPLETE** (draft PR #9): additive `business_scans`/
  `business_domains`/`scan_findings` migration + internal-only RLS + pgTAP;
  `domains.ts` contracts (7-domain taxonomy) + capabilities; generated types in
  sync (committed from the CI `generated-db-types` artifact — CI green, drift 0).
  **Docker-less type regen mechanism:** push → CI `gen:types:local` uploads the
  Supabase-generated file as the `generated-db-types` artifact → download +
  commit (never hand-authored).
- **Phase 1B — COMPLETE** (committed, PR #9 CI-green): `CoreSurfaceService` +
  fully-typed `SupabaseCoreSurfaceRepository` adapter (no cast — z.enum contracts
  match the pg enums), pure read models (`buildSystemMapView` /
  `buildBusinessScanView` / `buildActivationView`), the shared **`SystemMap`** UI
  primitive (7 nodes + AUX core + Index gauge, token-only, theme-parity,
  reduced-motion), and the **Console** terminology reconcile over
  `/admin/dashboard` (visible label/title only; route + internal identifiers
  unchanged).
- **Phase 1C — IMPLEMENTED** (uncommitted; **PR #9 still draft pending preview
  review**): `/admin/business-scan` (Diagnose workspace — System Map, baseline
  Index, findings ledger, gap count, states + `startScan`/`addFinding` server
  actions), `/admin/activation` (assembly sequence, live/planned, completion +
  `activateDomain` action), the live **System Map on the Console** (organization +
  portfolio scope), and Business Scan + Activation nav items (capability-gated).
  No browser-direct DB writes.
- **Phase 1D — canonical visual-fidelity pass:** §NN section headers
  (`SectionRule`), state heroes (*Diagnosed.* / *Operating.*), unified instrument
  cards (System Map + `IndexGauge`), 2-column assembly, mono ledger cells across
  Console / Business Scan / Activation. Presentation only — the primitives (Badge
  neutral-pill, `SystemMap`, tokens) were already canonical from Phase 0.

### Business Intelligence Engine — Phase A build (Sprints 1–12, all merged)

The Business Intelligence Scan/Reasoning backend is an **asynchronous, provider-
pluggable** engine. **Phase A built it out as deterministic CONTRACTS + pure logic
across twelve sprints (PRs #13–#18, #20, #21, #23, #25, #26, #27)** — Sprint 8 wired every layer
into one end-to-end pipeline, Sprint 9 added the decision-science layer that scores
and ranks its output, and Sprint 12 the audience-scoped Report & Narrative Engine.
What still does **not** exist in Phase A: any crawler runtime, live LLM/model call,
benchmark API call, background worker, production provider SDK, or billing — every
module takes a supplied `now` and is unit-testable without I/O (the pipeline runs on
a deterministic in-memory test adapter plus a discovery/evidence fixture).
**Persistence + queue arrived in Phase B (below).**
Canonical specs: **PDF 26** (`docs/design/source/26-Business-Intelligence-Scan.pdf`
— surface model: 3 surfaces, 15 screens, 5 roles, 9 scan stages) and **PDF 27**
(`27-Business-Scan-Engine.pdf` — the engine's **8 layers / 13-stage pipeline / 6
reasoning stages / 4 evidence states / 6-factor confidence**), plus the AIS-001..006
subsystem specs. See `docs/design/scan-engine-architecture.md`,
`engine-27-architecture.md`, and `scan-engine-roadmap.md`.

**Phase A sprints (each = a `@brightloop/schema` contract module + a pure
`@brightloop/domain/scan-engine/*` logic module + deterministic tests):**

| Sprint | PR | Schema | Domain | What it adds |
|---|---|---|---|---|
| **1** | #13 | `engine.ts` | `scan-engine/*` skeleton | PDF-27 engine skeleton: 13-stage pipeline, 6 reasoning stages, evidence states, Index dimensions, the `ReasoningEngine`/confidence seam (geometric-mean confidence — any near-zero factor caps it). |
| **2** | #14 | `provider-registry.ts` | `routing/*` | Descriptor-based provider registry, health model, circuit breaker, cost model, and the pure cost-aware `route()` policy (capability/context/region/health/latency/budget checks → deterministic fallback chain + structured rationale). No vendor named. |
| **3** | #15 | `evidence.ts` | `evidence/*` | Canonical Evidence Engine: `EngineEvidenceItem` (freshness/reliability/provenance/confidence/hash), bundle, coverage, conflict detection, 6-factor confidence, content-hash checksums. |
| **4** | #16 | `graph.ts` | `graph/*` | Business Intelligence Graph: nodes/edges, assembly from evidence, dedupe, traversal, filters, snapshot + `graphChecksum`, and graph events. |
| **5** | #17 | `discovery.ts` | `discovery/*`, `crawler/*` | Discovery + Crawl orchestration contracts: plan/resolve, robots + SSRF security (pure regex URL parser — the domain package is **Node-free**), session/state machine (namespaced `discoveryStateMachine`). |
| **6** | #18 | `reasoning.ts` | `reasoning/*` | **AI Reasoning Orchestrator**: job model + state machine, 6 stage specs, 10 grounding/hallucination guards, routing integration, retry/fallback, multi-pass consensus, result provenance, `reasoning.*` events. No live model execution; no hidden chain-of-thought. |
| **7** | #20 | `execution.ts` | `execution/*` | **AI Provider Execution Layer** (merge `c615f76`): execution request/response contracts, the provider adapter boundary (opaque ids, capability/health/token-estimate/execute), structured-output validation with grounding enforcement (invalid output never promoted), retry + ordered fallback, usage + cost accounting, cancellation + timeout + deadline, `provider.*` execution events, and a deterministic in-memory test adapter (test only). 28 new tests. No vendor SDK; no hidden chain-of-thought. |
| **8** | #21 | `pipeline.ts` | `pipeline-run/*` | **End-to-End BI Pipeline** (merge `05e1b0a`): the run model (14 statuses) + 13 orchestration stages with a hard artifact-dependency gate; artifact registry with deterministic FNV-1a checksums + lineage; checkpoint / resume / downstream invalidation; 11 structured failure kinds (no silent fallthrough); scan → stage → reasoning-job budget propagation; computed finding synthesis (validated claims only); evidence-linked recommendation candidates (**ranking math + pricing deferred**); the Internal Intelligence Report contract; `pipeline.*` events; and the staged runner. 34 new tests. Purely additive (+1993/−0). |
| **9** | #23 | `recommendation.ts` | `decision-science/*` | **Recommendation Engine & Decision Science** (this update, merge `331ac37`, AIS-003): the canonical `EngineRecommendation` entity; 12 normalized scoring factors each declaring its missing-data treatment; risk-adjusted expected value (`EV = p·I − (1−p)·L`, confidence- and time-adjusted; **ROI only as a band, withheld when cost is unknown — never fabricated**); the AIS-003 priority formula `π = C·(Σw·x)·U/(E+ε)` with penalties, weight redistribution for unavailable criteria, and a critical-risk floor (withheld for inferred-only evidence); a recommendation-specific dependency DAG; deterministic 7-key ranking with a stable id tie-break; greedy-knapsack portfolio selection; six scenarios; ±δ sensitivity (no Monte Carlo); the data-only `DecisionBrief`; and a pipeline stage writing **new** artifacts with lineage preserved. 50 new tests (incl. the AIS-003 §08 worked example). |
| **10** | #25 | `competitor.ts` | `competitor-intelligence/*` | **Competitor Intelligence Framework** (merge `81538cd`, AIS-005): canonical `EngineCompetitorCandidate` (6 statuses); identity validation + false-positive prevention (14 issue kinds — duplicate, alias, parent/subsidiary, franchise, directory, marketplace, supplier, inactive, category, regional); similarity/relevance scoring (`Sim(c) = Σ wk·simk`, `Rank(c) = Sim(c)·C(c)`, weight redistributed for unavailable axes); deterministic **top-10 ranking** with stable id tie-break; benchmark normalization (higher/lower/categorical/ordinal/binary, median, percentile, winsorization); the four **evidence-basis labels** with weaker-side confidence capping; competitive gap analysis (deficit/parity/advantage/**unknown**); market-position model gating "market leader" claims on coverage + set quality; opportunity/threat outputs; graph + decision-science integration; competitor-set confidence; snapshots + changesets. **The two inviolable rules — never fabricate a competitor, never fabricate a benchmark — are enforced, not assumed.** 52 new tests. |
| **11** | #26 | `proposal.ts` | `proposal-intelligence/*` | **Proposal Intelligence Engine** (this update, merge `df92f8c`, AIS-004): proposal request (**budget never inferred**) and strategy whose every statement must trace to a finding, recommendation, or competitor evidence — untraceable statements are rejected, not published; **evidence-backed scope** (work requires a finding AND evidence); deliverables; phases cut along the dependency DAG with a milestone DAG (topological order, cycle + blocked detection); success metrics (unavailable baseline stays unavailable; **no fabricated ROI**); assumptions/risks/exclusions with no hidden caveats; **investment structure INPUTS only** (no price, rate, or total); four nested deterministic option packages; **verified + approved proof only**; the data-only `ProposalArtifact` with a content-addressed checksum; **immutable versions with approval reset on material change**; pipeline integration preserving lineage. 48 new tests. |
| **12** | #27 | `narrative.ts` | `scan-engine/narrative/*` | **Report & Narrative Engine** (merge from PR #27, PDF-27 §16/§17): audience/tone policy and the six narrative builders (internal operator, executive summary, client diagnosis, board summary, public preview, proposal narrative); claim validation + safety guards (**no narrative claim without evidence**, no hidden chain-of-thought); citations + confidence language; **redaction runs BEFORE the length budget** so forbidden public sections are locked, not silently dropped; the checksummed `NarrativeArtifact`; **immutable versions with approval reset on material change**; pipeline lineage. 49 new tests. |

**Domain-package constraint (learned in Sprints 5–6):** `@brightloop/domain` is
**Node-free** (no `@types/node`) — no `node:*` imports and no `URL` global; use pure
regex parsers and `hashContent` (FNV-1a over canonical JSON) for checksums. Keep pure
functions deterministic by taking `now` as a parameter (no clock). When a new export
collides with an existing barrel symbol, rename with a prefix (e.g.
`EngineEvidenceItem`, `BuildResultProvenanceInput`) or namespace the barrel
(`export * as reasoningEvents`).

### Business Intelligence Engine — Phase B build (Runtime, Sprint 13A–C, all merged)

Phase B turns the Phase-A pure engine into a **durable runtime**: the pipeline can
now be persisted, resumed after a crash, and coordinated through services and a
Postgres-backed job queue — while every Phase-A decision (stage graph, transitions,
retry policy, checksums) stays authoritative and is **consulted, never restated**.
Still no live provider call, no worker daemon, no hosted queue: Postgres *is* the
queue, and a caller drives one worker turn at a time. Canonical specs: PDF 27 plus
AIS-001..006 (AIS-006 *Continuous Monitoring* binds the runtime toward immutable
snapshots, an append-only timeline and per-account isolation — its monitor/alert
surface has no tables yet and is Phase C).

| Sprint | PR (merge) | Layer | What it adds |
|---|---|---|---|
| **13A** | #29 (bundled) | schema + migration | Runtime **contracts** (`schema/runtime.ts`) and **13 additive tables** (`intelligence_runs`, `_stages`, `_checkpoints`, `_artifacts`, `reasoning_jobs`, `provider_attempts`, `intelligence_findings`, `_recommendations`, `competitor_snapshots`, `proposal_versions`, `narrative_versions`, `runtime_events`, `job_queue`) with 10 `runtime_*` enums; **RLS** (internal-only via `bl_is_internal()`) + explicit grants; **pgTAP**; regenerated **generated types**; **idempotency** foundations (every write carries an `idempotency_key`); **queue + lease** schema; **append-only `runtime_events`** (UPDATE/DELETE revoked + immutability trigger). |
| **13B** | #29 (`4ed86dd`) | ports + adapter | **13 narrow repository interfaces** composed into `RuntimeRepository`; the **typed Supabase adapter** (`data/runtime/adapter.ts`, row types derived from generated types — no `any`, no hand-authored DB types); **atomic queue leasing** via `bl_lease_next_job` (SECURITY INVOKER, single `UPDATE … FOR UPDATE SKIP LOCKED`); the **replay/conflict result model** (`RuntimeResult` — no raw DB error crosses the boundary; same key + same payload → `replayed`, changed payload → `conflict`); **20 live integration tests**; **version lineage** (`supersedesId`); findings/recommendations/snapshots **persistence**; **generated-type drift zero**. |
| **13C** | #30 (`a4441537`) | services + orchestration | **12 runtime services** (one aggregate each, narrow deps); the **`RuntimeExecutionEngine`** (how one stage executes — preflight → recovery → gate → work → artifact → checkpoint; **never touches the queue**); the **`RuntimeCoordinator`** (run lifecycle + queue orchestration + retry disposition); **checkpoint recovery** (resume from last valid checkpoint; completed stages skipped, never re-run); **artifact immutability** (no update path; changed content at a version → `conflict`); **append-only event flow** (services emit, repos persist, nothing writes SQL); **13 read-model projections**; the **`InMemoryRuntimeRepository`** double (mirrors adapter semantics exactly); **53 deterministic service tests** + **7 live coordinator integration tests**; `docs/engineering/runtime-sequences.md` (10 sequence diagrams). |

**Three defects the live-Postgres CI caught that the in-memory double had hidden**
(the reason both suites exist — a double can only confirm it agrees with itself):

1. **Cross-test tenant contamination.** The live integration tests shared one client,
   and a worker is generic (`runOnce` leases *any* eligible job), so tests drained one
   another's queue work. The "contention" failure was 5 workers taking 3 *different*
   jobs, not a `SKIP LOCKED` breach. Fix: each test provisions its own tenant and
   scopes its leases; `runOnce` gained an opt-in `clientId`.
2. **Unstable stage-status ordering.** `stageStatusView` picked the latest row per
   stage by `created_at` alone; a stage's rows land in the same millisecond, and V8's
   stable sort masked the tie in-memory while Postgres returned ties arbitrarily. Fix:
   order by `(created_at, attempt, lifecycle rank)`.
3. **False replay success (the serious one).** `intelligence_run_stages` is
   `unique (run_id, stage, attempt)` — one row per attempt holding its *outcome*, not
   a transition log. `PipelineService` wrote `running` then `completed` for one
   attempt; the collision re-read on a fingerprint that **excludes status**, matched,
   and returned `ok("replayed", runningRow)`. So `completeStage` reported success while
   all 13 stages sat at `running` forever, despite the run completing and every
   checkpoint landing. Fix below.

**Runtime invariants (the final rules — do not "simplify" these away):**

- **`intelligence_run_stages` stores ONE terminal row per attempt**, carrying that
  attempt's outcome. It is not an append-only transition log.
- **Stage-start is represented in the append-only `runtime_events` log**, not by a
  stage row. `beginStage` writes no row; the row is written once by the terminal
  transition, and its idempotency key drops the status suffix to match the table's
  own uniqueness rule.
- **The in-memory double's stage fingerprint excludes status too** — a double stricter
  than production hides exactly the mismatch it exists to catch.
- **Completed artifacts persist BEFORE checkpoints** — a checkpoint must never
  reference an artifact that does not exist.
- **Blocked jobs release WITHOUT consuming an attempt** — unmet dependencies are not a
  failed try; charging one would eventually dead-letter recoverable work.
- **`RuntimeExecutionEngine` owns one-stage execution; `RuntimeCoordinator` owns run
  and queue orchestration.** Every multi-service sequence lives in one of those two
  files and nowhere else — orchestration never leaks into repositories or services.
- **Deduplication is structural, not procedural** — every idempotency key is a pure
  function of natural identity, so a crash-and-retry recomputes the same key and the
  repository replays. No dedupe table, no lock.

### Business Intelligence Engine — Phase C build (Productization)

Phase C exposes the runtime to the product, one thin layer at a time. The engine
and runtime stay authoritative; C sprints wrap them, never rewrite them.

**C1 — Product API Bridge (merged, PR #32, merge commit `4bb1ca53`).** The
application boundary between the web app and the intelligence runtime:

```
Browser → Route Handler → @brightloop/application → RuntimeCoordinator
        → RuntimeExecutionEngine → Repositories → DB
```

- **New package `@brightloop/application`** — the thin orchestration layer,
  depending only on `@brightloop/domain` + `@brightloop/schema`. Knows no HTTP,
  React, or Supabase Auth. A use-case receives an `AppContext` (runtime services
  bound to the caller's RLS session, plus the actor) and typed input, and returns
  a DTO or throws a canonical `ApplicationError`.
- **Nine scan use-cases**, one file each, no shared god-service:
  `create-scan · cancel-scan · retry-scan · get-scan · list-scans · timeline ·
  report · proposal · narrative` (+ a `shared.ts` load-and-authorize helper).
- **DTO boundary** — `toScanDTO` is the ONLY `RuntimeRun → wire` bridge. DTOs carry
  status/progress/stage/timestamps/ids/metadata/summary and nothing else; tests
  assert no `idempotencyKey`/`checksum`/`cancelled`/DB fields and no raw runtime
  events leak.
- **Canonical application errors** (9): `not_found` (404), `forbidden` (403),
  `conflict`/`already_running`/`already_completed`/`cancelled`/`retry_unavailable`
  (409), `validation` (422), `runtime_unavailable` (503). Only `ApplicationError#
  toBody` is ever serialized — no SQLSTATE, message, or stack crosses the boundary.
- **Authorization + ownership** — `authorize(actor, capability, targetClientId)`
  uses the domain capability matrix (`may`); writes need `transformation.scan.write`,
  reads `transformation.read` (both internal-only). Ownership is checked against the
  LOADED run's `clientId`, so a caller can never assert ownership of an id it does
  not own; RLS remains the final boundary.
- **Input validation** — every endpoint validates id format, ISO timestamps, object
  shape and enum values BEFORE the runtime; failures are `ValidationError` (422).
- **Runtime → application error mapping** — one `unwrap` funnel reads only the stable
  `RuntimeErr.code` (never `detail`), with per-use-case overrides for ambiguous codes
  (`terminal_state` → AlreadyCompleted for cancel, RetryUnavailable for retry).
- **Eight `/api/scans` route handlers** (`apps/web/src/app/api/scans/`), thin over
  `lib/runtime-api.ts` (the HTTP↔application seam): `GET/POST /api/scans`,
  `GET /api/scans/:id`, `POST /:id/{cancel,retry}`, `GET /:id/{timeline,report,
  proposal,narrative}`. Timeline/report/proposal/narrative are read endpoints
  returning already-transformed JSON — no rendering, no PDF.
- **Additive runtime primitives** (additive only — no schema, migration, or RLS
  change): `IntelligenceRunRepository.listRuns`, `JobQueueRepository.requeueJob`,
  `RuntimeCoordinator.retryRun` (reuses `resumePoint` recovery), plus the two thin
  service-layer conduits that surface the repo primitives through the service
  boundary — `RunService.list` and `QueueService.requeue`. Nothing else was added to
  Phase B.
- **47 new tests** (application unit 26 · web route integration 17 · domain 4);
  **919 total** workspace tests. db-verify green, pgTAP **133** passing,
  generated-type drift **zero**.

**C1 rules (do not regress):**

- **Routes stay thin** — a handler resolves the actor, builds an `AppContext`, calls
  ONE use-case, and serializes. No logic in the route.
- **Routes never call repositories directly** — they call use-cases; use-cases call
  runtime services. The browser never reaches a repository.
- **Browser DTOs never expose domain entities or database rows** — only the DTO
  shapes cross outward.
- **Authorization happens against the loaded run's `clientId`** — load first, then
  authorize on the row, never on the request.
- **Failed terminal runs are NOT resurrected** — a deadline-`failed` run is terminal;
  retry returns `retry_unavailable` ("start a new scan").
- **Stuck in-flight runs MAY be re-driven from the last valid checkpoint** — retry
  resets a dead-lettered stage's job and resumes; completed stages are skipped.
- **No live provider or crawler is wired yet** — a created scan enqueues its first
  stage and waits; the live provider arrives in C2, the crawler in C3.

**C2 — Live Claude Provider Adapter (merged, PR #35, merge commit `86b76bc8`).**
The first production `ReasoningProviderAdapter`: it lets one reasoning job execute
through the existing routing → validation → accounting → persistence stack against
the real Anthropic API, while the engine, runtime, and application layers stay
vendor-agnostic. **Transport and normalization only — no business logic.**

- **New package `@brightloop/providers`** — the ONLY workspace package that imports
  a vendor AI SDK (the official `@anthropic-ai/sdk`, pinned). Server-only; depends
  only on `@brightloop/domain` + `@brightloop/schema`. All SDK types are contained
  in `transport.ts`; no SDK type reaches domain/application/data.
- **`AnthropicReasoningProviderAdapter`** implements the Sprint-7 seam exactly
  (`capabilities`/`supportsStructuredOutput`/`healthCheck`/`estimateTokens`/
  `execute`) with an opaque provider id (`anthropic-primary`).
- **Environment-driven model selection** — `AUXION_ANTHROPIC_MODEL` controls the
  model (falling back to `claude-opus-4-8`); env always wins, no hardcoded default
  overrides configuration.
- **Two kill switches, disabled by default** — `AUXION_LIVE_AI_ENABLED` (global) +
  `AUXION_ANTHROPIC_ENABLED` (provider). A disabled provider is never registered
  and, defensively, makes no outbound call if asked to execute. A missing key is
  safe while disabled and fails clearly (no secret in the message) only when
  enabled.
- **JSON-only structured-output translation** — the prompt requires a single JSON
  object, the output-contract id, explicit citations and limitations; bans
  fabricated metrics/competitors/benchmarks and unavailable-source claims; requests
  no chain-of-thought/scratchpad; business content is fenced as DATA (prompt-
  injection defence).
- **Response normalization** — parses the JSON body into an untrusted object, maps
  `stop_reason` → `FinishReason`, passes usage through; the Sprint-7 orchestrator
  does all grounding/citation/schema validation. Malformed JSON is a `validation`
  failure — rejected, never promoted.
- **Safe `rawResponseRef`** — a pointer (`anthropic:<providerId>:<requestId>`),
  never raw content. Raw model output is structurally unstorable.
- **Stable provider error classification** — every transport category maps to a
  `ReasoningFailureKind` + disposition (retryable/fallback/fatal/cancellation/
  budget); no raw SDK error or secret crosses the boundary.
- **Timeout and cancellation** — one `AbortController`, first terminal source wins
  (user-cancel → `cancelled`, never retried; timeout → `timeout`, retryable;
  deadline → cancelled); timers cleared in `finally`, no orphaned promise.
- **Actual/estimated usage** — actual usage → `estimated:false`; omitted usage →
  the existing estimated fallback. No pricing engine added.
- **Server-only registration** — `buildProviderRegistry` at the composition root
  (`apps/web/src/lib/providers.ts`, `import "server-only"`) includes the adapter
  only when enabled and coexists with the in-memory test double.
- **Controlled reasoning execution path** — `runControlledReasoning` drives one
  job through `executeReasoningJob` + Phase-B runtime persistence. Server-only, not
  a public endpoint, not a worker loop.
- **33 provider tests** (fake transport, no SDK/network); **952 total** workspace
  tests. The live test (`adapter.live.test.ts`) is gated on
  `AUXION_RUN_LIVE_PROVIDER_TESTS=true` and excluded from the default suite — CI
  spent **no live API credit** (0 `api.anthropic.com` calls).

**C2 rules (do not regress):**

- **The provider adapter performs transport and normalization only** — no
  grounding, scoring, or business logic; that stays in the Phase-A orchestrator.
- **Domain logic remains provider-neutral** — the vendor is an opaque id behind an
  interface; the SDK is confined to `@brightloop/providers/transport.ts`.
- **Live AI stays disabled by default** — both kill switches default off.
- **Model selection is configuration-driven** — via `AUXION_ANTHROPIC_MODEL`; the
  default is a fallback, never an override.
- **Raw provider output is never persisted** — only a safe reference.
- **Default CI never performs paid provider calls** — the live test is gated and
  excluded from the normal run.
- **The controlled reasoning path is server-only and not publicly exposed.**
- **No permanent worker or crawler exists yet** — a caller drives one turn
  explicitly; the runtime driver (C2.1) and crawler (C3) are future work.

**C2.1 — Controlled Runtime Driver (merged, PR #37, merge commit `e53c5ff6`).**
The server-side execution seam between a queued scan and a real executed stage: a
driver that performs **exactly one** controlled runtime turn — lease ≤1 job →
execute ≤1 stage → persist ≤1 outcome → enqueue ≤1 downstream → return. It is a
coordinator, not an engine; it duplicates none of the runtime's transition,
retry, routing, grounding, validation, budget, checkpoint, artifact, or lease
logic.

- **`ControlledRuntimeDriver`** (`@brightloop/providers/src/driver`) —
  `runQueueTurn` / `runRunTurn` / `checkEligibility` (non-mutating dry-run) /
  `cancel`. It calls `RuntimeCoordinator.runOnce` (which stays the authority for
  the whole lease → execute → settle → enqueue sequence) and maps the resulting
  `StageOutcome` + captured job + reasoning telemetry into a safe `DriverResult`
  DTO — no domain entity, no DB row, no key, no raw provider output, no prompt.
- **`StageExecutorRegistry`** (`createDefaultStageRegistry`) — resolves each stage
  to an executable implementation or a stable named block. `provider_execution` is
  executable through the existing Claude adapter (the C2 controlled reasoning
  path); **every other stage returns a stable `blocked` reason** naming the
  runtime dependency not yet wired. There is **no fabricated placeholder artifact,
  no fake success, and no hidden fallthrough**.
- **Internal `POST /api/internal/runtime/run-once`** — `server-only` (a client
  import is a build error). **owner/admin/team_member only** via the
  `transformation.executions.write` capability; **client roles are rejected**
  (401 unauthenticated / 403 under-capability). Uses the caller's **request-scoped
  RLS Supabase client** — **no service-role bypass** — so the DB stays the final
  tenant boundary. Structured JSON only; a generic 500 on an unexpected throw
  leaks no message or stack.
- **Live-provider gating** — reasoning runs only when all of
  `AUXION_LIVE_AI_ENABLED` + `AUXION_ANTHROPIC_ENABLED` + a valid key + a
  configured model + an authorized internal actor + an eligible job + budget + no
  cancellation + a valid deadline hold. Disabled (the default) → the reasoning
  stage blocks with the stable reason `provider_disabled`; **no SDK client is
  constructed and no credit is spent**.
- **`startedAt` first-execution stamping** — `RunService.transition` stamps
  `startedAt` on the FIRST transition into an active (non-`pending`,
  non-terminal) status, and only then. **Idempotent** (a later active transition
  does not re-stamp); **replay/resume preserves the original `startedAt`**; a run
  **cancelled before it ever started remains unstamped**; an explicit
  `patch.startedAt` is never overridden. No schema or migration change.
- **Additive runtime primitives (only these four)** — `StageBlockedError` (an
  executor signals "blocked" without recording a failure; the engine releases the
  lease consuming no attempt); `RunOnceOptions` observability hooks
  (`onLease`/`onEnqueue`, informational, behaviour-neutral, return type
  unchanged); `queueDepth` (a non-mutating queue-depth peek for the dry-run
  eligibility check); and the `startedAt` stamping above. No schema, migration,
  RLS, or generated-type change.
- **15 driver tests** (deterministic, injected clock + counter ids, fake
  transport — no SDK/network): idle → `no_job_available`; blocked stages consume
  no attempt and fabricate nothing; reasoning executes once and persists
  metadata-only artifact + checkpoint + one downstream; the one-turn guarantee;
  failure mapping; cancel; `startedAt` stamped-once/preserved/unset; registry
  resolution; raw-output leak asserted absent. The live driver test
  (`driver.live.test.ts`) is **gated** on `AUXION_RUN_LIVE_PROVIDER_TESTS=true`
  and **excluded from the default suite** — CI executed the 15 driver tests and
  spent **no Anthropic credit** (0 `api.anthropic.com` calls).

**C2.1 invariants (do not regress):**

- **`RuntimeCoordinator.runOnce` remains the runtime authority** — the driver
  coordinates it, never reimplements the lease/execute/settle/enqueue sequence.
- **The driver performs one turn only** — one lease, one stage, one outcome, one
  downstream enqueue, then return. **There is still no permanent worker loop** (no
  loop/recursion/timer/polling/cron/daemon/scheduler).
- **There is still no crawler** — discovery/evidence/graph/synthesis stages block
  with stable reasons until C3+ wire them.
- **Provider calls remain server-only** — behind `import "server-only"` and the
  env gate; never reached from the browser.
- **Client roles cannot invoke the internal execution route** — internal actors
  with the execution capability only.
- **Raw provider output is never persisted, returned, or logged** — only safe
  metadata and a reference.
- **No service-role bypass exists** — the route uses the caller's RLS session.

**C3 — Discovery/Crawler Runtime (merged, PR #39, merge commit `20b9e21c`).** The
first REAL website ingress: a controlled business URL is normalized, SSRF-guarded
(string + DNS), robots-checked, fetched, extracted into bounded structured
evidence, and handed to the Evidence Engine — driven through the C2.1 controlled
runtime driver ONE stage at a time. It collects and provenances only; it does not
reason, score, recommend, or infer competitors.

- **New package `@brightloop/crawler`** — server-only infrastructure. Depends only
  on `@brightloop/domain` + `@brightloop/schema` (+ dev `@types/node`); it is the
  live adapter for the pure Phase-A discovery contracts and holds NO reasoning,
  recommendation, prompt, provider SDK, persistence, repository, SQL, Supabase,
  API route, rendering, pricing, or monitoring code. Never imported by a client
  bundle (it pulls Node networking + DNS).
- **Node HTTP transport** — a narrow `HttpTransport` seam; `FetchHttpTransport`
  does ONE hop (`redirect: "manual"`) over Node's global `fetch`, streams the body
  with a hard byte cap, times out via `AbortController` (cleared in `finally`),
  sends `credentials: "omit"` + `referrerPolicy: "no-referrer"`, and retains only a
  safe header subset — never cookies or authorization.
- **DNS resolution + IP classification** — `NodeDnsResolver` resolves every A/AAAA
  address; `classifyIp` flags IPv4 AND IPv6 loopback, RFC1918 private, ULA
  (`fc00::/7`), CGNAT (`100.64/10`), link-local, multicast, unspecified, reserved,
  and IPv4-mapped IPv6.
- **SSRF enforcement before every request** — `guardFetchUrl` layers the pure
  Phase-A `evaluateSsrf` (scheme/credentials/literal-IP/localhost) over the
  resolved-IP check, fail-closed. It runs on the initial URL AND on **every
  redirect target** (the fetcher re-guards each hop and bounds the redirect count),
  so a redirect cannot smuggle the crawler onto a private address.
- **robots.txt handling** — fetched through the transport and parsed by the pure
  Phase-A `parseRobots`; missing / non-2xx / empty / malformed → allow-all;
  crawl-delay, sitemaps, wildcard + explicit user-agents, allow/disallow all
  honoured; disallowed paths are excluded at planning and never fetched.
- **Conservative crawl planning** — canonical same-origin paths (+ custom) via the
  pure `planSession`/`buildResult`; caps on pages/depth/bytes/timeout/total-deadline/
  concurrency/redirects, all disabled-by-default-safe. No recursive/unbounded crawl.
- **Deterministic HTML extraction (no JS execution)** — regex/string parsing only
  (no DOM, no Playwright/Puppeteer): title, meta description, canonical, lang,
  headings, internal/external links, forms, emails, phones, JSON-LD @types, social
  links, SEO + accessibility signals. Identical HTML → identical extract.
- **Sanitization + prompt-injection marking** — strips script/style/comments,
  removes control characters, caps length, checksums (FNV-1a via the domain hasher),
  and FLAGS prompt-injection phrasings as data. Website text can never override
  Auxion system policy.
- **EvidenceIngress handoff** — crawled pages map to the canonical Phase-A
  `EvidenceIngress` plus per-page items carrying source URL, timestamp, method,
  checksum, provenance, freshness, and state. Observed (fetched) vs Unavailable
  (failed/excluded); nothing is fabricated for a page that never loaded.
- **Runtime stage executors** — resolved by the C2.1 `StageExecutorRegistry` shape:
  `discovery_planning` (validate + plan, no artifact) → `discovery_completion` (run
  the crawl → `discovery_manifest` artifact) → `evidence_normalization` (map pages →
  `evidence_ingress` artifact). Composed with the provider registry in
  `apps/web/src/lib/runtime-driver.ts` (discovery stages via the crawler, the
  reasoning stage via the provider, everything else blocked). Disabled by default
  (`AUXION_CRAWLER_ENABLED`) → stable `crawler_disabled` block, no outbound request,
  no fabricated artifact/success.
- **27 crawler tests** (21 unit + 6 runtime-integration; deterministic, offline via
  a fake transport + DNS); **994 total** workspace tests. The live crawl test
  (`crawler.live.test.ts`) is gated on `AUXION_RUN_LIVE_CRAWLER_TESTS=true` + a
  configured `AUXION_CRAWLER_TEST_URL` and excluded from the default suite — default
  CI makes **no external network call**.

**C3 rules (do not regress):**

- **The crawler collects and normalizes evidence only** — it does not reason, score,
  recommend, or infer competitors.
- **Phase-A discovery logic remains the source of truth** — the crawler CALLS the
  pure functions (`normalizeUrl`, `evaluateSsrf`, `parseRobots`, `planSession`,
  `buildResult`, `toEvidenceIngress`, `sourceForKind`, `hashContent`); it duplicates
  no algorithm.
- **The runtime remains responsible** for leasing, artifacts, checkpoints, events,
  retries, recovery, and downstream enqueue — the crawler owns none of these and
  enqueues nothing; the driver still runs one stage per turn.
- **Every URL and redirect must pass string AND DNS SSRF validation** — fail-closed.
- **Website content is untrusted data** — prompt-injection markers are flagged,
  never obeyed.
- **Raw HTML, cookies, authorization headers, and secrets are never persisted** —
  only bounded sanitized text, checksums, references, and safe metadata.
- **Unsupported or unavailable pages become explicit Unavailable evidence** — never
  a fabricated success.
- **The crawler is server-only and disabled by default.**

The original PDF-26 surface foundation (still current, underneath the Phase A build):

- **Contracts** (`@brightloop/schema/scan-engine`): `ScanRequest`, `ScanJob`
  (+`ScanJobStatus`/`ScanStage` — the **9 canonical stages** + `lastCompletedStage`
  resume point), `ProspectState`, `ScanSource`, `ScanResult`, `ScanEvidenceItem`,
  `EvidenceBasis` (observed/estimated/inferred/unavailable), `CompetitorCandidate`,
  `CompetitorBenchmark`, `DomainDiagnosis` (carries `basis`), `ScanConfidence`,
  `ReportEntitlement`, `ProposalGenerationRequest`, `ModelInvocation`,
  `EntitlementTier`.
- **Ports** (`@brightloop/domain/scan-engine`): `AiOrchestrator` (one
  vendor-neutral AI seam, structured output — OpenAI/Anthropic/Google/DeepSeek all
  implement it; **no model-specific logic in domain**), `CrawlerProvider`,
  `SearchProvider`, `BenchmarkProvider`, `DiagnosisSynthesizer`, `ScanJobQueue`,
  plus the `EntitlementPolicy` (billing-agnostic: subscription / deposit / manual
  approval / engagement) and the **9-stage** `SCAN_PIPELINE` (checkpointed +
  resumable): discover → crawl → identify competitors → collect evidence →
  benchmark → diagnose → generate Insights → build recommendations → prepare report.
- **Access levels (5 roles):** VISITOR (public preview) → LEAD (registered) →
  OPERATOR (internal, owns the proposal engine) → CLIENT (committed) → ADMIN.
- **Security invariants baked into the shapes:** crawled content is UNTRUSTED
  with provenance; observed facts (`ScanEvidenceItem`) are separated from AI
  inference (`DomainDiagnosis`); model calls log provider/model/version
  (`ModelInvocation`), never chain-of-thought; SSRF guarding is an adapter
  contract; internal proposal tools stay capability-gated behind existing RLS.

Phase 0 detail:
- **Tokens** — canonical dual-theme set in `packages/ui/src/tokens/colors.css`
  (amber `--signal`, `--bg/--surface/--ink` ramp, `--positive/caution/critical/
  info`, `--line`, `--action-bg/fg`, `--on-signal`); role-based radii; amber focus
  ring. Legacy semantic aliases retained as **@deprecated** compatibility shims
  (re-pointed to canon; removed in Phase 5). Architecture unchanged.
- **Typography** — Space Grotesk (display) + IBM Plex Sans (UI) + IBM Plex Mono
  (data); `clamp()` display tier. Sora removed.
- **Motion** — three named canon curves (Precise 240 / Orchestrate 440 / Enter
  640) + `auxRise/auxPulse/auxBlink`, added to the existing preset system; legacy
  presets retained.
- **Badge** — canonical neutral-pill (surface-2 fill, `--line` border, colored dot
  + mono text); component API preserved.
- **Shell** — blueprint dot-grid canvas + amber active-nav on the existing 248px
  rail / 60px topbar; routing/permissions/nav untouched.
- **BrightLoop visual purge** — all legacy teal/blue accents tokenized to
  `--signal`; login de-branded to canon voice. (Public marketing narrative copy is
  a separate product decision — no canon source.)
- Guardrail tests (`packages/ui/src/tokens/canon-tokens.test.ts`,
  `motion/canon-motion.test.ts`) assert token availability in both themes,
  neutral-pill Badge, canon motion values, and no teal/Sora leaks in shared UI.

**PR #6 (Insights)** remains **open and pending reconciliation** against
`10-Insights.pdf` (a richer AI-native case file than the current build). Do not
merge/close it; the canonical Insights rebuild is a later phase.

The earlier code-grounded design notes on the `docs/design-documentation` branch
(unmerged) describe the *pre-migration* implementation; treat them as
implementation history and reconcile to these PDFs, do not delete.

---

## 14. Phase F · Sprint F4.1 — Integration Platform Foundation (branch `feat/f4-integration-core`, PR open)

The **connector framework every external service plugs into** — NOT a vendor
integration. No Gmail/Slack/Shopify/Stripe/HubSpot/QuickBooks/Meta/LinkedIn is
implemented; the only live connectors are two deterministic **Fake** connectors
(`fake-connector` api_key+webhook+polling, `fake-oauth` oauth2+polling) plus three
vendor-neutral **example** descriptors (unavailable, no adapter). Full blueprint:
`engineering-blueprint/phase-f4/`.

New `integration` bounded context that **extends** F3, never duplicates it:
- **Schema** `packages/schema/src/integration.ts` — connector descriptor +
  capability + config-field contracts; 8 persisted entities.
- **Domain** `packages/domain/src/integration/` — `CONNECTOR_REGISTRY` (pure
  additive catalogue like `MODEL_REGISTRY`); lifecycle machines
  (`canTransitionInstallation` / `canTransitionOAuthGrant`); `validateConnectorConfig`
  (splits secret vs non-secret); pure OAuth state/scope/expiry; `normalizeTranslatedEvents`
  (validate+sanitize+dedupe); `sanitizeConnectorMetadata`/`hasNoConnectorSecrets`;
  idempotency keys; **`ConnectorAdapter`** (generalizes F3 `RuntimeAdapter`, adds
  OAuth/webhook/polling/translate) + **`ConnectorSecretStore`** ports; repository ports.
  Node-free, deterministic. **Barrel-collision renames vs execution-runtime:**
  `sanitizeConnectorMetadata`, `hasNoConnectorSecrets`, `connectorWebhookKey`,
  `buildConnectorHealthSnapshot`, `buildConnectorWebhookReceipt`,
  `ConnectorConnectionValidationResult` (schema: `connectorWebhookReceiptStatusSchema`).
- **Data** `packages/data/src/integration/` — 8 Supabase adapters
  (`createIntegrationRepositories`), mappers, `createEnvConnectorSecretStore`
  (`CONNECTOR_SECRET__` prefix), `createFakeConnectorAdapter` /
  `createDefaultConnectorAdapters`.
- **Migration** `supabase/migrations/20260806000100_phase_f_integration_platform.sql`
  — 8 tables (`connector_installation` versioned root + `unique(workspace_id,connector_id)`;
  `connector_secret_reference` + `connector_oauth_grant` INTERNAL-ONLY;
  health/event/webhook_receipt/polling_cursor/audit append-only via
  `bl_txexec_append_only`). RLS: internal-write / client-read-own; secrets+oauth
  internal-only. pgTAP `supabase/tests/phase_f_integration_platform_test.sql`.
- **Application** `packages/application/src/integration/` — install/configure/
  enable/disable/revoke/validate/health, secret rotation, OAuth begin/complete,
  webhook + polling ingestion (idempotent), read models, DTOs (no secret/ref/key
  leaks), in-memory testing doubles. `context.ts` gains `integration` /
  `connectorAdapters` / `connectorSecrets` + `INTEGRATION_*` caps. Application DTO
  renames vs other contexts: `Connector{Event,Health,AuditEvent}DTO`,
  `IngestConnectorWebhookInput`.
- **Web** `/workspace/integrations` (installed), `/marketplace` (grid),
  `/marketplace/[connectorId]` (details+install), `/[installationId]` (detail+controls);
  `lib/integration-data.ts`, `actions.ts`; nav item `integrations` (icon `plug`).
- **Authorization** — new `integration.*` namespace in `roles.ts`: admin `integration.*`;
  team_member read/install/configure/enable/disable/health.check/oauth.authorize/ingest;
  clients `integration.read` only (revoke + credentials.manage owner/admin).

Gate green (`typecheck lint test build`, 36/36); ~51 new unit tests + pgTAP.
**Known follow-up:** `packages/db/generated/database.types.ts` must be regenerated
from the CI `generated-db-types` artifact and committed (`chore(db)`) so the
`db-verify` drift check is zero — the Docker-less flow every phase uses; the data
adapter compiles meanwhile via the one documented `as unknown as SupabaseClient` cast.
**Adding a real connector later:** implement `ConnectorAdapter` in `@brightloop/data`
+ register in `createDefaultConnectorAdapters` + append a `CONNECTOR_REGISTRY`
descriptor — no framework change.

---

## 15. Phase F · Sprint F4.2 — Google Workspace connectors (branch `feat/f4-google-workspace`, PR open)

The FIRST production connectors on the [§14] F4.1 platform: **Gmail, Google
Calendar, Google Drive, Google Contacts** (connector ids `google-gmail`/
`google-calendar`/`google-drive`/`google-contacts`, all oauth2, `available:true`).
No other vendor built (Slack/Teams/Shopify/Stripe/HubSpot/QuickBooks/Meta/LinkedIn
remain later sprints). Branched off `feat/f4-integration-core` (F4.1 unmerged).
Full report: `engineering-blueprint/phase-f4.2/`.

**One additive framework completion (NOT a redesign):** F4.1 declared capabilities
but couldn't execute them. F4.2 adds an optional `execute(ExecuteOperationInput) →
ConnectorResult<OperationOutput>` on `ConnectorAdapter` (domain adapter-port.ts,
same optional-method pattern as oauth/webhook/poll) + `invokeConnectorCapability`
use-case + one widened audit op. Nothing else in the port/registry/lifecycle/secret
model/RLS/DTO changed.

- **Domain:** `adapter-port.ts` +execute; `registry.ts` +4 Google descriptors
  (capabilities name provider-neutral `operation`s, scopes, oauth2). `schema/integration.ts`
  `connectorOperationSchema` +`"invoke"`.
- **Data** `packages/data/src/integration/google/`: `transport.ts` (`GoogleHttpTransport`
  seam + `FetchGoogleHttpTransport` — ONLY place fetch is called; one hop, timeout,
  bounded body); `client.ts` (`GoogleAdapterConfig` {clientId,clientSecret,
  defaultRedirectUri,transport,now} + `callGoogle`/`callGoogleForm`); `errors.ts`
  (status→normalized category + 7 health reasons, pure — numeric error.status
  coerced to string); `oauth.ts` (Authorization Code URL `access_type=offline`+
  `prompt=consent`, exchange, refresh, absolute expiry from injected clock);
  `helpers.ts`; `gmail/calendar/drive/contacts.ts` (op maps + poll→canonical
  events); `adapter.ts` (`createGoogleConnectorAdapters(config)`,
  `loadGoogleAdapterConfig(env,transport,now)`). Exported from data barrel.
- **Application:** `invoke-usecases.ts` (`invokeConnectorCapability` — authorize
  `integration.invoke` → operable + enabled + declared gates → resolve token →
  execute → audit `invoke` → `OperationResultDTO`; undeclared=NotFound,
  not-enabled=Validation, auth fail=RuntimeUnavailable "reconnect"). `shared.ts`
  `resolveConnectorSecret(ctx,inst,adapter)` — for oauth2 reads the stored token
  bundle, and if expired REFRESHES via adapter + ROTATES the stored secret (new
  version/expiry) + re-validates the reference; F4.1 validate/health/poll now call
  it (Fake api_key path unchanged). `INTEGRATION_INVOKE_CAP="integration.invoke"`
  (context.ts + roles.ts: admin `integration.*`, team_member explicit, clients NONE).
  App DTO/type renames: `InvokeConnectorCapabilityInput`, `OperationResultDTO`.
- **Web:** OAuth callback route `apps/web/src/app/workspace/integrations/oauth/callback/route.ts`
  (code+state → `completeConnectorOAuth` → redirect, generic error flags only);
  `connectConnectorAction`/`invokeCapabilityAction`; `ConnectorControls` Connect/
  Reconnect for oauth2; connect-status banner. Marketplace unchanged (renders registry).
  `getConnectorAdapterRegistry` now merges Fakes + Google adapters (real fetch
  transport + env OAuth config).
- **Migration** `20260807000100_phase_f4_google_workspace.sql`: widen
  `connector_audit_event` operation CHECK to include `invoke`. NO new tables/columns/
  RLS/triggers; NO generated-type change (operation is text-check, not pg enum).
  pgTAP `phase_f4_google_workspace_test.sql`.
- **Env (out-of-band, never persisted):** `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`/
  `_REDIRECT_URI`. Unset → connectors still install, OAuth fails clearly. Access/
  refresh tokens stored ONLY via ConnectorSecretStore (purpose `oauth_token`, JSON
  blob {accessToken,refreshToken}, expiresAt on the reference row).

Health = 7 states via reason in snapshot detail (connected/disconnected/expired/
permission_missing/rate_limited/configuration_error) — no new health enum. Events
are Auxion-canonical (`email.received`, `calendar.event.changed`,
`drive.file.changed`) — Google event shapes never exposed. Known limits: Drive
download/upload + Gmail attachments are metadata-only (binary streaming deferred);
polling not push. Tests: data +23 (google.test.ts), application +10
(integration-google.test.ts), domain +2, pgTAP. Gate `typecheck lint test build`
36/36 green; ZERO live Google calls in CI (fake transport).

---

## 16. Phase F · Sprint F4.3 — Communication connectors (branch `feat/f4-communication-connectors`, PR open)

**Slack / Microsoft Teams / Discord** on the F4.1 platform, following the F4.2
production-connector pattern. Framework treated as production-ready and UNCHANGED:
F4.3 adds ZERO framework/schema/migration/web changes — only registry descriptors +
data adapters + a composition-root merge + tests. DO-NOT-IMPLEMENT
(Zoom/Telegram/WhatsApp/Signal/Email/Google/Commerce/CRM/Accounting) untouched.
Branched off `main` (with #67 F4.1 + #68 F4.2 merged first). Report:
`engineering-blueprint/phase-f4.3/`.

Design: three connectors as **data-driven bindings over ONE generic engine** — no
provider business logic outside an adapter. `packages/data/src/integration/communication/`:
`transport.ts` (CommHttpTransport seam + FetchCommTransport — only fetch); `errors.ts`
(HTTP-status + Slack body-`ok` classifiers → category + 7 health reasons + reasonForCategory,
pure); `client.ts` (`CommProviderBinding` contract {connectorId, authStyle bearer|bot,
oauth?, probeUrl, classify, ops, poll} + `callProvider` applying Bearer/Bot auth +
`callTokenEndpoint`); `oauth.ts` (GENERIC Authorization-Code authorize/exchange/refresh,
endpoint-parameterized per binding); `normalize.ts` (`COMM_EVENTS` canonical vocabulary);
`slack.ts`/`teams.ts`/`discord.ts` (bindings: normalized op → provider API + poll translator);
`adapter.ts` (`createCommAdapter` generic + `createCommunicationConnectorAdapters(config)`
+ `loadCommunicationConfig(env,transport,now)` — OAuth methods present ONLY for oauth
bindings with creds). Wired into `getConnectorAdapterRegistry` (Fakes + Google + Communication).

Auth: Slack + Teams = oauth2 (reuse F4.1 OAuth + F4.2 resolveConnectorSecret refresh/rotate;
Teams issues refresh tokens via offline_access, Slack tokens non-expiring); Discord =
**bot token (api_key)**, `Authorization: Bot <token>`, no OAuth. Client creds via env
`SLACK_CLIENT_ID/SECRET`, `MS_TEAMS_CLIENT_ID/SECRET`; Discord bot token is a per-install
secret. NORMALIZED capabilities: all three expose identical `communication.*` keys+operations
(send_message/reply_message/edit_message/delete_message/list_channels/list_members/
search_messages/read_history/list_containers/meeting_metadata) — each provider declares its
subset; adapters map to provider APIs; no provider API exposed. Events: provider messages →
canonical `communication.message.created/.replied` etc. inside adapters (Slack/Teams/Discord
poll), then F4.1 normalizeTranslatedEvents + idempotent polling persistence. Health: 7 states
via snapshot detail.reason (Slack HTTP-200 `{ok:false}` via classifySlack). Authorization:
existing `integration.invoke` funnel; clients cannot invoke. **DB change: NONE** (reuses
connector_* tables + `invoke` audit op + integration.invoke; no migration/pgTAP/type change).
Web: NONE (marketplace registry-driven; Slack/Teams Connect via existing OAuth flow; Discord
botToken via existing InstallForm secret field). Tests: data +24 (communication.test.ts),
application +5 (integration-communication.test.ts), domain +1. Gate `typecheck lint test build`
36/36 green; ZERO live provider calls (fake transport). Known limits: polling-not-push,
metadata-only files/meetings, Teams edit/delete not exposed.

---

## 17. Phase F · Sprint F4.4 — Commerce connectors (branch `feat/f4-commerce-connectors`, PR open)

The commerce connector family on the [§14] F4.1 platform: **Shopify, Stripe,
PayPal** (connector ids `shopify`/`stripe`/`paypal`, all `api_key`,
`available:true`, `category:commerce`). Branched off `origin/main` (F4.1 `#67` +
F4.2 `#68`); F4.3 `#69` was still open at branch time — F4.4 is an independent
sibling family with **no code dependency** on F4.3. Full report:
`engineering-blueprint/phase-f4.4/`.

**PURE additive connector family — NO framework/DB/RLS/roles/DTO change** (like
F4.3). Reuses the F4.1 ports + F4.2 `execute()`/`invoke` + the F4.1
webhook/polling ingestion use-cases unchanged.

- **Domain:** `registry.ts` +3 descriptors declaring a **NORMALIZED `commerce.*`
  capability vocabulary** — each provider exposes a SUBSET sharing identical
  `operation` names (Shopify 16, Stripe 15, PayPal 9). No provider-specific
  capability exposed. `integration.test.ts` +1.
- **Data** `packages/data/src/integration/commerce/` — the **F4.3 "binding" pattern**
  generalized for commerce heterogeneity: `transport.ts` (`CommerceHttpTransport`
  seam + `createFetchCommerceTransport` — the ONLY fetch site); `client.ts`
  (`callCommerce` engine + `CommerceProviderBinding` — the one provider-specific
  surface — with per-call `authorize` returning `{baseUrl,headers}`); `errors.ts`
  (HTTP status → 7 health states, pure); `webhook.ts` (base64 HMAC-SHA256 Shopify +
  `t=…,v1=…` hex HMAC-SHA256 Stripe, constant-time, node:crypto); `normalize.ts`
  (canonical `commerce.*` event vocabulary); `helpers.ts`; `shopify.ts`/`stripe.ts`/
  `paypal.ts` (op maps + poll + webhook verify/translate); `adapter.ts`
  (`createCommerceConnectorAdapters(cfg)` + `loadCommerceConfig`). Barrel-exported.
- **Auth (all api-key style; no user-redirect OAuth):** Shopify Admin API token via
  `X-Shopify-Access-Token`; Stripe secret key via `Bearer`; PayPal **client-
  credentials** — `authorize` mints a bearer token via `/v1/oauth2/token` (Basic
  auth) per call. Credentials are per-installation secrets stored ONLY by reference;
  webhook signing secret is a `webhookSigningSecret` field (`/sign/i` →
  `webhook_signing` purpose). Config orders the credential secret field BEFORE the
  signing secret so it becomes the primary reference.
- **Web:** `getConnectorAdapterRegistry` merges Fakes + Google + Commerce (real fetch
  transport). Marketplace/detail render the registry → commerce appears automatically.
- **Migration:** NONE. No tables/columns/enums/RLS/triggers/generated-types; the
  `invoke` audit op already exists (F4.2 migration). No pgTAP change.

Event translation (provider shapes stay inside adapters): Shopify order body →
`commerce.order.{paid,fulfilled,cancelled,updated}` (topic inferred from body — the
`X-Shopify-Topic` header isn't in the sync webhook port); Stripe `event.type` →
`commerce.payment.completed`/`.refunded`/`checkout.completed`/`dispute.created`;
PayPal `event_type` → same canonical set. Webhook verify → translate → persist runs
through F4.1 `ingestConnectorWebhook` (idempotent; replay=duplicate). **Known
limits:** PayPal webhook verification is STRUCTURAL (its cryptographic verify is an
online API call the sync port can't make); Shopify topic is body-inferred; polling
implemented at adapter layer but installations default to the `webhook` trigger.
Tests: data +35 (commerce.test.ts, real HMAC vectors), application +8
(integration-commerce.test.ts — full webhook pipeline + replay + authz), domain +1.
Gate `typecheck lint test build` **36/36 green**; **ZERO live Shopify/Stripe/PayPal
calls** in CI (fake transports).

---

## 18. Phase F · Sprint F4.5 — CRM connectors (branch `feat/f4-crm-connectors`, PR open)

The CRM connector family on the [§14] F4.1 platform: **HubSpot, Salesforce,
Pipedrive** (connector ids `hubspot`/`salesforce`/`pipedrive`, all `oauth2`,
`available:true`, `category:crm`). Branched off `main` AFTER F4.3 `#69` + F4.4 `#70`
were merged (this sprint merged both prerequisites first, resolving their additive
composition-root/registry/ENGINEERING_CONTEXT conflicts). Full report:
`engineering-blueprint/phase-f4.5/`.

**PURE additive connector family — NO framework/schema/DB/RLS/roles change.** Reuses
the F4.1 ports + F4.2 `execute()`/`invoke` + F4.1 webhook/polling ingestion +
`resolveConnectorSecret` OAuth refresh/rotation, all unchanged. `crm` was already a
`connectorCategory`; no schema edit.

- **Domain:** `registry.ts` +3 descriptors declaring a **NORMALIZED `crm.*`
  capability vocabulary** — each provider exposes a SUBSET sharing identical
  `operation` names (HubSpot 24, Salesforce 26 incl. leads, Pipedrive 23). No
  provider-specific capability exposed. `integration.test.ts` +1.
- **Data** `packages/data/src/integration/crm/` — the F4.3/F4.4 binding pattern:
  `transport.ts` (`CrmHttpTransport` seam + `createFetchCrmTransport` — the ONLY fetch
  site); `client.ts` (`callCrm` engine + `CrmProviderBinding` — the one
  provider-specific surface — with `authorize(secret,config)→{baseUrl,headers}` +
  `callTokenEndpoint` supporting body OR Basic client-auth); `oauth.ts` (GENERIC
  authorization-code exchange/refresh); `errors.ts` (HTTP status → 7 health states,
  pure); `normalize.ts` (canonical `crm.*` event vocabulary); `contracts.ts`
  (provider-neutral `CRMContact/Company/Deal/Pipeline/Stage/Owner/Activity/Note/…`);
  `helpers.ts`; `salesforce-soql.ts` (**allowlisted, escaped, LIMIT-capped SOQL
  builder — the ONLY place SOQL is produced; no raw SOQL ever accepted**);
  `hubspot.ts`/`salesforce.ts`/`pipedrive.ts` (op maps + poll + webhook);
  `webhook.ts` (HubSpot v1 HMAC-SHA256 hex, constant-time; Pipedrive structural);
  `adapter.ts` (`createCrmConnectorAdapters(cfg)` + `loadCrmConfig`). Barrel-exported.
- **Auth (all OAuth 2.0 authorization-code):** HubSpot (api.hubapi.com, refresh
  rotation ~30 min tokens); Salesforce (login.salesforce.com; **instance URL carried
  as install config** — the exchange runs with empty config so the API base can't come
  from the token response; polling-only); Pipedrive (oauth.pipedrive.com, **Basic
  client-auth** at the token endpoint; company domain as install config). App-level
  client creds via env `HUBSPOT_/SALESFORCE_/PIPEDRIVE_CLIENT_ID|SECRET`; tokens are
  per-install secrets stored ONLY by reference; optional `webhookSigningSecret`
  (HubSpot/Pipedrive) via the F4.1 `webhook_signing` purpose.
- **Web:** `getConnectorAdapterRegistry` merges Fakes + Google + Communication +
  Commerce + CRM (real fetch transport). Marketplace/detail are registry-driven → CRM
  appears automatically. **NO web/DB/migration/pgTAP change.**

Event translation (provider shapes stay inside adapters): HubSpot `subscriptionType`
(`contact.creation`/`deal.propertyChange`→`crm.contact.created`/`crm.deal.stage_changed`
etc.); Pipedrive `meta.action`+`meta.object` → `crm.deal.won`/`.stage_changed`/…;
Salesforce polled opportunity deltas → `crm.deal.won`/`.lost`/`.updated`. Webhook
verify→translate→persist runs through F4.1 `ingestConnectorWebhook` (idempotent;
replay=duplicate). **Known limits:** Salesforce is polling-only (no body-signed
webhook); HubSpot uses the v1 body signature (v3 needs method/uri/timestamp the sync
port omits); Pipedrive webhook verification is structural (no body HMAC) with an
optional shared-secret gate; Salesforce/Pipedrive API base URLs are install config
(not persisted from the token response). Tests: data +40 (crm.test.ts, real HubSpot v1
HMAC vector + SOQL allowlist/injection), application +11 (integration-crm.test.ts —
OAuth connect + refresh/rotation + webhook replay + poll replay + client/scope
denial), domain +1. Gate `pnpm -w typecheck lint test build` **green**; **ZERO live
HubSpot/Salesforce/Pipedrive calls** in CI (fake transports).

---

## 19. Phase F · Sprint F4.6 — Finance connectors (branch `feat/f4-finance-connectors`, PR open)

The Finance connector family on the [§14] F4.1 platform: **QuickBooks Online, Xero**
(connector ids `quickbooks`/`xero`, both `oauth2`, `available:true`, `category:finance`).
Branched off `main` AFTER F4.5 `#71` (CRM) was merged. Full report:
`engineering-blueprint/phase-f4.6/` (report only — no blueprint edit).

**PURE additive connector family — reuses the F4.1 ports + F4.2 `execute()`/`invoke` +
F4.1 webhook/polling ingestion + `resolveConnectorSecret` OAuth refresh/rotation, all
unchanged.** The ONE additive schema touch: `connectorCategorySchema` gained a new
`"finance"` member (Zod enum only — connector `category` is NOT persisted in the DB, so
no migration / pgTAP / RLS / type-drift impact; QuickBooks/Xero are accounting software,
not `payments` processors, so a distinct category is correct).

- **Domain:** `registry.ts` +2 descriptors declaring a **NORMALIZED `finance.*`
  capability vocabulary** — both providers expose the same `operation` names (QuickBooks
  21 incl. `finance.payments.refund`, Xero 20). No provider-specific capability exposed.
  `integration.test.ts` +1 block.
- **Data** `packages/data/src/integration/finance/` — the F4.3/F4.4/F4.5 binding pattern:
  `transport.ts` (`FinanceHttpTransport` seam + `createFetchFinanceTransport` — the ONLY
  fetch site); `client.ts` (`callFinance` engine + `FinanceProviderBinding` — the one
  provider-specific surface — with `authorize(secret,config)→{baseUrl,headers}` +
  `callTokenEndpoint` (HTTP Basic client-auth, both providers)); `oauth.ts` (GENERIC
  authorization-code exchange/refresh, Basic-auth default); `errors.ts` (HTTP status →
  7 health states, pure, QBO `Fault`/Xero `Type` safe-code extraction); `normalize.ts`
  (canonical `finance.*` event vocabulary); `contracts.ts` (provider-neutral
  `FinanceCompany/Account/Customer/Invoice/Payment/Expense/Item/Tax/Health/SearchResult`);
  `helpers.ts`; `quickbooks-query.ts` (**allowlisted, escaped, MAXRESULTS-capped QBO
  query builder — the ONLY place QBO query text is produced; no raw query ever
  accepted**); `quickbooks.ts`/`xero.ts` (op maps + poll + webhook); `webhook.ts` (shared
  HMAC-SHA256 base64 verify, constant-time — Intuit `intuit-signature` + Xero
  `x-xero-signature`); `adapter.ts` (`createFinanceConnectorAdapters(cfg)` +
  `loadFinanceConfig`). Barrel-exported.
- **Auth (both OAuth 2.0 authorization-code, HTTP Basic client-auth at the token
  endpoint):** QuickBooks (Intuit `oauth.platform.intuit.com`; **realmId + environment
  (production/sandbox) carried as install config** — API base `${host}/v3/company/{realmId}`);
  Xero (`identity.xero.com`; **tenantId carried as install config** and attached as the
  `Xero-Tenant-Id` header — the multi-tenant analogue of Salesforce's instance URL).
  App-level client creds via env `QUICKBOOKS_/XERO_CLIENT_ID|SECRET`; tokens are
  per-install secrets stored ONLY by reference; optional `webhookSigningSecret`
  (both) via the F4.1 `webhook_signing` purpose.
- **Web:** `getConnectorAdapterRegistry` merges Fakes + Google + Communication + Commerce
  + CRM + Finance (real fetch transport). Marketplace/detail are registry-driven →
  Finance appears automatically. **NO web/DB/migration/pgTAP change.**

Event translation (provider shapes stay inside adapters): QuickBooks
`eventNotifications[].dataChangeEvent.entities[]` (`Invoice`/`Payment`/`Customer`/…
+ operation → `finance.invoice.updated`/`.voided`/`finance.payment.created`/…); Xero
`events[]` (`eventCategory`+`eventType` → `finance.invoice.created`/`.customer.updated`/…).
Webhook verify→translate→persist runs through F4.1 `ingestConnectorWebhook` (idempotent;
replay=duplicate). **Known limits / normalized-subset asymmetry:** only QuickBooks exposes
`finance.payments.refund` (RefundReceipt); Xero models refunds through credit notes /
overpayments (a distinct object) and omits it — mirrors the F4.5 Salesforce-leads /
HubSpot-archive pattern. QBO has no first-class REST list endpoint — every list/read goes
through the allowlisted query builder; Xero expenses map to `BankTransactions` of
`Type=="SPEND"`. Tests: data +31 (finance.test.ts — real Intuit + Xero HMAC-SHA256 base64
vectors + QBO query allowlist/injection), application +11 (integration-finance.test.ts —
OAuth connect + refresh/rotation + webhook replay + poll replay + client/scope denial),
domain +1. Gate `pnpm -w typecheck lint test build` **green**; **ZERO live QuickBooks/Xero
calls** in CI (fake transports).

---

## 20. Phase F · Sprint F4.7 — Social connectors (branch `feat/f4-social-connectors`, PR open)

The Social connector family on the [§14] F4.1 platform: **Meta (Facebook + Instagram),
LinkedIn, X (Twitter), TikTok** (connector ids `meta`/`linkedin`/`x`/`tiktok`, all
`oauth2`, `available:true`, `category:social`). Branched off `main` AFTER F4.6 `#72`
(Finance) was merged. Full report: `engineering-blueprint/phase-f4.7/` (report only —
no blueprint edit).

**PURE additive connector family — reuses the F4.1 ports + F4.2 `execute()`/`invoke` +
F4.1 webhook/polling ingestion + `resolveConnectorSecret` OAuth refresh/rotation, all
unchanged.** The ONE additive schema touch: `connectorCategorySchema` gained a new
`"social"` member (Zod enum only — connector `category` is NOT persisted in the DB, so
no migration / pgTAP / RLS / type-drift impact).

- **Domain:** `registry.ts` +4 descriptors declaring a **NORMALIZED `social.*`
  capability vocabulary** — each provider exposes a SUBSET sharing identical `operation`
  names (Meta 13, LinkedIn 11, X 10, TikTok 8). No provider-specific capability exposed.
  `integration.test.ts` +1 block.
- **Data** `packages/data/src/integration/social/` — the F4.3–F4.6 binding pattern:
  `transport.ts` (`SocialHttpTransport` seam + `createFetchSocialTransport` — the ONLY
  fetch site); `client.ts` (`callSocial` engine + `SocialProviderBinding` — the one
  provider-specific surface — with `authorize(secret,config)→{baseUrl,headers}` +
  `callTokenEndpoint`; the OAuth descriptor adds `clientIdParam`/`clientSecretParam`
  (TikTok's `client_key`) + `scopeSeparator` (Meta/TikTok comma-join) knobs the finance
  family didn't need); `oauth.ts` (GENERIC authorization-code exchange/refresh, body OR
  Basic client-auth); `errors.ts` (HTTP status → 7 health states, pure, Meta
  `error.code` / X `errors[]` / LinkedIn `serviceErrorCode` safe-code extraction);
  `normalize.ts` (canonical `social.*` event vocabulary); `contracts.ts`
  (provider-neutral `SocialProfile/Account/Page/Post/Comment/Media/Analytics/Health/
  SearchResult`); `helpers.ts`; `meta.ts`/`linkedin.ts`/`x.ts`/`tiktok.ts` (op maps +
  poll + Meta webhook); `webhook.ts` (Meta `X-Hub-Signature-256` HMAC-SHA256 **hex**
  verify, `sha256=` prefix, constant-time); `adapter.ts` (`createSocialConnectorAdapters(cfg)`
  + `loadSocialConfig`). Barrel-exported.
- **Auth (all OAuth 2.0 authorization-code):** Meta (Facebook Graph, body client-auth,
  comma scopes, Bearer); LinkedIn (`api.linkedin.com`, body client-auth, fixed
  `LinkedIn-Version` + `X-Restli-Protocol-Version` headers, org URN as install config);
  X (`api.twitter.com/2`, **HTTP Basic** client-auth, PKCE **code_verifier deferred** —
  the sync OAuth port doesn't thread it); TikTok (`open.tiktokapis.com/v2`, **`client_key`**
  credential param, comma scopes, HTTP-200 `error.code` envelope classified like Slack).
  App-level client creds via env `META_/LINKEDIN_/X_CLIENT_ID|SECRET` +
  `TIKTOK_CLIENT_KEY|SECRET`; tokens are per-install secrets stored ONLY by reference;
  optional Meta `webhookSigningSecret` (app secret) via the F4.1 `webhook_signing` purpose.
- **Web:** `getConnectorAdapterRegistry` merges Fakes + Google + Communication + Commerce
  + CRM + Finance + Social (real fetch transport). Marketplace/detail are registry-driven
  → Social appears automatically. **NO web/DB/migration/pgTAP change.**

Event translation (provider shapes stay inside adapters): Meta `entry[].changes[]`
(`field`+`verb` → `social.post.published`/`.deleted`/`social.comment.created`/…); LinkedIn
polled org posts → `social.post.created`; X polled tweets → `social.post.published`; TikTok
polled videos → `social.post.published`. Webhook verify→translate→persist runs through F4.1
`ingestConnectorWebhook` (idempotent; replay=duplicate). **Known limits / normalized-subset
asymmetry:** only Meta lists Pages (`social.pages.list`) + reads insights
(`social.insights.read`); only X exposes search (`social.search.read`); Meta + TikTok
publish (`social.posts.publish`) where LinkedIn + X create (`social.posts.create`) — mirrors
the F4.5/F4.6 subset-asymmetry pattern. Only Meta has a body-signed webhook the sync port
can verify; LinkedIn/X/TikTok are polling-only. Media upload is metadata/handle-only
(binary chunk transfer deferred); X PKCE code_verifier + Meta long-lived-token exchange are
documented OAuth limitations. Tests: data +33 (social.test.ts — real X-Hub-Signature-256
hex vector + comma/space scope + body/Basic/client_key exchange + TikTok 200-error
envelope), application +11 (integration-social.test.ts — OAuth connect + refresh/rotation +
webhook replay + poll replay + client/scope denial), domain +1. Gate
`pnpm -w typecheck lint test build` **green**; **ZERO live Meta/LinkedIn/X/TikTok calls** in
CI (fake transports).

---

## 21. Phase F · Sprint F4.8 — Integration Platform Certification (branch `feat/f4-platform-certification`, PR open)

The FINAL Integration-Platform sprint. **Introduces NO new providers, connector
families, Marketplace features, UI, Copilot commands, or DB schema.** It certifies
that everything built F4.1→F4.7 (Google · Communication · Commerce · CRM · Finance ·
Social — 6 families, 19 production connectors + 2 framework Fakes) behaves as ONE
coherent platform. Branched off `main` AFTER F4.7 `#73` (Social) was merged. Report:
`docs/engineering/integration-platform-certification.{md,json}` (engineering-blueprint
untouched, by pre-flight invariant).

**Pure additive test + tooling sprint — zero framework/schema/DB/RLS/roles/web change.**
Two new certification surfaces plus a re-runnable report generator; no production code
path altered (no defects required a fix — the platform certified clean on first pass).

- **Certification harness** `packages/data/src/integration/certification/` (PURE,
  OFFLINE, deterministic): `certify.ts` composes the SAME production adapter set the
  web composition root wires (`buildCertificationAdapterRegistry` — Fakes + 6 families
  against a stub transport, fake env, fixed clock — never fetches), then cross-checks
  it against the domain `CONNECTOR_REGISTRY` (single source of truth). Proves every
  declared capability has descriptor·operation·adapter·HANDLER (an adapter reports the
  op supported via its pure `discoverCapabilities` op map) — **no orphan capability, no
  undeclared handler, no duplicate registration, no orphan adapter**; every AVAILABLE
  connector is installable + invocable (execute) + health-reporting + connection-validating
  with trigger wiring (poll for polling, verify+translate for webhook) and OAuth wiring
  matching its descriptor. The two framework Fakes are exempt from the hidden-handler
  check (their shared discovery list is a fixed reference union, not a defect). `report.ts`
  renders a deterministic markdown + JSON certification report. Barrel-exported from
  `@brightloop/data`. `certify.test.ts` (+7) asserts ZERO defects and pins the matrix
  totals (24 registry connectors · 21 installable · 3 catalogue examples · 254 capabilities).
- **Cross-provider certification** `packages/application/src/integration/certification.test.ts`
  (+15): drives ONE representative connector per family (gmail/slack/shopify/hubspot/
  quickbooks/meta — spanning oauth2 + api_key, webhook + polling) through the REAL
  use-cases on the in-memory doubles, certifying platform-wide invariants: **authorization**
  (integration.invoke funnel, client denial on every family, cross-tenant read denied,
  workspace-listing isolation), **secret** non-leak (no token/credential/signing-secret in
  any DTO/event/audit row, all families), **OAuth** transparent refresh+rotation before
  invoke + revoked-token reconnect, **webhook** verify + idempotent replay + rejection +
  malformed-body tolerance, **polling** cursor persistence + replay safety, **audit**
  completeness (every invoke → correlated row with workspace/connector/capability/outcome),
  **health** vocabulary (only the shared normalized levels), and the **Copilot boundary**
  (a source scan proving no connector-family import or provider id inside `*/copilot`).
- **Report generator** `scripts/certify-integration.mjs`: `pnpm -w build && node
  application/scripts/certify-integration.mjs` runs the harness and writes the reports;
  exits non-zero on any defect (CI-style gate). Imports the compiled harness by path.

Certification result: **CERTIFIED — READY FOR REVIEW**. All 8 areas PASS; 0 orphan
capabilities · 0 undeclared handlers · 0 duplicate registrations · 0 orphan adapters.
Documented, intentional exceptions (normalized-subset asymmetries + sync-port webhook/OAuth
limits from F4.4–F4.7 — PayPal/Pipedrive structural webhook, Salesforce/LinkedIn/X/TikTok
polling-only, Xero-no-refund, X PKCE deferred) are approved design decisions, not defects.
Health vocabulary verified uniform across all 6 families; `fetch` confined to the six
`transport.ts` seams. Tests: data +7, application +15. Gate `pnpm -w typecheck lint test
build` **green**; **ZERO live provider calls** in CI (offline harness + fake transports).

---

## 22. PX.1 — Product Experience (Theme Runtime + Demo Mode)

A presentation-layer sprint on the completed platform (F1–F5). **No backend, domain,
RLS, migration, or schema change** — it makes the product feel alive without touching
how it works. The 11 PDFs in `docs/design/source/` remain the visual source of truth.
Full plan + audit: `engineering-blueprint/px-1/` (`00-product-experience-audit.md`).
Sliced into independently-shippable sub-sprints, each its own branch + PR off `main`.

**PX.1a — Theme Runtime (branch `feat/px1a-theme-runtime`, PR #76 open).** The runtime
layer over the pre-existing dual-theme token set (`packages/ui/src/tokens/colors.css`
already defined both palettes under `[data-theme]`): new `@brightloop/ui/theme` — pure
tested core (`theme.ts`: resolution + persistence + anti-FOUC script), `ThemeProvider`
(persistence, live OS tracking, instant switch), `ThemeScript` (pre-paint, in `<body>`),
accessible `ThemeToggle` (radiogroup, segmented/compact). Wired in the root layout
(default **System**), `color-scheme` added to the token blocks, `sun`/`moon`/`monitor`
icons, toggle in admin/portal/workspace shells + login + workspace settings. Additive;
gate green; `@brightloop/ui` +15 tests.

**PX.1b — Demo Mode + Realistic Dataset (branch `feat/px1b-demo-mode`, this PR).** Solves
the audit's core finding — the platform looks empty because every reader correctly
reflects an empty DB — WITHOUT compromising production integrity. Demo Mode is a **read
data-source swap** through the existing repository abstraction, centrally managed in
`apps/web/src/lib/repositories.ts`; components stay unaware (no `if (demoMode)` in any
page).

- **Gate:** `isDemoMode()` — resolves Vercel `production` → OFF (hard); then the
  `auxion_demo` **developer-toggle cookie** (`on`/`off`); then the `AUXION_DEMO_MODE=true`
  env default. Async (reads the request cookie). `demoToggleAvailable()` gates the
  dev-only toggle UI. **Never on in real production.**
- **Dataset** (`@brightloop/data/demo/`, pure + deterministic, server-only, `now`
  injected): five believable orgs (Onixus, Verdant Fields Co., Acme Construction,
  Kingston Logistics, Green Horizon) with domains, scans, findings, pipeline counts,
  risks, activity, ~14 signals (executive detail within the existing schema), and
  analytics. Ships nothing to the browser.
- **Same-port demo readers:** `DemoTransformationDashboardRepository`
  (`TransformationDashboardReader`), `DemoCoreSurfaceRepository` (`CoreSurfaceRepository`;
  writes throw `DemoModeError`), `DemoSignalsRepository` (`SignalsReadRepository`), and the
  `getAnalyticsData()` seam (`lib/analytics-data.ts`). Two new domain read ports added
  (`TransformationDashboardReader`, `SignalsReadRepository`).
- **Alive surfaces:** Console (metrics · pipeline · attention · activity · lit System
  Map), Business Scan, Activation, **Signals** (list/detail/summary/transitions), and
  **Analytics** (funnel · KPIs · event stream). Honest `DemoModeBanner` + dev toggle in
  the admin shell.
- **Security:** auth, capabilities and RLS still run; demo is read-only; writes disabled;
  demo data never leaks to production or the browser. Additive only — no schema/RLS/
  migration/business-logic change.
- **Tests:** `@brightloop/data` +25 (`demo.test.ts`), incl. a keystone test rendering demo
  data through the REAL `buildDashboardView` to a non-empty Console. Gate
  `pnpm turbo run typecheck lint test build` **green (36/36)**; **ZERO live provider/DB
  calls**. Report: `engineering-blueprint/px-1/PX.1b-demo-mode-report.md`.
- **Follow-ons:** workspace/portal surfaces, agency back-office, net-new trend-chart
  components (PX.1c), System Map hover/detail panels (PX.1d).
