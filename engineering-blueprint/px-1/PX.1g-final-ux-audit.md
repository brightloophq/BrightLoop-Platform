# PX.1g — Final Product Experience Audit

_Auxion · Final UX QA / Design Parity / Responsive & Accessibility Certification / Production Polish_

This is the closing audit of the PX.1 Product Experience program. It inspects the
**complete, merged** application route-by-route (PX.1a–PX.1f all on `main`), classifies
every finding by severity, and records exactly what PX.1g changed versus what it left
intentionally alone.

**Method.** Rendered structure, components, layouts, tokens, responsive rules,
loading/error states and navigation relationships were read directly from the repository
(the authoritative source). Five parallel focused audits covered: navigation parity,
theme-token hygiene, loading/error/empty coverage, cleanup + data honesty, and
accessibility + responsive of the shared primitives. Findings below are all
code-verified with `file:line` evidence; nothing here is fabricated.

**Severity key**

- **P0** — blocks production or a critical task
- **P1** — serious UX / accessibility / responsive defect
- **P2** — visible inconsistency or important polish issue
- **P3** — minor cosmetic improvement
- **OUT-OF-SCOPE** — requires backend / product-capability work (documented, not fixed)

---

## 1. Route inventory

Reconstructed from the App Router tree (a route "exists" = has a `page.tsx`).

### Admin / internal (`src/app/admin/*`) — error boundary: `admin/error.tsx`
Console `/admin/dashboard` · Business Scan `/admin/business-scan` · Activation
`/admin/activation` · Signals `/admin/signals` (+`/new`, `/[signalId]`) · Insights
`/admin/insights` · Recommendations `/admin/recommendations` · Approvals
`/admin/approvals` · Moves `/admin/moves` · Measurements `/admin/measurements` ·
Knowledge `/admin/knowledge` · Leads `/admin/leads` · Proposals `/admin/proposals`
(+`/[id]`) · Contracts `/admin/contracts` · Conversations `/admin/conversations`
(+`/[id]`) · Clients `/admin/clients` (+`/[id]`) · Projects `/admin/projects`
(+`/[id]`) · Invoices `/admin/invoices` · Analytics `/admin/analytics` · Automation
`/admin/automation` · Portfolio `/admin/portfolio` (+`/new`, `/[id]`) · Reviews
`/admin/reviews` · System Map `/admin/system-map` · Transformation
`/admin/transformation` (+`/[id]`) · Prospect Scanner `/admin/prospect-scanner`
(+`/[id]`) · Settings `/admin/settings` · Home `/admin`.

### Workspace / client SaaS (`src/app/workspace/*`) — error boundary: **added in PX.1g**
Dashboard `/workspace` · Projects (+`/[id]`) · AI Team · Copilot · Automations ·
Deployments (+`/[id]`) · Runtimes (+`/[id]`) · Integrations (+ `marketplace`,
`marketplace/[connectorId]`, `oauth/callback`, `[installationId]`) · Executions
(+`/[id]`) · Reports · Approvals · Activity · Missions `/[id]` · Search · Settings.

### Portal / client-facing (`src/app/portal/*`) — error boundary: **added in PX.1g**
Dashboard `/portal` · Project · Deliverables (+`/[id]`) · Proposals · Contracts ·
Invoices · Notifications · Discovery chat `/portal/chat`.

### Public / auth (`src/app/(public)/*`, `src/app/(auth)/*`)
Home · Services (+`/[discipline]`) · Packages · Portfolio (+`/[slug]`) · Case studies
(+`/[slug]`) · Testimonials · Contact · Legal `/legal/[document]` · Funnel
(assessment · configurator · recommendation · roadmap) · Start · Login · Forgot /
reset password · Auth callback.

No dead navigation links exist in any shell; unbuilt modules render as inert "soon"
placeholders (`ready: false`), not broken links.

---

## 2. P0 findings

**None.** No defect blocks production or a critical task.

---

## 3. P1 findings — serious defects (all fixed)

### P1-1 — Portal had no working mobile navigation ✅ FIXED
`portal/layout.tsx` rendered a bare `<aside class={sidebar}>` with no mobile bar, no
opener and no drawer state. Portal reuses `admin.module.css`, where `@media
(max-width:1023px)` slides `.sidebar` off-canvas (`translateX(-100%)`,
`admin.module.css:294-302`) and reserves `.main { padding-top: 56px }` for a mobile bar
the portal never rendered. **Result:** below 1024px a client physically could not reach
portal navigation, and dead space sat under a non-existent bar.

