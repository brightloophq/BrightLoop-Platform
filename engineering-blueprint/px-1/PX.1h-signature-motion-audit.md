# PX.1h — Public Agency Experience + Signature Motion System · Audit

> **Mandatory first deliverable** (produced before any implementation, per the brief).
> Grounded in a full read of the *actual* code on `feat/px1g-final-ux-certification`
> (PR #82) — the current tip of the PX.1 line — not in prior reports' claims. Every
> file path and behaviour below was verified by reading source. This audit **extends**
> Auxion's mature-but-restrained motion system into an expressive public layer; it does
> **not** rebuild it, and it deliberately keeps the authenticated product restrained.

---

## 0. Executive summary — the honest problem

Auxion's motion system is **mature, disciplined, and deliberately quiet.** PX.1a–PX.1g
built exactly the right *operational* motion: central tokens, pure preset specs → GSAP
builders, a triple-layer reduced-motion strategy, route loading/error skeletons, an AI
state machine, an interactive System Map, and (PX.1g) the public Light/Dark/System theme
toggle. The `@brightloop/ui/motion` engine header states the design intent plainly: *GSAP
is reserved for coordinated sequences … hover/focus/button micro-interactions stay as CSS
transitions.*

That restraint is why the **public** experience reads as "good SaaS site" rather than
"premium AI transformation agency." The failure PX.1h must solve is precisely the one the
brief names: **a normal visitor cannot see a signature motion experience.** The homepage
(`apps/web/src/app/(public)/page.tsx`) is a **static Server Component**; its stylesheet
(`(public)/home.module.css`) contains **zero `@keyframes`, zero `animation`, zero
`transition`.** Nothing moves on entry, nothing choreographs on scroll, there is no
preloader, no marquee, and **ScrollTrigger does not exist anywhere in the repo** (verified:
zero matches across `application/`).

**The strategic asset we are under-using:** the public brand metaphor is already a
**loop** — *Brand · Build · Automate · Grow, "Four disciplines. One loop."* — and the hero
already renders that loop as four positioned nodes + a ring + an "Auxion" core. It is
static CSS today. **That loop is the signature object.** Animating it (entrance + a
scroll-driven journey) and echoing the System Map's real geometry primitives turns "our
platform" from a claim into a visible, moving proof — without inventing a single feature.

**What is already done (do NOT rebuild):** the public theme toggle (§9) is **already
shipped** by PX.1g inside `Navbar.tsx` (compact desktop L215–217; segmented mobile drawer
L284–287), reusing the canonical `ThemeToggle`/`ThemeProvider`. PX.1h **verifies and
preserves** it; it does not add a second implementation. *(This is also why PX.1h's base
must include PX.1g — see §B.)*

---

## A. Verified inventory of the existing system (so PX.1h reuses, never duplicates)

### Motion engine — `packages/ui/src/motion/` (exported as `@brightloop/ui/motion`)
| File | Role | Reuse in PX.1h |
|---|---|---|
| `tokens.ts` | Pure `DURATION` / `EASE` / `STAGGER` / `OFFSET_Y` (=12) / `shouldAnimate()`. Seconds mirror the CSS ms tokens. | **Single source of timing.** Every new sequence reads these — no magic numbers. |
| `presets.config.ts` | Pure `PRESET` catalogue (dashboardEntrance, metricReveal, pipelineReveal, drawer, pageTransition, modal/toast). | Extend with new public presets (heroSequence, reveal, marquee, journey) as pure specs. |
| `presets.ts` (`"use client"`) | GSAP builders; transform+opacity only; snap to final when `reduced`. | Add sibling public builders following the identical contract. |
| `MotionProvider.tsx` | Registers `@gsap/react` `useGSAP` (the **only** `registerPlugin`, L12); publishes `reducedMotion`; sets GSAP defaults. | **Where ScrollTrigger gets registered** (guarded, client-only). Public pages get their own provider mount. |
| `useReducedMotion.ts` | Live `matchMedia("(prefers-reduced-motion: reduce)")`. | Gate every public sequence. |
| `sequence.ts`, `DashboardEntrance.tsx`, `AnimatedMetric.tsx`, `PipelineAnimation.tsx`, `PageTransition.tsx`, `useDrawerSlide.ts` | Existing authenticated hosts + markers (`data-animate="…"` selector pattern). | The **marker/host pattern** is the template for public reveal hosts (keeps pages server-rendered; motion is a thin client wrapper). |

**Reduced motion is already triple-layered** and must stay intact: (1) global CSS reset
`tokens/base.css:122` collapses all animation/transition to `0.01ms !important`;
(2) per-component `@media` guards; (3) JS (`useReducedMotion` + every preset snapping).
Every PX.1h addition plugs into all three.

### Theme runtime — `packages/ui/src/theme/` (canonical, PX.1a; **no `next-themes`**)
- `ThemeProvider` + `useTheme()`; `ThemeChoice = light|dark|system` (default **system**, live `matchMedia`). Persist key **`auxion-theme`**; applied via **`data-theme`** on `<html>`.
- **FOUC prevented** by the inline pre-paint `THEME_SCRIPT` (`theme.ts`) rendered by `ThemeScript` first in `<body>` (root `layout.tsx:48`); `<html suppressHydrationWarning>`.
- `ThemeToggle` (`segmented` + `compact`, ARIA radiogroup). **Already in the public Navbar.**
- **Rule for PX.1h:** every new visual must be authored against **semantic tokens**
  (`--bg`, `--surface`, `--ink`, `--signal`, `--positive/--caution/--critical`,
  `--chart-1..6`, `--grad-loop`, `--glow-blue`) so Light/Dark/System all work for free.
  **Do not** add new `--bl-*` legacy references (the token file forbids it). No Tailwind — CSS Modules only.

### System Map — the reusable public asset (PX.1d)
- Static primitive `components/SystemMap.tsx` exposes the **pure** `systemMapGeometry(count, cx, cy, r)` (deterministic ring layout, first node at top, clockwise).
- Interactive `systemmap/SystemMapExplorer.tsx` + pure `logic.ts` exposes **pure** `connectionPath(a, b, center, bow)` (orbital-bowed SVG edge path), `healthTone`, `riskTone`.
- **All are React-free, deterministic, already public exports** → ideal to script a marketing "assemble the system" sequence with **zero new geometry code and zero new API surface.**

### Public homepage — `apps/web/src/app/(public)/page.tsx` (Server Component, ISR 300s)
Section order today: **Hero** (dark, static loop visual) → **Trust bar** (labeled "Sample
client names", placeholder) → **Four disciplines** (4 `ServiceCard`) → **Proof** (one CMS
`CaseStudyCard` or honest empty `Alert`) → **Testimonials** (aggregate `Stars` + up to 3
`Testimonial`, or empty `Alert`) → **Closing CTA** (`CTASection`) → **Footer**. Data honesty
is strong and **must be preserved**: reputation is Supabase publish-gated with graceful
empty states; trust-bar/discipline copy are explicitly-flagged placeholders. **PX.1h adds
motion and one platform-story section; it invents no proof, metrics, logos, or projects.**

---

## B. Base-branch finding (a genuine dependency — surfaced, not silently resolved)

PX.1h's **required** public theme toggle (§9) is **already implemented by PX.1g**, which is
**PR #82 — OPEN, not merged**, `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`, **all 5
required checks GREEN**, certified for production. Therefore PX.1h **depends on PX.1g** and
**must not** be branched from bare `main` (that would lose the toggle and force a duplicate
implementation → merge conflict). Options: **(A)** merge #82 first (matches the repo's
established per-sprint workflow: "merge prior PR → branch off main"), then branch PX.1h off
the updated `main`; or **(B)** stack PX.1h on `feat/px1g-final-ux-certification` (both PRs
open). Merging a PR is an outward action requiring explicit approval, so this decision is
put to the maintainer before the branch is cut. **No implementation begins until the base
is chosen.**

