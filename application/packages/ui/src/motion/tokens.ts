/* =============================================================================
 * Auxion motion tokens — the shared vocabulary for every GSAP timeline.
 *
 * These are PURE constants (no gsap import), so they are safe to consume from
 * server components and to unit-test in a node environment. They mirror the
 * CSS motion tokens in @brightloop/ui/tokens.css (--dur-*, --ease-out) so GSAP
 * sequences and CSS transitions feel like one system.
 *
 * Principles: premium, professional, purposeful, fast, subtle, operational —
 * never flashy. Durations are short; movement is small; only transform + opacity
 * are ever animated.
 * ========================================================================== */

/** Durations in SECONDS (GSAP's unit), matching the CSS ms tokens. */
export const DURATION = {
  fast: 0.14, // --dur-fast 140ms — micro reveals
  base: 0.24, // --dur-base 240ms — standard element entrance
  slow: 0.42, // --dur-slow 420ms — the longest a coordinated step should take
} as const;

/** Easing curves. `out` mirrors --ease-out cubic-bezier(.16,1,.3,1). */
export const EASE = {
  out: "power3.out",
  inOut: "power2.inOut",
} as const;

/** Stagger (seconds) for grouped reveals — small enough to read as one motion. */
export const STAGGER = {
  tight: 0.04,
  base: 0.06,
  loose: 0.09,
} as const;

/** The distance (px) an entering element travels. Kept small and transform-only. */
export const OFFSET_Y = 12;

export type Duration = keyof typeof DURATION;
export type Ease = keyof typeof EASE;

/**
 * Should motion play at all? Central decision so every component honours the
 * user's OS-level "reduce motion" setting identically. `prefersReduced` is the
 * result of `matchMedia("(prefers-reduced-motion: reduce)")`.
 */
export function shouldAnimate(prefersReduced: boolean): boolean {
  return !prefersReduced;
}
