# PX.1g — Theme Certification (Light / Dark / System)

**Scope.** Certify that every surface adapts correctly across Light, Dark and System,
and that no inappropriate hardcoded visual color remains outside the token layer.

## Token architecture (unchanged, certified sound)
Themes are driven by CSS custom properties in `packages/ui/src/tokens/*.css`:
`colors.css` (light `:root` + `[data-theme="dark"]`, plus a System path), `base.css`,
`effects.css`, `typography.css`, `responsive.css`. Semantic aliases (`--bg-base`,
`--bg-raised`, `--surface-card`, `--text-primary`, `--positive`/`--caution`/`--critical`,
`--signal`, `--scrim`, `--ring-focus`, …) resolve in both modes. Two node-level hygiene
tests already lock this: `tokens/canon-tokens.test.ts` (canonical tokens resolve in
light+dark; bans legacy teal/Sora across `packages/ui` CSS) and
`tokens/overlay-tokens.test.ts` (scrim + status tints must be token-based).

## Hardcoded-color sweep (this sprint)
A full sweep of `.module.css` and `.tsx` under `apps/web/src` and `packages/ui/src` for
hex / rgb / rgba / hsl / named colors, excluding legitimate cases (token **definitions**,
chart geometry, brand-logo hexes, shadow/mask alpha, `transparent`/`currentColor`),
found **three** real theming offenders — all fixed:

| File:line | Was | Now |
|---|---|---|
| `packages/ui/src/components/Navbar.module.css:19` | `rgba(251,252,253,0.82)` (near-white glass, never flipped) | `color-mix(in srgb, var(--bg-raised) 82%, transparent)` |
| `apps/web/src/app/admin/cms.module.css:119` | `rgba(22,179,100,0.25)` (success-green) | `color-mix(in srgb, var(--positive) 25%, transparent)` |
| `apps/web/src/app/admin/automation/page.tsx:71` | inline `rgba(239,68,68,0.3)` (danger-red) | `color-mix(in srgb, var(--critical) 30%, transparent)` |

**Correctly excluded (not defects):** `admin.module.css:313` theme-independent canvas
scrim; box-shadow `rgba(0,0,0,…)`; `dashboard.module.css` `#000` inside a `mask-image`
gradient (alpha geometry); `Logo.tsx` fixed brand hexes. Token-backed `var(--x, #fallback)`
fallbacks in a handful of route CSS/JSX files are not live defects (the token drives
normally) and were left as-is.

## Regression guard added
`overlay-tokens.test.ts` now asserts the Navbar scrolled glass uses `color-mix(in srgb,
var(--bg-raised) …)` and contains no `rgba(251,252,253…)` literal — the near-white
regression cannot return silently.

## Live verification
Dev server, public home. Computed background of a probe element set to the navbar glass
expression, sampled under both themes:

- **Light** (`--bg-raised #FBFAF8`): glass = `srgb(0.984 0.980 0.973 / 0.82)` —
  indistinguishable from the previous near-white literal.
- **Dark** (`--bg-raised #14161B`): glass = `srgb(0.078 0.086 0.106 / 0.82)` — now a
  dark glass. The defect (light navbar on a dark page) is eliminated.

No console errors on the public surface. The PX.1f status-tint tokenization (Alert,
PlaceholderNotice) and `--scrim` (Drawer, Navbar backdrop) remain in place and tested.

## Public landing-page toggle exposure (follow-up)
A review found the theme **control** was absent from the public marketing Navbar (the
runtime was active via the root `ThemeProvider`/`ThemeScript`, but no `ThemeToggle` was
composed into `packages/ui/src/components/Navbar.tsx`). Fixed by adding the **existing**
`ThemeToggle` — compact in the desktop actions (before the CTA, hidden <1024px) and
segmented in the mobile drawer under an "Appearance" label. No second theme
implementation, provider, or runtime; tokens only; no hardcoded colors (asserted by
`Navbar.theme.test.ts`). The Navbar glass, being token-based, keeps the toggle legible in
both scrolled and unscrolled states, Light and Dark.

**Live verification (dev server, public home):**
- Toggle present in the desktop Navbar as an ARIA `radiogroup` (Light / Dark / System,
  "System … currently light").
- Stored preference `auxion-theme=dark` applied by `ThemeScript` **before paint** on
  reload → `data-theme=dark`, header + body dark (`rgb(11,12,15)`); persistence + anti-
  FOUC confirmed on the public surface.
- 0px horizontal overflow at 1280px and 375px; desktop toggle `display:none` at 375px
  (mobile control is the drawer's segmented toggle); no console errors.
- Interactive click-to-switch and the toggle's `aria-checked` reflecting the saved choice
  require React hydration, which does not run in this hidden-pane environment (documented
  limitation); the pre-paint `ThemeScript` path — the anti-FOUC guarantee — is
  hydration-independent and verified above.

## Result
**CERTIFIED.** With the three color fixes, no inappropriate hardcoded visual color
remains in the audited trees; all surface, text, border, status and overlay colors
resolve through theme tokens and flip correctly across Light / Dark / System. The
Light/Dark/System control is now reachable on **every** surface — public, auth, and
authenticated — via the single shared runtime. Full-visual screenshot matrix across every
route was not captured (see Visual Evidence Index — Browser pane not displayable in this
environment); changes are token-level and verified via computed values + the hygiene
tests.
