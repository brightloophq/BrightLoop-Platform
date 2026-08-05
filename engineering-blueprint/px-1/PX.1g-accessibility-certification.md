# PX.1g — Accessibility Certification

**Scope.** Final a11y audit of the shared primitives (fixing there beats per-page) plus
the two app shells. Verified against the code; `file:line` evidence.

## Certified correct (no change needed)
- **Drawer** (`Drawer.tsx`) — `role="dialog"` + `aria-modal="true"` + `aria-label`
  (84-86); focus trap with Tab/Shift+Tab wrap (53-67); initial focus into panel (45);
  focus **restoration** to trigger (32, 39); Escape-to-close (48-51); scrim is a real
  `<button>` with `aria-label` (80); body-scroll lock (41-42, 71).
- **Field** (`Field.tsx`) — label `htmlFor`/`id` via `useId`; `aria-describedby`;
  `aria-invalid`; error text with `role="alert"`.
- **Accordion** — real `<button>` trigger, `aria-expanded` + `aria-controls`, panel
  `role="region"` + `aria-labelledby`, `hidden` when closed.
- **Pagination** — real `<a>`/`Link`, `aria-label="Pagination"`, `aria-current="page"`,
  disabled prev/next `aria-disabled` + `tabIndex=-1`.
- **OperationalTable** — `<th scope="col">` + sr-only `<caption>`.
- **Button** — real `<button>`; `asChild` clones an anchor (no `<a>` in `<button>`);
  `disabled`/`aria-busy` on loading; spinner `aria-hidden`.
- **Global focus ring** — `tokens/base.css:70-74` `:focus-visible { box-shadow:
  var(--ring-focus) }`; every `outline:none` is paired with a replacement (no bare
  removal).
- **Reduced motion** — global reset `tokens/base.css:122-131` collapses
  animation/transition durations; components self-guard (`SystemMap.module.css:90-94`,
  `Card.module.css:21-25`, `Toast.tsx` via `useReducedMotion`). See Motion Certification.

## Fixed in PX.1g
- **Toast severity** (`Toast.tsx`) — danger toasts now announce **assertively**
  (`role="alert"` / `aria-live="assertive"`); informational tones stay polite. Previously
  every toast was polite, so failures queued behind current speech.
- **Command-palette items** (`WorkspaceShell.tsx`) — result rows were `<a>` **without
  `href`** (mouse-only, no role, not focusable). Now real `<button type="button">`,
  keyboard- and AT-operable; native button chrome neutralized in `.paletteItem`.
- **Route error boundaries** — the new shared `RouteError` is `role="alert"` +
  `aria-live="assertive"` with a keyboard-reachable retry `<button>`; now covers admin,
  workspace **and** portal (was admin-only).
- **Active-nav semantics** — admin/portal `aria-current="page"` now tracks a
  boundary-correct match (P3-1), so the announced current item is accurate on nested
  routes.

## Documented, not changed (intentional or deferred)
- `Field` required indicator / `aria-required` (inverse "(optional)" convention).
- `Button` icon-only accessible-name is caller-enforced (all current callers pass one).
- `Alert` non-danger tones have no live role (intentional — persistent banners).
- SystemMap per-node SR detail / keyboard nav — correct as presentational `role="img"`
  with a summarizing label; only needed if nodes become interactive.
- Notifications popover `role="dialog"` without `aria-modal` (non-modal popover nuance).

## Structural a11y (unchanged, present)
Semantic landmarks and skip target: `<main id="main-content" tabIndex={-1}>` in the app
layouts; `<nav aria-label>` per shell; heading hierarchy per page. Focus is never
trapped outside a modal; Escape closes overlays in all three shells.

## Result
**CERTIFIED** at the primitive and shell level. No known keyboard-operability or
screen-reader-announcement defect remains in the audited set. Full automated axe/contrast
sweep of every authenticated route was not run in this environment (no authenticated
headless session); findings are code-level and the primitives that compose every page are
individually verified.