**Fix.** Extracted a client `PortalShell` (`portal/PortalShell.tsx`) that mirrors the
proven admin `AppSidebar` mechanism — a mobile top bar with an "Open navigation" button,
scrim backdrop, off-canvas drawer (the same GSAP `useDrawerSlide`, transform/opacity
only, snaps instantly under reduced-motion), Escape-to-close, focus move-in / return,
and close-on-navigate — reusing the identical `admin.module.css` classes. The server
`portal/layout.tsx` now hydrates it. No new dependency; no new CSS.

### P1-2 — Workspace & Portal had no error boundary ✅ FIXED
Only `admin/error.tsx` existed (from PX.1f). Every workspace and portal route was
uncovered against a render/data error — a thrown error would surface as a blank or
broken screen with no recovery. There is no root `error.tsx`/`global-error.tsx` either.

**Fix.** Introduced a shared `RouteError` primitive in `@brightloop/ui` (themed,
`role="alert"` + `aria-live="assertive"`, `reset()` retry, never leaks the raw
error/stack/payload) and wired **three** thin boundaries to it — `admin/error.tsx`
(refactored to the shared primitive, its bespoke `error.module.css` deleted),
`workspace/error.tsx` (new), `portal/error.tsx` (new). All three shells now fail
identically and are centrally maintained.

---

## 4. P2 findings — important polish (all fixed)

### P2-1 — Navbar scrolled glass baked a near-white literal ✅ FIXED
`Navbar.module.css:19` set the scrolled paper-glass fill to
`rgba(251, 252, 253, 0.82)` — a near-white literal that did **not** flip in dark mode,
leaving a light navbar floating on a dark page. It sat unguarded even inside
`@brightloop/ui`. **Fix:** `background: color-mix(in srgb, var(--bg-raised) 82%,
transparent)` — visually identical in light, correctly dark in dark. Verified live:
light `srgb(0.984 0.980 0.973 / .82)`, dark `srgb(0.078 0.086 0.106 / .82)`. Locked by a
new assertion in `overlay-tokens.test.ts`.

### P2-2 — CMS "live row" border used a hardcoded success-green ✅ FIXED
`admin/cms.module.css:119` `border-color: rgba(22, 179, 100, 0.25)` — the exact success
literal `overlay-tokens.test.ts` bans elsewhere. **Fix:** `color-mix(in srgb,
var(--positive) 25%, transparent)`, matching the tokenized `--signal` pattern two lines
above.

### P2-3 — Automation failed-row border used a hardcoded danger-red ✅ FIXED
`admin/automation/page.tsx:71` inline `borderColor: "rgba(239,68,68,0.3)"`. **Fix:**
`color-mix(in srgb, var(--critical) 30%, transparent)`.

### P2-4 — Toast announced every tone politely, even failures ✅ FIXED
`Toast.tsx:87` hardcoded `role="status" aria-live="polite"` for all tones, so a `danger`
toast queued behind current screen-reader speech instead of interrupting. **Fix:**
`danger` → `role="alert"` + `aria-live="assertive"`; informational tones stay polite.

### P2-0 — Theme toggle absent from the public landing page ✅ FIXED (follow-up)
A final review found the Light/Dark/System control was available on authenticated shells
and the login page but **not** on the public marketing Navbar
(`packages/ui/src/components/Navbar.tsx`) — so a visitor on the landing page had no
visible way to choose a theme, even though the PX.1a Theme Runtime
(`ThemeProvider`/`ThemeScript`) is already active there via the root layout. **Root
cause:** the Navbar's `.actions` group rendered only the CTA + hamburger; it never
composed `ThemeToggle`, on desktop or in the mobile drawer. **Fix:** added the existing
`ThemeToggle` (reuse — no second implementation/provider) — **compact** in the desktop
`.actions` (before the CTA, `.desktopTheme`, hidden <1024px) and **segmented** in the
mobile drawer under an "Appearance" label (`.drawerTheme`). Tokens only; no nav-hierarchy
change. Guarded by `Navbar.theme.test.ts` (6 tests). Verified live: toggle present on the
landing page, dark preference persists across reload (`data-theme=dark`, no FOUC), 0px
horizontal overflow at desktop and 375px, desktop toggle correctly hidden on mobile.

