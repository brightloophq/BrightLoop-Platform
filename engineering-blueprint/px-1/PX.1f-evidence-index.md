# PX.1f — Before/After Evidence Index

> **Honesty note (required by the brief).** The admin surface is auth-gated
> (`requireSurface("admin")`) and the new loading states are *transient* (visible only
> while a server component's data resolves). Reliable interactive screenshot capture
> across Light/Dark/System × desktop/mobile × reduced-motion was **not** performed in
> this build environment. Correctness is instead evidenced by the passing gate
> (typecheck · lint · test · build, 27/27) and the structural + CSS-content tests. The
> **Vercel preview attached to the PR** is the surface for a human reviewer's visual
> pass. Nothing below claims a screenshot that was not taken.

---

## How to review visually (on the PR's Vercel preview)

| Change | Where | Before | After |
|---|---|---|---|
| Route loading | Navigate to **/admin/invoices**, **/leads**, **/proposals**, **/contracts**, **/automation**, **/clients**, **/projects**, **/conversations** (throttle network to see it) | Previous page stays frozen until data resolves — no route feedback | Instant structured skeleton (topbar + head + Card-row placeholders) that matches the final layout; no content-jump when data lands |
| Route loading (analytics) | **/admin/analytics** | Same freeze | Skeleton with a 4-up KPI row + panel placeholders |
| Route error | Force a page error on any admin route | Unstyled/blank failure | Themed `role="alert"` panel + "Try again" (`reset()`); no stack/message leak |
| Button pending | Any async submit (e.g. **/admin/conversations** → add internal note) | Button only greyed out | Visible spinner + greyed + `aria-busy`; still blocks duplicate submit |
| Note failure | **/admin/conversations** add-note when it fails | **Silent** — looked like success | Error toast "Couldn't add note — please try again" |
| Drawer | Any drawer trigger, mobile width | Appeared instantly | Slides in from its edge; scrim fades; `.close` has hover + focus ring |
| MetricCard | Hover an interactive metric card with **reduced motion on** | Card lifted (translateY) despite reduce | No lift under reduce (matches Card) |
| Theme tint | Compare **Alert** success/warning/danger + **PlaceholderNotice** in Light vs Dark | Hardcoded rgba tints (theme-static) | `color-mix` over semantic tokens — consistent across themes |

## Reduced-motion check
With `prefers-reduced-motion: reduce` set at the OS level: skeleton pulse is static, the
Button spinner is a static ring, the Drawer snaps in, MetricCard/Card do not lift, and
chart draw-in does not run. Enforced by the global reset (`tokens/base.css`) + component
guards; asserted by `packages/ui/src/motion/reduced-motion.test.ts`.

## Automated evidence (in lieu of screenshots)
- **Gate:** `pnpm turbo run typecheck lint test build` → **27/27 successful**.
- **UI tests:** `@brightloop/ui` **108 passed** (incl. PX.1f +20).
- **Structure:** `PageSkeleton.plan.test.ts` proves each variant's shape.
- **Reduced motion:** `motion/reduced-motion.test.ts` reads the shipped CSS and proves
  every guard exists.
- **Theme tokens:** `tokens/overlay-tokens.test.ts` proves no hardcoded scrim/tint
  colors remain.
