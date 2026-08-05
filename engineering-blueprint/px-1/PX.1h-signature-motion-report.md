# PX.1h — Public Agency Experience + Signature Motion System · Engineering Report

_Branch `feat/px1h-signature-motion`, based on `main` after PR #82 (PX.1g) merged._

## 1. Charter & scope discipline

PX.1h makes the **public** Auxion experience read as a premium AI-transformation agency
with a real operating platform — via a deliberate, visible motion layer — while keeping the
authenticated product restrained. It **extends** the existing motion engine; it does not
replace it, install Framer Motion, or touch any backend surface (no schema / RLS / billing /
auth / domain / migration / generated-type / API change). Data honesty is preserved
throughout: no fabricated proof, logos, metrics, or projects.

The audit (`PX.1h-signature-motion-audit.md`) established the honest gap: the homepage was a
**static Server Component** (its stylesheet had zero `@keyframes`/`animation`/`transition`),
**ScrollTrigger did not exist anywhere** in the repo, and there was no preloader, hero
choreography, or marquee. The public theme toggle (§9) was **already delivered by PX.1g** and
is preserved, not re-implemented.

## 2. Pre-flight & base

`git fetch` → verified PX.1g was **PR #82, OPEN, CLEAN, MERGEABLE, all 5 checks GREEN**, and
that it (not bare `main`) carried the required public theme toggle. Surfaced the base-branch
dependency for a decision; on approval, merged #82 with a merge commit (`9009a0e`), synced
`main`, verified PX.1g content present (ThemeToggle in the public Navbar), and cut
`feat/px1h-signature-motion` off the clean base. Protected untracked `phase-d/*` files
untouched throughout.

## 3. Motion architecture (extends `@brightloop/ui/motion`)

A new **PUBLIC / editorial** vocabulary sits beside the existing operational one — separate on
purpose so the app stays calm while the landing page performs. All pure specs are node-safe
and unit-tested; all builders animate transform + opacity only and snap under reduced motion.

- **`motion/public.config.ts`** (pure) — `PUBLIC_DURATION/OFFSET/STAGGER`, `MARQUEE`,
  `PARALLAX`, `SCRUB`, the `PUBLIC_PRESET` catalogue (reveal · revealStagger · maskReveal ·
  heroStep · draw · counter), and the story data: `HERO_SEQUENCE`, `JOURNEY_STAGES`
  (Brand · Build · Automate · Grow — the canonical loop, not invented phases).
- **`motion/public.ts`** (client) — GSAP builders `reveal`, `revealStagger`, `maskReveal`,
  `heroSequence` (paused-buildable), `countUp`. Same contract as the existing `presets.ts`.
- **`motion/scroll.ts`** (client) — `registerScrollTrigger()`, the single idempotent place
  ScrollTrigger is turned on. Imported only from public-route client modules, so Next
  **code-splits GSAP + ScrollTrigger onto the homepage chunk** (see §11).
- **`motion/gsapClient.ts`** (client) — re-exports `gsap` + `useGSAP` so app-level bespoke
  animations use the ui package's dependency (no duplicate dep in the app).
- **`motion/intro.ts`** (client) — the preloader→hero handoff (`markIntroReady` /
  `whenIntroReady`) with a safety timeout so the hero is never gated on the loader.
- **Host components**: `Reveal`, `Parallax`, `CountUp`, `HeroSequence` — thin client wrappers
  that keep page content **server-rendered** and only choreograph its arrival (the established
  marker/host pattern). `Marquee` is a reusable UI component.

## 4. What shipped (visible, public)

