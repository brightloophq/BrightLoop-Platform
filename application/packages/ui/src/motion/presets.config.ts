/* =============================================================================
 * Motion preset SPECS — the single, pure source of truth for how every Auxion
 * animation is timed. No gsap here, so these are safe to import anywhere and are
 * unit-tested. The gsap builders in presets.ts read these; components never pick
 * their own durations/easings/staggers, which is what makes the whole platform
 * feel like one product rather than a pile of isolated animations.
 *
 * Every value derives from the shared motion tokens (tokens.ts). Adding a value
 * here is the ONLY sanctioned way to introduce a new motion.
 * ========================================================================== */

import { DURATION, EASE, STAGGER, OFFSET_Y } from "./tokens";

/** Common shape a preset spec may carry. All optional except duration/ease. */
export interface PresetSpec {
  readonly duration: number;
  readonly ease: string;
  /** Per-item stagger (seconds) for grouped reveals. */
  readonly stagger?: number;
  /** Small transform-only travel (px). */
  readonly offset?: number;
  /** Scale start/end for enter/exit (transform-only). */
  readonly scale?: number;
}

/**
 * The named preset catalogue. Future features reuse these keys; they must not
 * invent local timings.
 */
export const PRESET = {
  /** The dashboard's coordinated entrance (header → metrics → pipeline → …). */
  dashboardEntrance: { duration: DURATION.base, ease: EASE.out, offset: OFFSET_Y },
  /** A row/grid of metric cards revealing together. */
  metricReveal: { duration: DURATION.base, ease: EASE.out, stagger: STAGGER.tight, offset: OFFSET_Y },
  /** The transformation-loop stages revealing left-to-right. */
  pipelineReveal: { duration: DURATION.base, ease: EASE.out, stagger: STAGGER.tight, offset: OFFSET_Y },
  /** Off-canvas drawer sliding in. */
  drawerOpen: { duration: DURATION.base, ease: EASE.out },
  /** Off-canvas drawer sliding out. */
  drawerClose: { duration: DURATION.base, ease: EASE.out },
  /** A subtle whole-page enter for surfaces without the full sequence. */
  pageTransition: { duration: DURATION.base, ease: EASE.out, offset: OFFSET_Y },
  /** Modal appearing (opacity + tiny scale up). */
  modalEnter: { duration: DURATION.base, ease: EASE.out, scale: 0.98 },
  /** Modal dismissing (faster, ease-in-out). */
  modalExit: { duration: DURATION.fast, ease: EASE.inOut, scale: 0.98 },
  /** Toast sliding up into view. */
  toastEnter: { duration: DURATION.base, ease: EASE.out, offset: OFFSET_Y },
  /** Toast leaving. */
  toastExit: { duration: DURATION.fast, ease: EASE.inOut, offset: OFFSET_Y },
} as const satisfies Record<string, PresetSpec>;

export type PresetName = keyof typeof PRESET;
