# PX.1b — Demo Mode + Realistic Dataset — Engineering Report

> **Sub-sprint:** PX.1b (PX.1 · Product Experience). The keystone that makes the
> platform demoable.
> **Branch:** `feat/px1b-demo-mode` (off `origin/main` @ `01d308a`).
> **Status:** Implemented · full gate green · one PR (leave OPEN, do not merge).

---

## 1. Problem

The PX.1 audit found the platform looks empty because every authenticated reader in
`apps/web/src/lib/repositories.ts` reads live Supabase per-request with **no fallback**
— so an empty database (demos, investor previews, local/preview) renders empty states.
Demo Mode fixes this **without compromising production integrity**.

## 2. Architecture — a centralized, read-only data-source swap

Demo Mode injects seeded read models through the **existing repository abstraction**.
Components stay unaware — there is no `if (demoMode)` in any page.

- **Central gate** — `isDemoMode()` in `repositories.ts`, resolved in order:
  1. Vercel `production` → **OFF** (hard; a customer deployment can never show demo data).
  2. `auxion_demo` **developer-toggle cookie** (`on`/`off`) — a runtime switch, no redeploy.
  3. `AUXION_DEMO_MODE=true` **environment variable** — the default (dev / preview).
  Async (reads the request cookie); every caller is an async server function.
  `demoToggleAvailable()` gates the dev-only toggle UI.
- **Same-port demo readers** (swapped only inside the getters):
  - `getTransformationDashboardRepository()` → `DemoTransformationDashboardRepository`
    (`TransformationDashboardReader`).
  - `getCoreSurfaceRepository()` / `getCoreSurfaceService()` → `DemoCoreSurfaceRepository`
    (`CoreSurfaceRepository`) — reads seeded; **writes throw `DemoModeError`** (read-only).
  - `getSignalsRepository()` → `DemoSignalsRepository` (`SignalsReadRepository`).
  - Analytics via the `getAnalyticsData()` seam (`lib/analytics-data.ts`) — the page was
    refactored to read the seam, so it is source-unaware.
- **Two new domain read ports** (so both live + demo implement one shape):
  `TransformationDashboardReader`, `SignalsReadRepository`.

## 3. Dataset (`@brightloop/data/demo/`)

Pure, deterministic, **server-only** (never shipped to the browser); the only time input
is an injected `now`. Five believable organizations — **Onixus, Verdant Fields Co., Acme
Construction, Kingston Logistics, Green Horizon** — each with: 7 System-Map domains
(status + baseline/current scores), a business scan + findings, pipeline counts
(signals→learnings), risks, business health, transformation index, and an activity feed.
Plus ~14 **signals** (executive detail — severity · confidence · impact · recommended
action — expressed WITHIN the existing schema, never inventing columns) and an
**analytics** funnel + KPIs + event stream. Believable, never Lorem/`John Doe`.

## 4. Alive surfaces

- **Console** — hero metrics (health ~72, index ~75), the transformation pipeline
  (every stage moving), attention list, recent activity, and a **lit System Map** across
  five orgs.
- **Business Scan / Activation** — demo scans, domains and findings (reads).
- **Signals** — the one complete module: filterable/sortable/paginated list, summary
  counts, and detail with a realistic state-to-state transition history.
- **Analytics** — acquisition funnel, KPI tiles, and the event-activity stream.
- **Honest indicator** — a self-gating `DemoModeBanner` (amber when on; muted "off" bar
  in dev/preview) with the developer toggle; renders **nothing** in real production.

## 5. Security & integrity

Auth, capability checks and RLS still run — Demo Mode is only a read-source swap for the
caller's own scope. Writes are disabled (`DemoModeError`). Demo data is server-only and
cannot leak to production (hard `VERCEL_ENV` gate) or the browser bundle. **No schema,
RLS, migration, or business-logic change.**

## 6. Performance

Deterministic in-memory derivations (no DB round-trips in demo); the dataset is modest
and server-only, so no large JSON reaches the client. Live-mode paths are unchanged.

## 7. Gate & tests

`pnpm turbo run typecheck lint test build` → **36/36 green.** `@brightloop/data` **269
tests** (+25 in `demo.test.ts`), including a **keystone integration test** that renders
the demo data through the REAL `buildDashboardView` and asserts a non-empty, fully
populated Console (hero metrics non-null, every pipeline stage > 0, activity + attention
present). Regression: dev server compiles and serves cleanly with Demo Mode OFF (default);
no server errors.

## 8. Verification (honest)

- ✅ Unit + integration (25 tests) and the full gate.
- ✅ Regression smoke (demo OFF): clean compile, no errors, analytics refactor + async
  `isDemoMode` verified building/serving.
- ⚠️ **Authenticated demo visual** (the Console/Signals/Analytics populated in a browser)
  can't run in this sandbox: those surfaces sit behind `requireSurface("admin")` with no
  session here, and the preview tab runs hidden. Verify on the Vercel preview: set
  `AUXION_DEMO_MODE=true` in the preview env (or use the in-app dev toggle), sign in as an
  internal user, and review the Console, Signals, Business Scan, Activation and Analytics.

## 9. Follow-ons (documented, not silently omitted)

- Workspace + portal surfaces and the agency back-office (leads/clients/projects/invoices)
  — each additive on the same seam.
- Net-new trend-chart components (12-month revenue line, etc.) — **PX.1c** (no trend-chart
  primitives exist yet; SystemMap + IndexGauge are the only viz today).
- System Map hover/detail panels — **PX.1d**.
- ComingSoon transformation modules (Insights/Recommendations/Moves/… pages) are unbuilt
  product surfaces, not demo-data gaps.

---

*One PR, left OPEN. Not merged.*
