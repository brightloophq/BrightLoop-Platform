# PX.1f — Motion & Feedback Engineering Report

> A focused Product Experience sprint. **Not** a backend sprint, a new-capability
> sprint, or a redesign. PX.1f **extends** Auxion's existing (mature) motion system to
> close the specific gaps found in the audit
> (`PX.1f-motion-feedback-audit.md`) — chiefly the absence of route-level loading and
> error states — while preserving the established design language.

---

## 1. Scope discipline — what this sprint deliberately did NOT do

The audit's honest finding was that **most** motion/feedback priorities were already
implemented well (central tokens + presets, a triple-layer reduced-motion strategy,
token-driven charts, one accessible toast system, the PX.1e AI state machine, the
dashboard's Suspense skeleton). So PX.1f is **small and surgical**:

- No new animation library or dependency (GSAP `^3.12` already present; **zero** new
  deps).
- No second toast/notification system, no second motion system.
- No backend, domain, schema, migration, or generated-type change.
- No navigation redesign, no route-hierarchy change, no module rename.
- No fabricated streaming/completion; the PX.1e AI state machine is untouched.

---

## 2. What shipped

### 2.1 Structured route loading (Priority 1, 2, 10) — the headline
- **`PageSkeleton`** (`packages/ui/src/components/PageSkeleton.tsx` + `.plan.ts` +
  `.module.css`) — the one composed, **layout-matching** route skeleton, built purely
  from `SkeletonBlock`. Five variants (`table` · `grid` · `analytics` · `detail` ·
  `list`); shape comes from the **pure** `pageSkeletonPlan()` so structure is
  unit-tested. It is an `aria-busy`/`aria-live` region with an `sr-only` label; visual
  blocks are `aria-hidden`.
- **`AdminRouteSkeleton`** (`apps/web/.../admin/_components/`) — reproduces the real
  admin chrome (topbar + content box) around `PageSkeleton`. Server component; no
  client boundary.
- **9 route `loading.tsx`** added to the CMS/ops surfaces that previously had **no**
  loading state (analytics · invoices · leads · proposals · contracts · automation ·
  clients · projects · conversations). Each is a two-line host picking the title +
  variant that matches that route. The Transformation routes (dashboard, business-scan,
  activation, signals) already stream via internal `Suspense` and were **left as-is**
  (a route `loading.tsx` there would double-skeleton).

### 2.2 Route error boundary (Priority 7)
- **`apps/web/.../admin/error.tsx`** (+ `error.module.css`) — a segment-level, themed,
  accessible (`role="alert"`, `aria-live="assertive"`) error boundary with a `reset()`
  retry. It never leaks the raw error message, stack, or any provider payload — only a
  plain-English explanation.

### 2.3 Interaction-state & feedback refinements (Priority 3, 8, 9)
- **`Button`** now shows a **visible loading spinner** while `loading` (it already
  disabled + set `aria-busy`; now "working…" is legible, not state-only). The spinner
  is a CSS animation, so the global reduced-motion reset makes it a static ring.
- **`Drawer`** gained a CSS **entrance** (panel slide + scrim fade) — it previously
  appeared instantly, and its `useDrawerSlide` hook was unused. Because the Drawer
  unmounts on close, this is entrance-only and touches **none** of the focus-trap /
  scroll-lock / restore logic. Added `.close` hover + `:focus-visible`; scrim keeps its
  behavior.
- **`MetricCard`** now guards its hover `translateY` under `prefers-reduced-motion`
  (matching `Card`, which already did).
- **`conversations/InternalNotes`** no longer fails silently — a failed note submit now
  raises an error toast (reusing the one toast system), and the submit button uses the
  new Button loading affordance.

### 2.4 Token hygiene (Priority 13)
- New semantic **`--scrim`** token (`tokens/effects.css`); `Drawer` and `Navbar`
  scrims now reference it instead of a duplicated `rgba(6,10,19,…)` literal.
- **`Alert`** success/warning/danger tints and **`PlaceholderNotice`**'s amber tint are
  now `color-mix(in srgb, var(--token) …)` — matching Alert's already-correct `.info`
  tint. No hardcoded status colors remain in these components.

---

## 3. Testing (Priority 12 + brief)

All tests are **pure node** (the house style — no jsdom/RTL in the repo). **+20 tests**
in `@brightloop/ui`, `108 total green`:

- **`PageSkeleton.plan.test.ts` (9)** — asserts the structure of every variant
  (toolbar+rows, N cards, 4-up KPI + panels, two-column detail, N rows), count
  clamping (≥1), and that every block has an explicit height + a `var(--radius-*)`
  radius (the no-content-jump / token contract).
- **`motion/reduced-motion.test.ts` (7)** — reads the shipped CSS and asserts the
  guards genuinely exist: the global reset collapses animation **and** transition
  duration on `*`; SkeletonBlock stops its pulse; MetricCard + Card drop the hover
  lift; charts gate draw-in behind `no-preference`; the Button spinner uses a CSS
  animation (so the global reset neutralizes it). Plus the `shouldAnimate` JS gate.
- **`tokens/overlay-tokens.test.ts` (4)** — locks the token hygiene: `--scrim` is
  defined and used by Drawer/Navbar (no raw scrim rgba); Alert/PlaceholderNotice tints
  are `color-mix` over tokens (old literals are asserted absent).

These directly satisfy the brief's "reduced-motion behavior", "skeleton structure",
"loading-state", "theme compatibility", and "no hardcoded color" test asks — with
mechanisms, not claims. No live AI/provider calls in CI (unchanged).

---

## 4. Accessibility notes

- **Loading**: `PageSkeleton` is a single `role="status"` `aria-busy` live region with
  one `sr-only` "Loading …" label; the shape blocks are `aria-hidden`, so screen
  readers hear the state once, not a wall of shapes.
- **Errors**: the boundary is `role="alert"` / `aria-live="assertive"` with a keyboard-
  reachable retry Button (inherits the global `:focus-visible` ring).
- **Feedback is never color-only**: Button loading pairs the spinner with `disabled` +
  `aria-busy`; toasts carry text + `role="status"`; Alerts pair tone with text/title.
- **Focus** unchanged and intact: Drawer's focus trap/Escape/restore untouched; new
  Drawer `.close` has an explicit focus ring; no motion delays focus.

## 5. Reduced-motion report

Reduced motion is enforced at **three layers**, now with the MetricCard gap closed and
the behavior **tested**: (1) global CSS reset (`tokens/base.css`) collapses all
animation/transition to ~0; (2) per-component `@media` guards (Card, **MetricCard
(new)**, Progress, charts, SystemMap, AI, SkeletonBlock); (3) JS (`useReducedMotion` +
GSAP snapping in every preset, `shouldAnimate`). Every PX.1f animation (Button spinner,
Drawer entrance, skeleton pulse) is transform/opacity only and is neutralized under
reduce by layer (1). See `motion/reduced-motion.test.ts`.

## 6. Performance / hydration report

- **No new dependency**; expected bundle delta ≈ 0.
- New surfaces are **server components + CSS**: `PageSkeleton`, `AdminRouteSkeleton`,
  and all 9 `loading.tsx` add **no client boundary**. The only new client component is
  `admin/error.tsx` (Next requires error boundaries to be client) — tiny and lazy.
- Skeleton DOM is bounded (≤ ~10 `SkeletonBlock`s per route; a single pulse keyframe).
- No new timers/observers; the Drawer/Button animations are CSS (compositor-friendly:
  opacity + transform only), so no layout thrash.
- Hydration is stable — loading UIs render server-side; no client-only branching in the
  skeleton path.

## 7. Files

**Added (17):** `PageSkeleton.tsx` · `PageSkeleton.plan.ts` · `PageSkeleton.module.css`
· `PageSkeleton.plan.test.ts` · `motion/reduced-motion.test.ts` ·
`tokens/overlay-tokens.test.ts` · `admin/_components/AdminRouteSkeleton.tsx` ·
`admin/error.tsx` · `admin/error.module.css` · 9× `admin/*/loading.tsx` · this report +
the audit.

**Modified (10):** `packages/ui/src/index.ts` · `Button.tsx` · `Button.module.css` ·
`MetricCard.module.css` · `Drawer.module.css` · `Navbar.module.css` ·
`Alert.module.css` · `PlaceholderNotice.module.css` · `tokens/effects.css` ·
`admin/conversations/InternalNotes.tsx` · `ENGINEERING_CONTEXT.md`.

## 8. Known limitations / honest notes

- **Visual validation**: the CI Vercel preview builds the branch, but interactive
  before/after capture across Light/Dark/System × desktop/mobile × reduced-motion was
  **not** performed in this environment. The changes are transform/opacity-only, token-
  driven, and covered by structural + CSS-content tests; a reviewer should still eyeball
  the previews. This report does not claim screenshots that were not taken.
- **`system-map`** (specialized full-bleed canvas) was intentionally **not** given a
  route skeleton — a generic skeleton would misrepresent its layout. Follow-on if
  desired.
- **`table` / `grid` / `detail`** PageSkeleton variants are shipped + tested but the
  current 9 routes use `list`/`analytics`; the others are the reusable vocabulary for
  future card-grid / master-detail surfaces.
- Drawer **exit** stays instant (the component unmounts on close); a full enter/exit
  would require keeping it mounted during exit — out of scope, and reduced-motion users
  get instant anyway.
