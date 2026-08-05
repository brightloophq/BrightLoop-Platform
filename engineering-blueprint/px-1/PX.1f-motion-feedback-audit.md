# PX.1f — Motion & Feedback Audit

> **Mandatory first deliverable** (produced before any production change, per the
> sprint brief). Grounded in a full read of the existing motion architecture, the
> shared component library, and all 36 admin routes — no invented systems, no
> redesign. PX.1f **extends** what exists; it does not replace it.

---

## 0. Executive summary — what's already strong vs. what's missing

Auxion already has a **mature, disciplined motion system**. The honest finding of
this audit is that most PX.1f priority areas are *already implemented well*, and the
sprint's value is concentrated in a small number of **real, verifiable gaps**.

**Already strong (do not rebuild — cited so PX.1f doesn't duplicate):**

- **Central motion tokens** — `packages/ui/src/motion/tokens.ts` (pure `DURATION`/
  `EASE`/`STAGGER`/`OFFSET_Y`) mirrored by CSS tokens in
  `packages/ui/src/tokens/layout.css` (`--dur-precise/orchestrate/enter` +
  `--ease-*`). Presets are the single source of truth: `presets.config.ts` (pure
  specs) → `presets.ts` (GSAP builders). Components never pick their own timing.
- **Reduced motion** — covered at **three** layers: a **global** CSS reset
  (`tokens/base.css:122-131`, collapses all animation/transition to ~0), per-component
  `@media` guards (Card, Progress, charts, SystemMap, AI), and JS (`useReducedMotion`
  + GSAP snapping in every preset). This is belt-and-suspenders and already real.
- **Focus** — global `:focus-visible` ring (`base.css:70`) on every native control;
  explicit component rings on SystemMap nodes/chips and AI actions.
- **Charts** — custom SVG with token-driven draw-in **gated behind
  `prefers-reduced-motion: no-preference`**; identity also via SR-only tables + legend.
  No misleading continuous replay.
- **Toast** — one system (`ToastProvider`/`useToast`), `role="status"` +
  `aria-live="polite"`, reduced-motion aware. No competing layer needed.
- **AI feedback (PX.1e)** — `AiActionBar`/`AiResultPanel` already model idle · busy ·
  success · denied · unavailable/future-phase · error · demo, with a spinner,
  `aria-busy`, duplicate-submit guard, and `aria-live`.
- **Dashboard loading** — internal `Suspense` + structured `DashboardSkeleton`
  (`aria-busy`) + inline `DashboardError`/`Unauthorized`.

**The real gaps PX.1f fixes (everything below is scoped to these):**

1. **No route-level `loading.tsx` anywhere** — the 9 CMS/ops routes are plain async
   server components with **no Suspense and no skeleton**, so navigation blocks with
   zero route-specific feedback. *(Priority 1 & 2 — headline fix.)*
2. **No route-level `error.tsx` anywhere** — an uncaught page error has no graceful,
   themed boundary. *(Priority 7.)*
3. **`Button` loading is functional-only** — `loading` disables + sets `aria-busy`
   (prevents duplicate submit) but shows **no visible spinner**. *(Priority 3 & 9.)*
4. **`Drawer` has no motion at all** — appears/vanishes instantly; the existing
   `useDrawerSlide` hook is unused. *(Priority 8.)*
5. **A few hardcoded overlay/tint colors** bypass the token system (theme risk).
   *(Priority 13.)*
6. **`MetricCard` hover `translateY` is unguarded** for reduced motion (the near-
   identical `Card` guards its own). *(Priority 12.)*
7. **One silent-failure feedback gap** — `conversations/InternalNotes.tsx` swallows a
   failed submit with no user-visible error. *(Priority 7.)*

---

## 1. Route loading & error states (Priority 1, 2, 7)

Confirmed: **zero `loading.tsx` and zero `error.tsx`** under `apps/web/src/app/admin/`.
Two architectures exist:

| Class | Routes | Loading today | Verdict |
|---|---|---|---|
| **Transformation** | dashboard, business-scan, activation, signals | Internal `Suspense` + `SkeletonBlock` fallback + `MotionProvider` | **Already good** — a route `loading.tsx` would double-skeleton. **Leave as-is.** |
| **CMS / ops** | analytics, invoices, leads, proposals, contracts, automation, clients, projects, conversations | **None** — server render blocks; user sees the *previous* page until data resolves | **Fix** — add structured `loading.tsx`. |
| **ComingSoon stubs** | insights, recommendations, approvals, settings | Static `EmptyState` (no data) | No loading needed. |
| **Specialized canvas** | system-map | None (full-bleed `SystemMapExplorer`) | Lower priority; canvas skeleton optional. |

| # | Route/component | Current behavior | User impact | Recommended correction | Priority | Owning primitive/token |
|---|---|---|---|---|---|---|
| 1.1 | 9 CMS routes | No route loading UI; navigation blocks on server render | On a slow query the app looks frozen — no feedback that a nav happened | Add `loading.tsx` rendering a **structured, layout-matching** skeleton in the real shell chrome | **P1** | new `PageSkeleton` (@brightloop/ui) + `AdminRouteSkeleton` (app) |
| 1.2 | All admin routes | No `error.tsx`; a thrown page error bubbles unstyled | A data failure yields a broken/blank screen, no recovery path | Add a segment-level `error.tsx` at `/admin` — themed, accessible, `reset()` retry | **P1** | new `AdminRouteError` (app) |
| 1.3 | `conversations/InternalNotes.tsx:57-68` | On a non-ok response nothing happens (no `else`) — silent failure | User believes a note saved when it didn't | Surface a `useToast` error (reuse the one toast system) | **P2** | `useToast` |

---

## 2. Motion architecture & central tokens (Priority — Motion Architecture)

**Finding:** the central system already exists and is correct. No new animation
system, no new dependency (GSAP `^3.12` + `@gsap/react` already present), no scattered
raw durations (a repo-wide grep found **none** in page/component TS/TSX outside a
debounce comment).

- **Correction:** the only missing *primitive* is a **composed skeleton** — today
  only the atomic `SkeletonBlock` exists, so every loading surface hand-assembles
  blocks. PX.1f adds `PageSkeleton` (variants: `table` · `grid` · `analytics` ·
  `detail` · `list`) built purely from `SkeletonBlock`, so all route loading looks
  identical product-wide and reserves the real layout's dimensions (no content-jump).
- **Do NOT** add a parallel "semantic duration dictionary" — the preset catalogue
  (`PRESET`) is already the semantic layer (`drawerOpen`, `modalEnter`, `toastEnter`,
  `pageTransition`, …). Adding another would violate "no second animation system."

---

## 3. Interaction-state standardization (Priority 3)

Per-component sweep of `packages/ui`. Legend: ✓ present · — n/a · **✗ gap**.

| Component | hover | focus-visible | active/press | selected | disabled | loading | tokens | reduced-motion | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Button | ✓ | global | ✓ (primary only) | — | ✓ | **✗ no visual** | ✓ | global | `loading` disables + `aria-busy` but no spinner |
| Card | ✓ (interactive) | — (container) | — | — | — | — | ✓ | ✓ own guard | correct: hover-lift only on `.interactive` |
| MetricCard | ✓ (interactive) | — (link owns) | — | — | — | — | ✓ | **✗ unguarded translateY** | Card guards the identical transform; this doesn't |
| Drawer | **✗ none** | global only | **✗** | — | — | — | ✓* | — (no motion) | `.close`/`.scrim` have no hover/focus; **no motion**; hardcoded scrim |
| Toast | — | — | — | — | — | — | ✓ | ✓ (JS) | one system; good |
| Pagination | ✓ | global | — | ✓ (`.current`) | ✓ | — | ✓ | global | fine |
| Field | ✓ | global | — | — | ✓ | — | ✓ (`.invalid`) | global | error via `.invalid` + `.error` (not animation-only) |
| Accordion | ✓ | global | — | ✓ (`.open`) | — | — | ✓ | global | fine |
| OperationalTable | ✓ + `:focus-within` | — | — | **✗ no selected-row** | — | — | ✓ | global | keyboard-reachable row highlight is good |
| Charts | ✓ (marks) | **✗ hover-only** | — | — | — | — | ✓ | ✓ gated | keyboard identity via SR table/legend, acceptable |
| SystemMap | ✓ | ✓ explicit | — | ✓ | — | — | ✓ | ✓ gated | strongest in the set |
| AI action bar | ✓ | ✓ explicit | — | ✓ (`data-active`) | ✓ | ✓ spinner | ✓ | ✓ gated | reference implementation |

**Corrections (P2/P3):** Button visible loading spinner; MetricCard reduced-motion
guard; Drawer `.close`/`.scrim` hover + focus states. Everything else is acceptable —
native controls inherit the global focus ring, and non-focusable containers correctly
have no focus style.

---

## 4. KPI & chart motion (Priority 4)

**Already correct.** Draw-in animations (`.animLine` stroke-dashoffset, `.animGrow`
bar `scaleY`, `.animFade`) run once on entry, are token-timed, and are gated behind
`prefers-reduced-motion: no-preference`; Funnel/Sparkline are static; final values are
always readable (SR table + legend). Hover changes opacity only (no layout shift). **No
change required** beyond confirming the reduced-motion test coverage (Priority 12).

---

## 5. System Map motion (Priority 5)

**Already correct (PX.1d).** Node hover/focus/selection scale, explicit focus ring,
connection `data-active` emphasis, and the `.connectionFlow` marching-ants are **gated
behind `no-preference`**. Filters update immediately. **No change required.**

---

## 6. AI action feedback (Priority 6)

**Already correct (PX.1e).** `AiActionBar` computes `busy`, disables all actions +
`aria-busy` while running, shows a spinner on the active action; `AiResultPanel` keeps
advisory vs. executable visibly distinct, renders honest denied/unavailable/error, has
`aria-live`, and never fakes streaming. **No change required** — PX.1f only verifies
state-transition tests exist.

---

## 7. Success / error / confirmation (Priority 7)

One toast system (reuse it — do not add a second). Action-feedback consistency across
routes is **mixed**: strong in `SignalActions` (toasts), `StageControl`
(`role="alert"`), the `New*Form`s (Alert on error). The single confirmed defect is the
silent failure in `InternalNotes.tsx` (see 1.3). Destructive actions already route
through explicit confirm/approval flows (AI executables, lifecycle stage controls).

---

## 8. Dialogs, drawers, panels (Priority 8)

`Drawer` accessibility is **already solid**: focus trap, Escape, scrim-click close,
focus restore, body-scroll lock. The gap is purely **motion + micro-states**: no
slide/fade entrance, no `.close`/`.scrim` hover/focus. Because the drawer *unmounts*
on close (`if (!open) return null`), the safe fix is a **CSS entrance animation**
(slide + scrim fade) — no change to the focus/scroll/unmount logic, and the global
reduced-motion reset neutralizes it automatically.

---

## 9. Form feedback (Priority 9)

Forms already use `pending` states with loading buttons ("Creating…", "Adding…") and
duplicate-submit guards; validation surfaces via `.invalid`/`.error`/`Alert` (never
animation-only); no aggressive shake. The Button visible-loading fix (3) strengthens
every pending button at once.

---

## 10. Empty / loading / populated transitions (Priority 10)

Empty states (`EmptyState`) are educational and stable; Demo Mode is clearly labeled
(PX.1b) and never fabricates in production. Adding structured route skeletons (1.1)
closes the last flashing/jump risk on the CMS routes (blank → populated today).

---

## 11–14. Responsive · Reduced-motion · Theme · Performance

- **Responsive (P11):** transforms are small (`OFFSET_Y=12`, translateY ≤ 2px), drawer
  is `min(380px, 90vw)`; `useDrawerSlide` is a desktop no-op. New skeletons use
  fluid widths (%). Low risk; verify no transform-driven horizontal overflow.
- **Reduced-motion (P12):** already triple-covered. PX.1f **adds the missing local
  guard on MetricCard** and **adds explicit tests** (SkeletonBlock static, PageSkeleton
  static, token `shouldAnimate`) so the behavior is *proven*, not merely asserted.
- **Theme (P13):** three hardcoded color spots bypass tokens →
  `Drawer.module.css:5` & `Navbar.module.css:176` (`rgba(6,10,19,…)` scrim),
  `Alert.module.css` (rgba success/warning/danger tints, while `.info` correctly uses
  `color-mix`), `PlaceholderNotice.module.css` (amber rgba). Fix: centralize a `--scrim`
  token; tokenize the tints via `color-mix` to match `.info`.
- **Performance/hydration (P14):** additions are **server components** (`loading.tsx`,
  `PageSkeleton`) and CSS — **no new client boundaries, no new dependency**. Skeleton
  DOM is bounded (≤ ~10 blocks/route). `error.tsx` is the only new client component
  (required by Next). Expected bundle delta ≈ 0.

---

## 15. What PX.1f builds (scoped to the gaps above)

1. **`PageSkeleton`** (@brightloop/ui) — composed, layout-matching route skeleton
   (5 variants) built on `SkeletonBlock`; `aria-busy` live region.
2. **Route `loading.tsx`** for the 9 CMS routes via an app-level `AdminRouteSkeleton`
   (real shell chrome + matched variant).
3. **`error.tsx`** — segment-level themed, accessible, retry-capable boundary.
4. **Button visible loading** spinner (keeps the existing disable + `aria-busy`).
5. **Drawer entrance motion** (CSS) + `.close`/`.scrim` hover/focus states.
6. **Token hygiene** — `--scrim` token; tokenize Alert & PlaceholderNotice tints.
7. **MetricCard** reduced-motion guard.
8. **InternalNotes** error feedback via `useToast`.
9. **Tests** — token consistency, reduced-motion, skeleton structure, Button loading.
10. **Docs** — this audit + engineering report + reduced-motion/a11y/perf notes.

*Nothing outside these gaps is built. No backend, no domain, no schema, no new
dependency, no second toast/animation system, no redesign.*
