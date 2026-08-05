# LR.2 — Human Acceptance & Production Verification

_Branch `feat/lr2-human-acceptance`, cut from `main` @ `5bc068e`. An adversarial, break-it QA pass over the `main` baseline._

## Executive summary

I approached this as an independent QA team trying to break the platform, not certify it. Four adversarial code audits (mobile/overflow, forms/validation, accessibility with computed contrast, and security/IDOR) plus direct inspection found **no P0 launch blocker in the code** and a focused set of genuine P1/P2 defects — the P1s and the cheapest high-value items are **fixed in this PR**.

**The single most important finding is a process one:** the brief stated "PR #86 has been merged." **It is not.** Verified: PR #86 (LR.1) is **OPEN**, `origin/main` is still at `5bc068e`, and the LR.1 hardening (Turnstile fail-closed, `global-error.tsx`, JSON-LD escaping) and PX.1i polish (#85) are **not on main.** So the live `main` still carries the exact defects LR.1 fixed. This is called out below and gates the launch recommendation.

> **Honest capability limitation (unchanged from prior sprints).** This environment has no database, no auth session, no running app, and a Browser pane that does not composite frames or hydrate. Therefore **no live journey, form submission, mobile render, Lighthouse/Core-Web-Vitals, screen-reader, or penetration test was executed.** Every finding below is derived from reading code/CSS/config. Where a claim needs a running app, it is marked as owner-verify. This report does not assert any test it could not run.

## Verdict

## ⚠ READY WITH MINOR KNOWN ISSUES

No P0. The architecture, access-control, and data-honesty are sound; the code-level P1s are fixed. Auxion is **not** yet "✅ READY TO LAUNCH" because (1) the LR.1/#86 hardening and #85 are **not on main**, (2) operational/content go-live gates remain (`docs/PRE-LAUNCH.md`: content approval, robots flip, hostnames, Turnstile provisioning, Stripe), and (3) genuine **runtime QA — live journeys, mobile rendering, screen-reader, Core Web Vitals — has not been performed** and must be, by a human on a preview, before opening the doors. It is not "❌ NOT READY" because no blocker exists and the platform is architecturally and securely production-grade.

## Step 1 — Journey results (code-level)

Every journey's routes, guards, read models, and error/empty states exist and compile. Auth fails closed (verified ES256 `getClaims`, `requireSurface` on all shells, middleware redirects). Public pages degrade to honest empty states. **Not runtime-executed** — the owner must walk login → onboarding → console → portal on a live preview. One journey gap surfaced: the **public contact form is a deliberate "sent but not sent" dead-end** (submission wired in a later sprint) — honest today via a warning + mailto, but the "Send enquiry" CTA implies a live channel (P3, see Issues).

## Step 2/3 — Break-everything & mobile results

- **No P0 horizontal-scroll.** Every fixed-px grid collapses to `1fr` before its track exceeds 320px; wide absolute children sit in `overflow:hidden` ancestors; long mono strings use `word-break`. Grids, hero clamp, marquee, and floats verified safe at 320–768px.
- Real mobile defects (P2/P3): sub-44px tap targets on several bespoke public controls (funnel choices, portfolio/testimonials filters — WCAG **2.5.5, AAA**, not the AA the product claims); `Button`'s `white-space:nowrap` can overflow a long CTA at 320px; and a genuine bug — `journey.module.css` referenced an **undefined `--nav-height`** (fell back to 64px vs the real `--header-h:72px`), tucking the sticky diagram under the navbar. **The `--nav-height` bug is fixed here.** No `env(safe-area-inset-*)` on fixed drawers (P3, notched iOS).

## Step 4 — Performance results (code-level)

GSAP/ScrollTrigger are code-split and cleaned up (`useGSAP` auto-revert, `gsap.matchMedia` auto-cleanup, reduced-motion gates); fonts self-hosted via `next/font` (`display:swap`); motion is transform/opacity only; public First-Load ~205 kB. **No runtime LCP/CLS/INP measured** — owner must run Lighthouse on the preview. No obvious layout-shift source found (fonts swap, images are placeholders/aspect-boxed).

## Step 5 — Accessibility results (computed contrast)

Overlays (Drawer, Navbar mobile drawer, mega-menu), keyboard operability (no `div`-onclick anywhere; SVG `role="button"` nodes have tabindex+Enter/Space), Accordion, charts (role=img + SR `<table>`), `OperationalTable` (`<th scope>`), `Field` (label + `aria-describedby` + `role="alert"`), Toast/Alert live regions, and the global reduced-motion reset are all **correct**. Real defects found and **fixed here**:
- **Light `--ink-3` muted text = 2.94:1** (failed even the 3:1 UI floor) — pervasive meta/caption/chart-axis text. → darkened to `#676A71` (**4.8:1**).
- **Dark `--ink-3` = 3.94:1** (failed body) → `#7A7E87` (**4.8:1**).
- **`--signal` as link/accent TEXT = 4.31:1** (failed body on paper) → the `--text-accent`/`--text-link` roles now use a deeper amber `#A44E12` (**5.06:1**) while `--signal` fills/borders/focus are unchanged (correct text-vs-fill split).
- **Workspace shell `<main>` had no `#main-content`** — the global skip link pointed at a dead anchor on every `/workspace` page (WCAG **2.4.1, Level A**). → `id`+`tabIndex` added.

