# PX.1i — Premium Experience Direction · Report

_Branch `feat/px1i-premium-experience`, cut from `feat/px1h-signature-motion` (PX.1h signature-motion layer)._

## 1. Charter

PX.1h gave the public site its motion layer (preloader, hero sequence, marquee, scroll
journey, platform showcase). PX.1i is not more motion — it is **perceived quality**: the
20% of interaction/polish fixes that move Auxion from "good SaaS" toward "premium AI
transformation company." No new features, no redesign, no new dependency, no backend
surface touched (schema / RLS / domain / API / migration all untouched). Data honesty is
preserved. Everything is token-driven, transform+opacity/colour only, and reduced-motion safe.

## 2. Emotional audit — what was breaking the spell

A repository-first audit (public experience, authenticated experience, motion system, design
tokens, GSAP/ScrollTrigger, theme runtime) surfaced a small number of **high-frequency**
defects — the units a visitor touches most, failing quietly:

1. **The primary button was dead — and invisible in dark contexts.** `Button.module.css`
   set `color: var(--bl-white)` (hardcoded), but the primary fill (`--action-primary` →
   `--action-bg`) resolves to **near-white `#ECEDEF` in the dark token set**. The homepage
   hero is `tone="dark"` (it stamps `data-theme="dark"` on its subtree), so the site's single
   most important CTA — "Start the Health Assessment" — rendered **white text on a near-white
   button**. Worse, `--action-primary-hover` and `--action-primary-press` both alias to the
   same `--action-bg`, so hover and press were **visual no-ops**. The most-clicked element on
   the site had no feedback and unreadable text on the hero.
2. **The signature headline word did not read.** `.heroAccent` clipped `--grad-loop` to text —
   but `--grad-loop` is a `surface-2 → 12% signal-tint` wash, i.e. near-black-grey on the dark
   hero. "One **loop.**" — the emotional payload of the headline — was nearly invisible.
3. **Every card shared one generic 2px lift; inner elements were inert.** Card arrows never
   moved, icons never responded, borders never picked up the brand. Nothing felt handcrafted.
4. **Broken and off-palette colour detailing.** `Stars` referenced `--star-gold`, **a token
   that does not exist** — so ratings rendered in an inherited fallback colour, not gold. Button
   secondary-hover used legacy **cyan** (`--bl-cyan`) and inputs used legacy **slate**
   (`--slate-600`) — the pre-migration blue/slate palette leaking into an "amber, one-signal"
   system.

None of these are "features." They are the difference between a page that feels intentional
and one that feels assembled.

## 3. What shipped (the 20% → 80%)

All changes live in `@brightloop/ui` (+ one homepage stylesheet). No component API changed.

- **Primary/secondary/gradient Button (`Button.module.css`)** — the highest-reach fix.
  - Text now uses the semantic **`--action-fg`**, which flips with the theme → the hero CTA is
    legible in every context (the dark-hero white-on-white bug is gone).
  - Real, theme-correct feedback: hover shifts the fill 12% toward the surface (lightens in
    light, darkens in dark) and lifts `translateY(-1px)` with a soft elevation; press settles to
    `scale(0.98)`. The settle uses the canonical `--ease-precise` curve — mechanical, not springy.
  - **One signal, amber:** secondary-hover moved off legacy cyan onto `--signal` (border + text
    + `--signal-tint` fill). The unused `gradient` variant's text was made contrast-safe (`--ink`).
  - Reduced motion keeps every colour change and drops only the travel.
- **Hero signature accent (`colors.css` + `home.module.css`)** — a new **`--grad-signal`** token
  (a legible amber sheen derived from `--signal`, so it adapts to both themes) replaces the
  invisible `--grad-loop` on `.heroAccent`. The headline's accented word now carries confident
  amber weight on the dark field.
- **Card interaction vocabulary (`Card.module.css`)** — the shared `.interactive` hover now uses
  `--ease-precise`, a restrained **amber-tinted edge** (interaction feedback = the one signal),
  and a slightly more deliberate `-3px` lift.
- **Handcrafted card details (`ServiceCard`, `CaseStudyCard`)** — the "go" arrow travels
  `translateX(4px)` on card hover and the discipline icon-tile intensifies — the small,
  deliberate cues Linear/Vercel share. Reduced motion drops the travel.
- **Colour-detail correctness** — `Stars` now render the amber `--signal` (filled) over a
  neutral `--line-strong` (empty), fixing the phantom `--star-gold`. Inputs (`Field.module.css`)
  drop legacy slate: hover warms toward `--signal`, focus picks up a `--signal` border under the
  global ring — one coherent accent across every form (funnel, contact, start).
- **Closing CTA (`CTASection.module.css`)** — raised as a deliberate panel (`--elevation-2`)
  rather than a flat band; its buttons now carry the new lift.

## 4. Authenticated product — left restrained (by design)

The emotional direction for the app is *clarity → control → confidence → speed*, not the
landing page's *arrival → conversion*. The button, card, form, and rating polish here are
shared primitives, so the app inherits the correctness fixes (legible primary action in dark,
real focus/hover states, honest ratings) **without** gaining any landing-page theatrics. No
portfolio-style or scroll motion entered the app bundle.

## 5. Reduced motion · theme · accessibility · performance

- **Reduced motion:** every new transform (button lift/press, card lift, arrow/icon travel) is
  dropped under `prefers-reduced-motion: reduce`; all colour/feedback states remain. Content is
  never hidden.
- **Theme:** all changes resolve from semantic tokens (`--action-fg`, `--signal`, `--signal-tint`,
  `--line-strong`, `--ink`, the new `--grad-signal`) in both Light and Dark. The dark-mode
  primary-button legibility bug is fixed as a direct consequence.
- **Accessibility:** the global focus ring is untouched and now reinforced by a signal border on
  inputs; motion is never the sole state indicator; the ratings fix improves, not replaces, the
  numeric `showValue`.
- **Performance:** pure CSS — no JS, no new dependency, no added bundle weight. Transforms are
  compositor-friendly (transform/opacity only).

## 6. Full gate (local)

`pnpm turbo run typecheck lint test build` — see the branch's final run.
Database/security CI gates (migrate · pgTAP · RLS · adapter · type-drift · gitleaks) are
unchanged by this branch and run on CI.

## 7. Visual verification — honest limitation

As with every prior PX report, interactive visual QA (Light/Dark/System × desktop/mobile ×
reduced-motion, and the running hover/press feedback) could **not** be captured here: the
Browser pane does not composite frames or hydrate the client runtime in this environment. What
was verified: the CSS resolves correctly by construction (the dark-token trace above), all
structure compiles, and typecheck/lint/tests/build are green. A reviewer should eyeball the
Vercel preview — the hero CTA legibility, the accent word, and the button/card feedback are the
things to look at.

## 8. Files

**Modified (ui):** `tokens/colors.css` (+`--grad-signal`) · `components/Button.module.css` ·
`components/Card.module.css` · `components/ServiceCard.module.css` · `components/ServiceCard.tsx` ·
`components/CaseStudyCard.module.css` · `components/CaseStudyCard.tsx` · `components/Stars.module.css` ·
`components/Field.module.css` · `components/CTASection.module.css`.
**Modified (web):** `app/(public)/home.module.css`.
**Docs:** this report.
