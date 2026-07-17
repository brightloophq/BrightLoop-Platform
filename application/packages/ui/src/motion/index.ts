/* =============================================================================
 * @brightloop/ui/motion — Auxion's motion engine (GSAP).
 *
 * A small, reusable layer for the app's coordinated animations. GSAP is reserved
 * for coordinated sequences, timelines, the dashboard entrance, pipeline
 * progression, the mobile drawer, and page transitions — hover/focus/button
 * micro-interactions stay as CSS transitions (the tokens.css duration/easing vars).
 *
 * Pure tokens/sequence (no gsap) are safe to import anywhere and are unit-tested;
 * the components below are client-only and use useGSAP() for automatic cleanup.
 * ========================================================================== */

// Pure, gsap-free — importable from server components and tests.
export {
  DURATION,
  EASE,
  STAGGER,
  OFFSET_Y,
  shouldAnimate,
  type Duration,
  type Ease,
} from "./tokens";
export { DASHBOARD_SEQUENCE, sequenceOrder, type SequenceStep } from "./sequence";

// Client components (each declares "use client").
export { MotionProvider, useMotion } from "./MotionProvider";
export { useReducedMotion } from "./useReducedMotion";
export { useDrawerSlide } from "./useDrawerSlide";
export { DashboardEntrance } from "./DashboardEntrance";
export { AnimatedMetric } from "./AnimatedMetric";
export { PipelineAnimation } from "./PipelineAnimation";
export { PageTransition } from "./PageTransition";