---

## C. Section-by-section public audit + proposed motion treatment

For each: current state → weakness → treatment → **is GSAP/ScrollTrigger justified?**

| # | Surface | Current | Weakness | PX.1h treatment | GSAP? ST? |
|---|---|---|---|---|---|
| C1 | **Preloader** | None. | No branded first-impression; risk of hero flash. | Branded, **first-load/session-gated** Auxion loader: mark → wordmark resolve → loop ring completes → mask away → hand off to hero. Fast, no artificial delay, theme-aware, reduced-motion = instant. | GSAP timeline. No ST. |
| C2 | **Navbar** | Client comp; scroll→glass (CSS `transition`); theme toggle ✓ (PX.1g); accessible mega-menu + focus-trapped mobile drawer. | Entrance is instant; drawer conditionally mounts with no slide (the `useDrawerSlide` hook is unused here). | Subtle settle-in on first paint (after preloader); reduced-motion-safe. **Preserve** the toggle, focus trap, scroll-glass exactly. | Light GSAP (entrance only). No ST. |
| C3 | **Hero** | Static; `opacity:1` from load; static loop nodes/ring/core; static `--grad-loop` glow. | The signature moment does not move. | **Signature entrance timeline**: eyebrow → headline (mask/line reveal) → subcopy → CTAs → **loop activates** (ring draws, nodes stagger in, core pulses once) → note. Fast, readable (no letter-by-letter). | **GSAP timeline — justified.** No ST. |
| C4 | **Marquee** | None (the code's "marquee" var is a *featured-slot* name, not a ticker). | No agency rhythm/texture. | **One** seamless capability marquee using **canonical public terms only** (Brand · Build · Automate · Grow + real discipline/module language — no invented services). Duplicate content `aria-hidden`; reduced-motion = static wrapped row. | CSS transform loop (no RAF); GSAP optional. No ST. |
| C5 | **Transformation journey** (NEW) | Does not exist. | The core story (the loop) is never told as a narrative. | **The headline ScrollTrigger sequence**: a pinned/sticky chapter on desktop stepping **Brand → Build → Automate → Grow**, each step advancing copy + lighting the matching loop node + drawing its connection. Mobile = simple natural-flow stagger (no pin). No scroll-jacking; native scroll intact. | **ScrollTrigger — the primary justification for the sprint.** |
| C6 | **Platform showcase** (NEW) | Does not exist. | "We have a real platform" is only asserted. | Layered interface panels (real product concepts — Console/Signals/Insights/Moves/Analytics, using canonical names) with depth/parallax + progressive scroll-linked activation. Uses real component/screen concepts; **no fake features.** | ScrollTrigger (scrub) + GSAP. |
| C7 | **System Map marketing** (NEW/reuse) | Explorer exists only inside admin. | The clearest visual explanation of Auxion is hidden behind auth. | A **simplified, product-safe** public sequence built on the reused pure primitives (`systemMapGeometry`, `connectionPath`): core appears → domains appear → connections draw → signal→insight→recommendation→move→measurement closes the loop. **Generic marketing data only; no client/demo data.** | ScrollTrigger to drive state. |
| C8 | **Four disciplines** | 4 static `ServiceCard`. | Enter flat, all at once. | Scroll-reveal **stagger** (fade-up), hover depth (CSS). | GSAP reveal + ScrollTrigger batch. |
| C9 | **Trust bar** | Static placeholder names, honestly labeled. | Flat. | Gentle reveal only. **Never** fabricate logos; keep the "Sample client names" label until real. | CSS/GSAP reveal. No ST scrub. |
| C10 | **Proof / case study** | One CMS card or empty `Alert`. | No entrance; honest-empty must persist. | Reveal + image/mask + hover depth **when data exists**; empty state unchanged. | GSAP reveal + ScrollTrigger. |
| C11 | **Testimonials** | Aggregate stars + up to 3 cards, or empty `Alert`. | Flat; data may be sparse. | Quote reveal + count-up **only for the real aggregate rating** (guarded). No invented counts. | GSAP + ScrollTrigger. |
| C12 | **Numbers/metrics** | Only the real aggregate rating exists. | — | Count-up **only** where a verified value exists; reduced-motion shows final immediately. **No fabricated stats.** | GSAP. |
| C13 | **Closing CTA** | Static `CTASection`. | Low "premium" charge. | Premium CTA: subtle magnetic/arrow/fill on pointer; **keyboard/touch never depend on hover**; focus ring intact. | CSS + tiny JS. |
| C14 | **Section transitions** | Stacked bands; no continuity. | Reads as separate web sections. | Intentional chapter handoffs (background/token shift, overlap, sticky handoff) — no giant full-screen delays. | ScrollTrigger. |
| C15 | **Typographic motion** | None. | No editorial voice. | Masked line reveals + section numbering on **headlines/labels/key statements only** — body copy stays static/readable. | GSAP + ScrollTrigger. |
| C16 | **Route transitions** | Next App Router; `pageTransition` preset exists but public pages don't use it. | Hard cuts between public pages. | Evaluate a subtle, safe public route-enter (reuse `pageTransition`); **if brittle in the current architecture, document the limitation — no routing hacks, no fake delays.** | GSAP (existing preset). |
| C17 | **Footer** | Static. | — | Optional gentle reveal; low priority. | CSS. |

---

## D. Authenticated product audit — restraint is the requirement

Public and application **must not** share motion intensity. Public = expressive/editorial;
application = controlled/fast/operational. The authenticated surfaces are **already**
appropriately restrained (dashboard entrance timeline, System Map CSS states, chart draw-in
gated behind `no-preference`, AI state machine, drawer/skeleton). PX.1h's authenticated
scope is **polish only, opt-in, and small**:

| Surface | Current | Restrained polish (only if clearly additive) |
|---|---|---|
| Console/dashboard | `dashboardEntrance` timeline, KPI/pipeline reveals. | Already good — leave unless a gap is found. |
| System Map | CSS node/edge states, reduced-motion safe. | Optional node-activation/connection-draw emphasis reusing existing classes. |
| Analytics/charts | Token-driven draw-in, gated. | Already good. |
| Signals / AI | `PageTransition`; AI state machine. | Already good. |
| Drawers/modals | Drawer CSS entrance (PX.1f). | Coherent enter/exit only; **do not** touch focus-trap/scroll-lock. |

**No admin surface becomes a portfolio.** Fast interactions stay fast.

---

## E. Cross-cutting requirements (apply to everything above)

- **Reduced motion (mandatory):** no parallax, no pin dependency, no large transforms, no looping marquee movement, no forced counters; content is immediately available. Enforced by all three existing layers; every new preset snaps.
- **Theme parity:** author against semantic tokens; verify Light/Dark/System for every new surface (backgrounds/borders/shadows/gradients must remain correct on theme switch).
- **Performance:** transform/opacity only; batch ScrollTrigger; kill triggers/listeners on unmount (use `useGSAP` scope + ScrollTrigger cleanup); pause offscreen loops; **evaluate dynamic-importing ScrollTrigger on public routes** to protect first-load JS. Preserve Core Web Vitals; no hydration-blocking.
- **Responsive:** mobile gets **intentionally simplified** choreography (no pin), not a shrunk desktop; no horizontal overflow from transforms.
- **Accessibility:** keyboard nav, focus visibility, semantic order, contrast, aria states all preserved; marquee duplicates not announced; motion is never the sole state indicator.
- **No backend scope creep:** no schema/RLS/billing/auth/domain/migration/generated-type/API change. If a blocker forces it → **stop and report.**

---

## F. What PX.1h builds (scoped to the gaps above — nothing more)

1. **Motion foundation:** register ScrollTrigger (guarded) in the motion engine; add pure public preset specs + GSAP builders (`reveal`, `stagger`, `maskReveal`, `heroSequence`, `journey`, `marquee`, `parallax`, `counter`) reading existing tokens; a public `MotionProvider` mount + reveal host/marker pattern. Consider dynamic ScrollTrigger load.
2. **Branded preloader** (session-gated, theme/reduced-motion aware).
3. **Hero signature entrance** (loop activation).
4. **One capability marquee** (canonical terms, a11y-safe).
5. **Transformation-journey ScrollTrigger sequence** (pinned desktop / flow mobile) — the loop as narrative.
6. **Platform showcase** (real product concepts, scroll-linked, no fake features).
7. **Public System Map marketing sequence** (reused pure primitives, generic data).
8. **Scroll reveals + section transitions + typographic moments** across disciplines/proof/testimonials/CTA.
9. **Premium CTA + navbar entrance** micro-interactions (hover-independent).
10. **Restrained authenticated polish** (opt-in, small).
11. **Preserve** the PX.1g theme toggle, data honesty, reduced-motion, focus behaviour.
12. **Tests** (motion utility/preset invariants, reduced-motion, ScrollTrigger registration/cleanup, theme, marquee a11y) + **docs** (this audit + report) + `ENGINEERING_CONTEXT.md`.

*Nothing outside these is built. No backend, no new toast/theme/motion runtime, no
fabricated proof, no redesign of information architecture.*