- **Branded preloader** (`(public)/_intro/`): mark resolves → AUXION wordmark rises → a loop
  line completes → the overlay masks away and hands off to the hero (~1.4s). Shown **at most
  once per session** and **never under reduced motion** (both gated pre-paint by an inline
  `IntroScript`, mirroring the theme runtime's `ThemeScript`). A JS-independent CSS **failsafe**
  clears the pre-paint cover so content is **never trapped** (no-JS / slow-hydration safe).
- **Hero signature entrance** (`HeroSequence` + `data-hero` markers on the existing hero):
  eyebrow → **masked headline** → subcopy → CTAs → note, with the loop **ring → nodes → core**
  activating. Built paused (hidden start rendered immediately, no flash), played on handoff.
- **Capability marquee** (`Marquee`): a seamless two-track loop of canonical capability
  categories (Brand · Strategy · Design · Build · … · Grow · Analytics). Duplicate track is
  `aria-hidden` (announced once), pauses on hover/focus, **static under reduced motion**, and
  works CSS-only if JS is throttled (JS just tunes the speed to content width).
- **Transformation journey** (`TransformationJourney`): the signature **ScrollTrigger** story —
  a native **sticky** loop diagram beside four scrolling stages; each stage lights its node and
  **draws its connection to the AUX core**, so the loop visibly completes as you scroll. This
  **doubles as the public System Map sequence** — node placement reuses the real, pure
  `systemMapGeometry` primitive (§13) with generic, product-safe marketing data. Renders
  fully-lit and readable with no JS / reduced motion; the scroll build is desktop + motion only
  (via `gsap.matchMedia`, auto-cleaned); mobile flows naturally (sticky released).
- **Platform showcase** (`PlatformShowcase`): layered interface panels naming the **canonical**
  product surfaces (Console · Signals · Insights · Recommendations · Moves · Analytics) with
  depth, subtle parallax, and staggered scroll reveal. Deliberately **abstract UI illustrations —
  no fabricated metrics or data**.
- **Scroll reveals + a real count-up** across the disciplines, proof, testimonials, and CTA
  (`Reveal`); the testimonials' **verified** aggregate review count animates via `CountUp`
  (renders the real final value server-side; counts up only when motion is allowed).
- **Section rhythm**: tonal chapter variation (dark hero → light framework → inset journey →
  dark platform → light proof/testimonials → CTA) gives the page an intentional, non-stacked feel.

## 5. Authenticated product

Left deliberately **restrained**. The audit found the app already carries its appropriate
operational motion from PX.1a–f (dashboard entrance timeline, System Map node/edge states,
token-driven chart draw-in gated behind `no-preference`, the AI state machine, drawer/skeleton
motion). PX.1h adds **no** portfolio-style motion to admin/portal/workspace — the new public
vocabulary and ScrollTrigger live only on public routes and never enter the app bundle (§11).

## 6. Reduced motion, theme, accessibility

- **Reduced motion**: honoured at all three existing layers plus by construction here — the
  preloader and journey scroll-build never run; the marquee is static; `Reveal`/`Parallax`/
  `CountUp` no-op and leave content fully visible; every builder snaps. **Content is never
  hidden** from a reduce-motion or no-JS user (hidden states are applied in JS only when motion
  is allowed; the cover has a JS-independent failsafe).
- **Theme**: everything is authored against semantic tokens (`--bg`, `--surface`, `--ink`,
  `--signal`, `--grad-loop`, …), so Light/Dark/System all work; no new `--bl-*` legacy refs; no
  second theme runtime (PX.1g's toggle preserved).
- **Accessibility**: hero markers are decorative wrappers; the loop visual stays `aria-hidden`;
  the marquee is one labelled region with the duplicate hidden; `CountUp` renders the real value
  server-side (correct for SR/no-JS); focus, keyboard, and semantic order are unchanged; motion
  is never the sole state indicator.

## 7. Responsive

Mobile receives intentionally simpler choreography: the journey releases its sticky column and
flows the stages; the platform panels stack (no overlap); the hero grid collapses (existing).
No horizontal overflow from transforms (all transform/opacity, small travel).

## 8. Tests (+10, house style, pure node)

- **`packages/ui/src/motion/public-motion.test.ts` (7)** — the public vocabulary is larger/
  slower than the operational app, every preset easing derives from the shared `EASE`, marquee/
  parallax values are calm+positive, the hero sequence order (mask headline, loop activates last)
  and overlap discipline hold, the journey is exactly Brand→Build→Automate→Grow, and the marquee
  is transform-only + `animation: none` under reduce.
- **`apps/web/src/app/(public)/_intro/intro.test.ts` (3)** — the pre-paint gate checks session +
  reduced-motion before setting the flag and never throws; the cover has a JS-independent
  failsafe (`introCoverFailsafe`, `visibility: hidden`); the journey emphasises steps only under
  `no-preference`.

## 9. Full gate (local)

`pnpm turbo run typecheck lint test build`:
- **typecheck** — pass (all packages).
- **lint** — pass (one pre-existing unrelated warning in `theme.test.ts`).
- **test** — pass (`@brightloop/ui` **122**, `@brightloop/web` **185**; +10 new).
- **build** — pass. Homepage `/` First Load JS **232 kB** vs ~205 kB for other public routes —
  the entire GSAP + ScrollTrigger + signature-motion layer adds **~27 kB**, code-split onto the
  homepage chunk; the app/other routes are unaffected.
Database/security CI gates (migrate · pgTAP · RLS · adapter · type-drift · gitleaks) are
unchanged by this branch and run on CI.

## 10. Visual verification — honest limitation

Interactive visual QA (Light/Dark/System × desktop/mobile × reduced-motion, and the running
motion itself) could **not** be captured in this environment: the Browser pane is not displayed,
so it does not composite frames **and does not hydrate the React client runtime** — verified by
confirming even the *pre-existing, shipped* Navbar's scroll-glass does not react there
(`window.next` absent). This is the same limitation prior PX reports noted. What **was** verified
here: all new sections render server-side with correct structure and data attributes; the intro
cover and markers are present; typecheck/lint/tests/build are green; RSC boundaries compile. A
reviewer should still eyeball the Vercel preview. This report claims no screenshots that were not
taken.

## 11. Deferred (documented, deliberately not built)

- **Public route transitions (§21)** — evaluated; a clean App-Router transition needs
  `template.tsx`/View Transitions with real flash/scroll-restoration risk. Not introduced (no
  brittle routing hacks, no fake delays).
- **Navbar entrance / magnetic CTA (§19–20)** — the hero sequence + preloader already own the
  entrance moment; a magnetic CTA would touch the shared `Button` globally (keyboard/touch risk).
  Left as a future, isolated enhancement.
- **Per-line headline splitting** — the headline masks as one block (safe with the gradient
  accent); a SplitText-style per-line reveal is a possible future refinement.

## 12. Files

**Added (ui):** `motion/public.config.ts` · `motion/public.ts` · `motion/scroll.ts` ·
`motion/gsapClient.ts` · `motion/intro.ts` · `motion/Reveal.tsx` · `motion/Parallax.tsx` ·
`motion/CountUp.tsx` · `motion/HeroSequence.tsx` · `motion/public-motion.test.ts` ·
`components/Marquee.tsx` · `components/Marquee.module.css`.
**Modified (ui):** `motion/index.ts` · `index.ts`.
**Added (web):** `(public)/_intro/` (IntroScript.tsx · introConfig.ts · Preloader.tsx ·
preloader.module.css · intro.test.ts) · `(public)/intro.css` · `(public)/_sections/`
(TransformationJourney.tsx · journey.module.css · PlatformShowcase.tsx · platform.module.css).
**Modified (web):** `(public)/layout.tsx` · `(public)/page.tsx` · `(public)/home.module.css`.
**Docs:** this report + the audit + `ENGINEERING_CONTEXT.md`.
