# PX.1a — Theme Runtime — Engineering Report

> **Sub-sprint:** PX.1a (first slice of PX.1 · Product Experience).
> **Branch:** `feat/px1a-theme-runtime` (off `origin/main` @ `01d308a`).
> **Scope:** The runtime layer for a complete, application-wide Light / Dark /
> System theme system. Additive only — no backend, domain, RLS, or architecture
> change; no redesign. Builds on the dual-theme token set that already exists in
> `packages/ui/src/tokens/colors.css`.
> **Status:** Implemented · full gate green · awaiting approval (not committed).

---

## 1. What shipped

A theme runtime over the pre-existing (but previously unwired) dual-theme tokens.

**New — `@brightloop/ui` theme module (`packages/ui/src/theme/`):**
- `theme.ts` — pure, framework-free core (no React, no DOM at import): `ThemeChoice`
  / `ResolvedTheme` types, `resolveTheme`, `isThemeChoice`, `normalizeChoice`,
  `buildThemeScript`/`THEME_SCRIPT`, and the constants (`THEME_STORAGE_KEY`,
  `DEFAULT_THEME_CHOICE = "system"`). Unit-tested.
- `theme.test.ts` — **15 tests**: type guard, resolution (system↔OS), corrupted-value
  fallback, and the FOUC script EXECUTED in a fake DOM sandbox (stored light/dark/
  system, unset, and localStorage-throws-fails-safe-to-light).
- `ThemeScript.tsx` — the anti-FOUC inline `<script>` (server component). Stamps the
  resolved `data-theme` on `<html>` before first paint.
- `ThemeProvider.tsx` — `"use client"` context: persistence (localStorage), live OS
  tracking (`matchMedia` change listener so "System" follows the OS with no reload),
  instant switching, and `useTheme()`. Hydration-safe (initial render = default, a
  mount effect reconciles; the visible theme lives in the `<html>` attribute the
  script already set, so reconciliation is invisible).
- `ThemeToggle.tsx` + `.module.css` — the Light / Dark / System control. ARIA
  `radiogroup` with roving tabindex + arrow-key navigation, `aria-checked` +
  filled-pill selection (not color-alone), always-visible focus ring, tooltips,
  CSS-only transitions (reduced-motion safe). `segmented` (icon+label) and `compact`
  (icon-only) variants. "System" shows a live "currently light/dark" hint.

**Wiring:**
- `apps/web/src/app/layout.tsx` — `<ThemeScript />` at the top of `<body>` (safer than
  a hand-rendered `<head>` under the App Router Metadata API); `<ThemeProvider>` wraps
  the app; `suppressHydrationWarning` on `<html>`. Resolved the doc conflict: default
  is **System** (SSR fallback = CSS `:root` light).
- `packages/ui/src/tokens/colors.css` — added `color-scheme: light|dark` to the theme
  blocks so native controls / scrollbars follow the theme.
- `packages/ui/src/components/Icon.tsx` — registered `sun`, `moon`, `monitor`.
- Toggle placements: admin sidebar foot ("Appearance" row) + admin mobile bar
  (compact); portal sidebar foot; workspace topbar (compact); workspace
  Settings → Appearance section; login page (compact, pre-auth). Barrel exports added.

**Placement covers the brief's three access points** — application header (workspace
topbar / admin mobile bar), user profile menu (sidebar foot), and Settings →
Appearance — plus pre-auth (login) so the theme works before and after sign-in.

---

## 2. Gate

`pnpm turbo run typecheck lint test build` → **36/36 tasks successful.**
`@brightloop/ui` tests: **57 passing** (42 → +15 theme). No lint/type errors.

---

## 3. Verification (honest)

- **Unit-verified:** theme resolution + persistence-decision + the FOUC script's real
  runtime behaviour (executed in a sandbox), 15 tests.
- **Runtime-verified in the live dev server (headless):** the anti-FOUC script is
  present and stamps `data-theme` before paint; the toggle renders server-side with
  correct ARIA (3 radios, System selected by default, "currently light" hint);
  `color-scheme` resolves; and — the key user-visible outcome — forcing
  `data-theme="dark"` on `<html>` cascades EVERY token (canonical + legacy aliases
  `--surface-card`/`--text-primary`) to its dark value, flips `color-scheme`, and
  changes the actual `<body>` background — then reverts cleanly. Round-trip proven:
  light `#F3F1EC` ↔ dark `#0B0C0F`.
- **Not exercisable in this session:** a real click on the toggle. The Browser pane is
  not displayed, so the tab is `visibilityState:"hidden"` and React (App Router)
  throttles hydration for the ENTIRE app (verified: no `__reactFiber$` on any element,
  including pre-existing components). The React `onClick → setTheme` binding is
  therefore compile/typecheck-verified only. **Full interactive + both-theme
  screenshot review should be done on the Vercel PR preview** (consistent with the
  documented sandbox limitation), where the tab is visible and hydration runs.

---

## 4. Follow-ups (not in PX.1a)

- Interactive + screenshot validation on the Vercel preview (both themes, all
  surfaces, dropdowns/modals/charts/skeletons) — completes Priority 13's validation
  matrix.
- Optional: theme toggle in the public marketing `Navbar` (kept out to avoid changing
  the shared component's API this slice).
- `ENGINEERING_CONTEXT.md` gets its PX.1a entry on merge (per the maintenance rule).

---

*Awaiting approval to commit. No commit/push/PR was made.*