Deferred (report only): `NodeDetailPanel` (internal System Map dialog) focuses-in and Escape-closes but doesn't restore focus to the trigger or trap Tab (P2, 2.4.3); SystemMap edges are mouse-only (P3).

## Step 6 — Security results

**No P0/P1/P2 exploitable access-control defect.** IDOR is clean — every `[id]` read/write loads via the RLS-scoped client and authorizes on the **loaded row's** `clientId` (`packages/application/src/scan/shared.ts:27`); a foreign id → 404 before the guard. Service-role is confined to HMAC-verified webhooks + server-generated-id prospect provisioning. Params are fail-safe; `?clientId=` cannot enumerate tenants (pinned to the actor). Sessions fail closed; no open-redirect. Only P3 defense-in-depth consistency notes (`runtime-read` list functions authorize on `actor.clientId` rather than the loaded workspace — RLS still covers it, no route exposes them; `installConnector` trusts a `workspaceId` but stamps the actor's own `clientId` — data-integrity smell, not a cross-tenant read). **Note:** the JSON-LD `<`-escaping and Turnstile fail-open are fixed in the open **#86**, not on `main`.

## Step 7 — Production results

Headers (CSP/HSTS/nosniff/X-Frame/Referrer/Permissions), `robots.ts`/`sitemap.ts` (publish-gated), `not-found.tsx`, self-hosted fonts, and the intentional site-wide `robots:index:false` are all correct. **New gaps this pass found:**
- **No favicon / app icon / OG image / web manifest, and no `public/` dir at all** — the site served the browser default globe. → **Branded `app/icon.svg` added** (from the existing Auxion hex-mark; Next auto-serves it). OG image + manifest + `themeColor` remain P2 (recommended).
- **No analytics and no error monitoring (Sentry) wired** — operational P2 (PRE-LAUNCH already flags; recommended before a public opening).
- Supabase/Vercel/Cloudflare/DNS/caching/backups/rate-limiting are **owner-configured** and not verifiable from the repo.

## Step 8 — Visual review

One coherent token system (`--bg/--surface/--ink/--signal/--line*` + scales), single amber accent, restrained radii/elevation, consistent primitives. Not visually rendered here. PX.1i (#85, pending) further unifies button/card/rating micro-interactions and fixes the dark-hero CTA legibility.

## Issues found → fixed (this PR — additive; no schema/migration/generated-type/dependency change)

| # | Sev | Issue | Fix |
|---|---|---|---|
| 1 | P1 | Light `--ink-3` muted text 2.94:1 (AA fail, pervasive) | `#676A71` (4.8:1) |
| 2 | P1 | `--signal` link/accent text 4.31:1 (AA fail, light) | `--text-accent/-link` → `#A44E12` (5.06:1); fills keep `--signal` |
| 3 | P1 | Lead email never format-validated (`createLead` persists garbage) | server email regex + length caps |
| 4 | P1 | Public signup accepts unbounded `name`/`company`/`funnel` (anon service-role DoS) | field length caps + 20 kB funnel guard before `JSON.parse` |
| 5 | P1 | No favicon / app icon (default globe) | branded `app/icon.svg` from the Auxion mark |
| 6 | P2 | Dark `--ink-3` 3.94:1 (AA body fail) | `#7A7E87` (4.8:1) |
| 7 | P2→A | Workspace skip-link target missing (WCAG 2.4.1 Level A) | `id="main-content"` + `tabIndex` on `<main>` |
| 8 | P3 | `journey.module.css` undefined `--nav-height` (sticky tuck) | `var(--header-h)` |

## Remaining risks (report only — not fixed here)

- **Process (highest):** `main` lacks the LR.1 hardening (#86) and PX.1i (#85). **Merge #86 and #85 before launch** — otherwise production ships with Turnstile fail-open, no public/global error boundary, unescaped JSON-LD, and the dark-hero CTA legibility bug.
- **Operational/content gates** (`docs/PRE-LAUNCH.md`): approve placeholder content, flip `robots` noindex, set real hostnames, provision `TURNSTILE_SECRET_KEY`, build/verify Stripe (or keep payments disabled), add WAF/rate-limit + error monitoring, confirm Supabase backups.
- **P2/P3 defects deferred:** tap targets <44px (AAA); `Button` long-label wrap at 320px; `NodeDetailPanel` focus restore/trap; safe-area insets; admin free-text server length caps (`addInternalNote`, `saveTestimonial`, `saveProject`); contact-form "sent but not sent" CTA; Turnstile submit-gating UX; OG image/manifest/`themeColor`; `runtime-read`/`installConnector` authorization consistency.
- **Un-run verification (owner):** live E2E journeys, mobile rendering at 320–1024px, screen-reader pass, Core Web Vitals/Lighthouse, live pen test.

## Launch recommendation

**⚠ READY WITH MINOR KNOWN ISSUES.** Merge **#85 + #86 + this PR**, close the `docs/PRE-LAUNCH.md` operational/content gates, and complete one human runtime pass (journeys · mobile · screen-reader · Core Web Vitals) on the Vercel preview. With those done, Auxion is ready for real businesses. No blocker remains in the code; the residual risk is operational and verification-shaped, not architectural.
