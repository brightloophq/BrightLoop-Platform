# Auxion — Engineering Context

> Orientation for future AI sessions and new engineers. Factual and concise.
> **Maintenance rule: update this file at the end of every completed sprint**
> (add the sprint to "Completed sprints", adjust "Next planned sprint", revise any
> convention that changed). Last updated: after **Sprint 5 (Signals)**.

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
| **5** | **Signals module** — first end-to-end vertical slice (list/create/detail, lifecycle, audit, dashboard reflection). See §10. *Implemented on `sprint/05-signals`; open as PR #4 — **not yet merged to `main`.*** |

(Prior product work — reputation CMS, leads/clients, delivery, sales, funnel,
conversations, hardening, Auxion rebrand — predates these transformation sprints
and is on `main`.)

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
  Preview deploys: **Vercel** + **Netlify** on each PR.
- **Merge**: non-fast-forward **merge commit** (`gh pr merge <n> --merge`), matching
  Sprints 3–4.1. After merge: sync `main`, delete local + remote branch, prune.
- Merged to `main`: Sprint 3 (#1), Sprint 4 (#2), Sprint 4.1 (#3). **Sprint 5 is
  implemented on `sprint/05-signals` and open as PR #4 (CI green) — not yet merged.**

---

## 12. Next planned sprint — Sprint 6: Insights

**Sprint 6 — Insights module** — the next stage of the transformation cycle
(Signal → Insight).
Build it as a vertical slice mirroring Signals (§10): reuse `TransformationService`
(`createInsight` / `transitionInsight`; machine `insight`:
generated → endorsed / dismissed), add a typed insights read adapter, replace the
`/admin/insights` placeholder with list/create/detail routes, and reuse the shared
operational primitives + motion presets. An Insight derives from a Signal + Evidence,
so the create flow links to an existing Signal; keep the dashboard read model
authoritative and reflect changes via `revalidatePath`. No schema change is expected
(the `insights` table + machine already exist from Sprint 1) — verify against the
canonical model first, exactly as Sprint 5 did.

Subsequent stages follow the same pattern: Recommendations → Approvals (human
approval gate already enforced) → Moves → Execution → Measurement → Learning.

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

**Phase 0 — canonical design-system migration (in progress on branch
`migration/phase-0-auxion-design-system`):**
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