### P2-5 — Command-palette results were mouse-only ✅ FIXED
`WorkspaceShell.tsx:123` rendered each result as `<a>` **without `href`** — not
keyboard-focusable, no link/button role, operable only by mouse (arrow-key nav existed
but AT could not reach the items as controls). **Fix:** converted to real `<button
type="button">`; neutralized native button styling in `.paletteItem` so it renders
identically. (The palette's hand-rolled dialog semantics are noted under §11 as a
documented, lower-priority follow-up — not reworked in PX.1g to avoid risk.)

---

## 5. P3 findings

### Fixed (low-risk, improves consistency)
- **P3-1 — Fragile active-nav matching in admin & portal.** `AdminNav.tsx:37` and
  `PortalNav.tsx:20` used a bare `pathname.startsWith(href)` (no segment boundary) —
  currently safe only because no href is a string-prefix of another, but fragile (a
  future `/admin/project` would light `/admin/projects`). **Fixed** to `pathname ===
  href || pathname.startsWith(href + "/")`, matching the already-correct workspace
  `activeNavKey`.

### Documented, not changed (intentional or too low-value/high-churn to touch now)
- **P3-2 — `Field` has no required indicator / guaranteed `aria-required`**
  (`Field.tsx`). Uses the inverse "(optional)" convention by design; adding a primitive
  required API is a component-contract change, deferred.
- **P3-3 — `Button` does not enforce an accessible name for icon-only use**
  (`Button.tsx`). Latent trap only; every current icon-only caller passes `aria-label`
  (verified). Left as-is.
- **P3-4 — `Alert` non-danger tones have no live role** (`Alert.tsx:30`). Documented in
  the component as intentional (persistent inline banners shouldn't steal focus).
- **P3-5 — SystemMap exposes no per-node SR detail / keyboard nav** (`SystemMap.tsx`).
  Correct as a presentational `role="img"` with a summarizing label; only needs work if
  nodes ever become interactive. See §14.
- **P3-6 — Notifications popover uses `role="dialog"` without `aria-modal`**
  (`WorkspaceShell.tsx:139`). Minor semantic nuance on a non-modal popover.

---

## 6. OUT-OF-SCOPE findings (backend / product capability — documented only)

- **OOS-1 — Orphan admin routes.** `/admin/prospect-scanner` and `/admin/transformation`
  have a `page.tsx` but no sidebar entry and no cross-page link (reachable only by direct
  URL). Whether they should be surfaced, retired, or remain deep-link-only is a
  product/navigation decision — **not** a user-visible defect (users can't see an
  unlinked route), and adding nav entries would be a navigation change PX.1g must not
  make unilaterally. `/admin/system-map` (linked from the dashboard) and
  `/workspace/search` (reachable via ⌘K) are intentionally non-sidebar and are fine.
- **OOS-2 — Route loading beyond the two shell roots.** PX.1g added cascading
  `loading.tsx` at `workspace/` and `portal/` roots (see §18). Ten admin async routes
  (`portfolio*`, `reviews`, `system-map`, `transformation*`, `signals/new`,
  `signals/[signalId]`, admin root) still block without a skeleton; PX.1f scoped route
  loading to the admin list routes deliberately. Extending per-route layout-matching
  skeletons there is a follow-up, not a defect.
- **OOS-3 — Testimonials reassurance copy.** `testimonials/page.tsx:82-84` states "Every
  review below is from a real client…" unconditionally. Accurate in production (real
  Supabase reviews); only mismatched under a **non-default** `BRIGHTLOOP_DATA_SOURCE=
  placeholder` deploy, which additionally shows a `PlaceholderNotice`. Not a production
  defect; making it conditional is deferred to avoid touching public copy this sprint.
- Any new CRM/billing/AI/connector/analytics capability, schema, or auth-model change —
  explicitly excluded by the PX.1g charter.

---

## 7. Summary

| Severity | Found | Fixed | Documented |
|---|---|---|---|
| P0 | 0 | — | — |
| P1 | 2 | 2 | 0 |
| P2 | 6 | 6 | 0 |
| P3 | 6 | 1 | 5 |
| OUT-OF-SCOPE | 3 (+charter exclusions) | 0 | all |

No verified P0 or P1 defect remains. All P2 inconsistencies are resolved. The full local
gate (`typecheck · lint · test · build`) is green. Detailed per-area certifications
follow in the companion PX.1g reports.
