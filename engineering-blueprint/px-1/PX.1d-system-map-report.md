# PX.1d — Interactive Transformation System Map — Engineering Report

> **Sub-sprint:** PX.1d (PX.1 · Product Experience).
> **Branch:** `feat/px1d-system-map` (off `main` @ `155a4a5`, which contains
> PX.1a + PX.1b + PX.1c after #76/#77/#78 merged).
> **Status:** Implemented · full gate green · one PR (leave OPEN, do not merge).
> **Scope:** The signature interactive System Map. **Extends** the canonical
> `SystemMap` (reuses `systemMapGeometry`); no rewrite, no navigation change, no
> backend/architecture change.

---

## 1. Pre-flight (mandatory gate, verified)

- PR #77 merged (`4b7dbf5`) · PR #78 merged (`155a4a5`) — done with the owner's
  explicit go-ahead (both were CI-green + CLEAN; merge-commit convention).
- `main == origin/main` (`155a4a5`); working tree clean; PX.1a+b+c present on main;
  ENGINEERING_CONTEXT PX.1 section current. Both merges deployed to production, where
  **Demo Mode remains hard-off** (`VERCEL_ENV==="production"`) — no demo data leaked.

## 2. What shipped

**Component library** — `packages/ui/src/systemmap/`:
- `logic.ts` — pure, deterministic: `matchesQuery`, `passesFilters`, `explorerView`,
  `connectionPath` (core-bowed quadratic), `healthTone`/`riskTone`. **8 unit tests**.
- `types.ts` — data-source-agnostic `ExplorerData` / `ExplorerNode` /
  `ExplorerConnection` / `ExplorerFilters`.
- `SystemMapExplorer` — interactive nodes (**hover** summary card: health, completion,
  automation, owner, AI confidence, active signals, recommendations; **click** → detail
  panel), inter-domain **connections** (hover explains the flow + direction + health;
  animated dash under reduced-motion-safe CSS), **search** (highlights matches),
  **filter** chips (status / health / risk / automation, instant), a legend, and full
  **keyboard** node navigation (arrow-to-move, Enter/Space-to-open).
- `NodeDetailPanel` — overview · current status · business impact · **AI layer** (six
  canned, evidence-shaped actions — Summarize / Explain / Recommend / Predict / Risk /
  Next best action; no live model call) · open signals · recommendations · recent
  activity timeline · connected systems · metrics · history · next actions.
  `role="dialog"`, Esc-to-close, focus moved in on open.

**Data** — `@brightloop/data/demo` `demoSystemMap(now)`: 7 rich domain nodes + 8
connections, deterministic and server-only. Web seam `lib/system-map-data.ts` returns
the rich map in Demo Mode, a **sparse but honest** map built from live domain rows in
normal mode (no fabricated owners/signals/AI), or `null` (→ educational empty state)
when there are no domains yet.

**Route** — `/admin/system-map` (force-dynamic, `transformation.read`-gated), reached
via an "Open full map" link on the Console's existing System Map panel. **No sidebar or
navigation-hierarchy change**; the Console and all other surfaces are untouched.

## 3. Priorities coverage

Interactive nodes ✓ · click detail panel ✓ · connections + hover explain ✓ · health
visualization (icons + labels, never color-alone) ✓ · AI layer ✓ · timeline (activity +
history) ✓ · search ✓ · filters ✓ · motion (hover/selection/panel/connection, CSS-only,
reduced-motion) ✓ · responsive (map + side panel collapse to stacked) ✓ · accessibility
(keyboard, aria, focus, reduced-motion) ✓ · theme (token-only, Light/Dark/System) ✓ ·
performance (pure SVG, memoized view/geometry, deterministic/SSR-safe, server-only demo
data) ✓.

## 4. Theme · accessibility · performance

- **Theme:** every color is a `var(--…)` token; the map, hover cards, panel and
  connections all resolve in Light/Dark/System via the PX.1a runtime.
- **Accessibility:** each node is a focusable `role="button"` with a descriptive
  aria-label; arrow-key roving + Enter/Space; the panel is a `role="dialog"` with
  Esc-close and focus management; connections carry aria-labels; reduced-motion
  disables the dashed flow + transitions.
- **Performance:** no charting/graph dependency added — plain SVG; `explorerView` and
  geometry are memoized; deterministic (no `Math.random`/clock in render paths); demo
  dataset is server-only.

## 5. Gate & verification

`pnpm turbo run typecheck lint test build` → **36/36 green.** `@brightloop/ui` +8
system-map logic tests. Authenticated visual review runs on this PR's Vercel preview
with `AUXION_DEMO_MODE=true` (the route is behind `requireSurface("admin")`; the sandbox
has no internal session and its browser tab runs hidden). The map is pure SVG + tokens
and compiled clean in the production build.

## 6. Follow-ons (documented)

- Animated per-connection data-flow particles; zoom / pan + node focus; virtualization
  for very large organizations; live per-node AI wired to the reasoning engine (the AI
  layer is structured for it); org-scope switching on the map.

---

*One PR, targeting `main`, left OPEN. Not merged.*
