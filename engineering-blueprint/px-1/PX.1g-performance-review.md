# PX.1g — Performance Review

**Scope.** Check for PX-level regressions introduced by PX.1g; no speculative
architecture rewrites.

## New dependencies
**None.** PX.1g adds zero packages. `PortalShell` reuses the existing GSAP
`useDrawerSlide` (already shipped for the admin shell); `RouteError`, loading skeletons
and the Toast/palette fixes use only existing primitives.

## Client-component footprint
- `PortalShell.tsx` — one new client component. It replaces markup that previously lived
  in the **server** `portal/layout.tsx`. This moves the portal sidebar to a client
  boundary (necessary for the mobile drawer state), mirroring the admin `AppSidebar`
  which is already a client component. Net: one small client shell, same pattern as
  admin — not a new runtime cost class.
- `workspace/error.tsx`, `portal/error.tsx`, refactored `admin/error.tsx` — client
  components by Next.js requirement (error boundaries must be client). Each is a thin
  wrapper over the shared `RouteError`.
- `workspace/loading.tsx`, `portal/loading.tsx` — **server** components (no client
  boundary), rendered only during navigation.
- No new polling, no new data fetching, no new effches. The Toast and command-palette
  changes are attribute/element swaps with no added render work.

## Build output (production build, this branch)
`pnpm turbo run build` succeeds. First-load JS shared by all routes ≈ **103 kB**
(unchanged class); workspace routes ≈ 203 kB first-load (unchanged). No route showed a
first-load regression attributable to PX.1g. The added `loading.tsx`/`error.tsx` files
are tiny and lazily used.

## Skeleton / animation runtime
Route skeletons compose only `SkeletonBlock` (a single transform/opacity pulse that goes
static under `prefers-reduced-motion`). A **single** cascading `loading.tsx` per shell
root (not one per route) keeps the added skeleton DOM minimal. The drawer slide is the
one GSAP piece, reused, not duplicated.

## Duplication removed
`admin/error.module.css` deleted; the three error boundaries now share one `RouteError`
primitive + one CSS module — less CSS, one place to maintain.

## Result
**No measurable or obvious PX-level regression.** Zero new dependencies, one small
client shell (matching an existing pattern), server-rendered loading, and a net
reduction in duplicated error CSS. Deep runtime profiling (INP/LCP on authenticated
routes) was not run in this environment; nothing in the diff suggests a regression there.
