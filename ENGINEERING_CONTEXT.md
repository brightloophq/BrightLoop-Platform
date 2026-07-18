# Auxion — Engineering Context

> Orientation for future AI sessions and new engineers. Factual and concise.
> **Maintenance rule: update this file at the end of every completed sprint**
> (add the sprint to "Completed sprints", adjust "Next planned sprint", revise any
> convention that changed). Last updated: after **Sprint 5 (Signals)** was merged
> to `main` (PR #4, merge commit `bd20276`).

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
| **5** | **Signals module** — first end-to-end vertical slice (list/create/detail, lifecycle, audit, dashboard reflection). See §10. *Merged to `main` via **PR #4** (non-fast-forward merge commit `bd20276`); all required CI green on `main`, Vercel production deployment succeeded.* |

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
- Merged to `main`: Sprint 3 (#1), Sprint 4 (#2), Sprint 4.1 (#3), **Sprint 5 (#4)**.
  Sprint 5 merged via non-fast-forward merge commit **`bd20276`** (merged
  2026-07-18); the `sprint/05-signals` branch was deleted (local + remote) and
  pruned. Post-merge `main` CI (`verify` · `db-verify` · `secret-scan`) all green;
  Vercel production deployment for `bd20276` succeeded.

---

## 12. Next planned sprint — Sprint 6: Insights

**Sprint 6 — Insights module** — the next stage of the transformation cycle
(Signal → Insight). **Status: not started** (Sprint 5 is now merged; no Sprint 6
branch or work exists yet).
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
