/* =============================================================================
 * Dashboard entrance sequence — the ORDER of the coordinated reveal, as pure
 * data. Keeping the choreography as data (not buried in a gsap callback) means
 * the timeline is testable and the intent is legible: header first, then the
 * metric row, then the pipeline, then attention, then activity.
 *
 * No gsap import here — DashboardEntrance reads this to build the timeline.
 * ========================================================================== */

import { STAGGER, type Duration } from "./tokens";

/** A named group of elements, matched in the DOM by `[data-animate="<step>"]`. */
export interface SequenceStep {
  /** data-animate value the elements carry. */
  readonly step: string;
  /** Duration key for this step's tween. */
  readonly duration: Duration;
  /** Stagger (seconds) between elements in the group; 0 = move as one. */
  readonly stagger: number;
  /**
   * Timeline position (seconds) relative to the PREVIOUS step's start. A small
   * negative overlap keeps the whole sequence quick and connected rather than
   * a slow relay. The first step starts at 0.
   */
  readonly overlap: number;
}

/**
 * The canonical dashboard entrance:
 *   header → metric cards (stagger) → pipeline → attention → activity.
 */
export const DASHBOARD_SEQUENCE: readonly SequenceStep[] = [
  { step: "header", duration: "base", stagger: 0, overlap: 0 },
  { step: "metric", duration: "base", stagger: STAGGER.base, overlap: -0.12 },
  { step: "pipeline", duration: "base", stagger: STAGGER.tight, overlap: -0.1 },
  { step: "attention", duration: "base", stagger: STAGGER.base, overlap: -0.1 },
  { step: "activity", duration: "base", stagger: STAGGER.tight, overlap: -0.1 },
];

/** The ordered list of step names — handy for tests and assertions. */
export function sequenceOrder(steps: readonly SequenceStep[] = DASHBOARD_SEQUENCE): string[] {
  return steps.map((s) => s.step);
}
