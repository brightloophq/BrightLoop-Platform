/* =============================================================================
 * PUBLIC motion SPECS — the pure, editorial vocabulary for Auxion's marketing
 * surface. Separate from the operational PRESET catalogue on purpose: the
 * authenticated product is fast/restrained (small travel, short durations); the
 * public site is expressive/agency-grade (larger travel, longer arrivals, scroll
 * choreography). Keeping the two vocabularies distinct is what lets the app stay
 * calm while the landing page performs.
 *
 * PURE constants (no gsap, no DOM) — safe to import from server components and to
 * unit-test in node. The gsap builders in public.ts read these; the scroll hosts
 * read these; nothing invents its own timing.
 *
 * Every value still descends from the shared EASE curves (tokens.ts) so the two
 * layers feel related, not foreign.
 * ========================================================================== */

import { EASE } from "./tokens";

/** Durations in SECONDS (GSAP's unit). Editorial scale — longer than the app. */
export const PUBLIC_DURATION = {
  reveal: 0.7, //  scroll reveals — content arriving with presence
  hero: 0.9, //    hero headline / signature moment
  mask: 0.8, //    masked line reveal
  draw: 1.1, //    SVG line / ring draw-in
  counter: 1.4, //  number count-up
} as const;

/** Transform-only travel (px). Bigger than the app's 12px, still tasteful. */
export const PUBLIC_OFFSET = {
  reveal: 28,
  hero: 40,
} as const;

/** Per-item stagger (seconds) for grouped/editorial reveals. */
export const PUBLIC_STAGGER = {
  tight: 0.06,
  base: 0.09,
  loose: 0.14,
} as const;

/**
 * Marquee tuning. Speed is px/second so the loop reads the same regardless of
 * content width; a slow, confident drift — never a frantic ticker. The track
 * pauses on hover/focus (a calm, premium touch) and is fully static under
 * reduced motion.
 */
export const MARQUEE = {
  speedPxPerSec: 42,
} as const;

/** Parallax: the maximum transform-only travel (px) across a full scroll pass. */
export const PARALLAX = {
  subtle: 24,
  base: 48,
} as const;

/** ScrollTrigger scrub smoothing (seconds) for scroll-linked timelines. */
export const SCRUB = 0.6;

/** Common shape for a public preset spec. */
export interface PublicSpec {
  readonly duration: number;
  readonly ease: string;
  readonly stagger?: number;
  readonly offset?: number;
}

/**
 * The named PUBLIC preset catalogue. Marketing surfaces reuse these keys and
 * never inline their own numbers.
 */
export const PUBLIC_PRESET = {
  /** A single element arriving on scroll — fade + rise. */
  reveal: { duration: PUBLIC_DURATION.reveal, ease: EASE.enter, offset: PUBLIC_OFFSET.reveal },
  /** A group arriving together with a small stagger. */
  revealStagger: {
    duration: PUBLIC_DURATION.reveal,
    ease: EASE.enter,
    offset: PUBLIC_OFFSET.reveal,
    stagger: PUBLIC_STAGGER.base,
  },
  /** A headline/label line wiped up from behind a mask (transform-only). */
  maskReveal: { duration: PUBLIC_DURATION.mask, ease: EASE.enter, stagger: PUBLIC_STAGGER.base },
  /** A hero element in the signature entrance timeline. */
  heroStep: { duration: PUBLIC_DURATION.hero, ease: EASE.enter, offset: PUBLIC_OFFSET.hero },
  /** An SVG stroke/ring drawing itself in (dashoffset → 0). */
  draw: { duration: PUBLIC_DURATION.draw, ease: EASE.enter },
  /** A metric counting up to its final value. */
  counter: { duration: PUBLIC_DURATION.counter, ease: EASE.enter },
} as const satisfies Record<string, PublicSpec>;

export type PublicPresetName = keyof typeof PUBLIC_PRESET;

/* ---- Hero entrance choreography (pure data) ------------------------------- */

/**
 * The hero's signature entrance, as ordered pure data. Each step selects its
 * targets by a `data-hero="<key>"` attribute (the marker/host pattern used
 * elsewhere) so the hero markup stays server-rendered and the timeline is the
 * only client code. `overlap` connects steps into one flowing sequence (negative
 * = start before the previous finishes); `stagger` groups multi-element steps.
 */
export interface HeroStep {
  readonly key: string;
  readonly stagger?: number;
  readonly overlap: number; // seconds; negative overlaps into the previous step
  /** Optional treatment override; defaults to fade+rise. */
  readonly kind?: "rise" | "mask" | "loopRing" | "loopNodes" | "loopCore";
}

export const HERO_SEQUENCE: readonly HeroStep[] = [
  { key: "eyebrow", overlap: 0, kind: "rise" },
  { key: "title", overlap: -0.35, kind: "mask", stagger: PUBLIC_STAGGER.base },
  { key: "sub", overlap: -0.45, kind: "rise" },
  { key: "actions", overlap: -0.4, kind: "rise" },
  { key: "note", overlap: -0.5, kind: "rise" },
  { key: "loopRing", overlap: -0.9, kind: "loopRing" },
  { key: "loopNode", overlap: -0.7, kind: "loopNodes", stagger: PUBLIC_STAGGER.loose },
  { key: "loopCore", overlap: -0.4, kind: "loopCore" },
] as const;

/* ---- Transformation journey (pure data — the scroll story) ---------------- */

/**
 * The public narrative: the loop, told as a journey. These are the CANONICAL
 * public disciplines (Brand · Build · Automate · Grow) — the same four the hero
 * loop and the homepage already use. No invented "phases", no admin-only terms.
 * The scroll story lights each stage in turn and advances the copy.
 */
export interface JourneyStage {
  readonly n: string; // "01"…
  readonly discipline: "Brand" | "Build" | "Automate" | "Grow";
  readonly title: string;
  readonly body: string;
  readonly icon: string;
}

export const JOURNEY_STAGES: readonly JourneyStage[] = [
  {
    n: "01",
    discipline: "Brand",
    title: "Earn the click",
    body: "A brand system that makes a small business look established — identity, voice and design that make people choose you before they compare.",
    icon: "pen-tool",
  },
  {
    n: "02",
    discipline: "Build",
    title: "Convert the visit",
    body: "The website and funnels that turn attention into action — fast, credible, and engineered so the click becomes a customer.",
    icon: "layout-grid",
  },
  {
    n: "03",
    discipline: "Automate",
    title: "Catch every signal",
    body: "The operations layer that follows up, routes work and never drops a lead — the system running quietly behind the brand.",
    icon: "workflow",
  },
  {
    n: "04",
    discipline: "Grow",
    title: "Compound the result",
    body: "Analytics and continuous optimisation that turn what worked into what scales — the loop closing and starting again, stronger.",
    icon: "trending-up",
  },
] as const;
