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

// Motion preset system — the single source of truth for how everything animates.
export { PRESET, type PresetName, type PresetSpec } from "./presets.config";
export {
  dashboardEntrance,
  metricReveal,
  pipelineReveal,
  pageTransition as pageTransitionPreset,
  drawer as drawerPreset,
  modalEnter,
  modalExit,
  toastEnter,
  toastExit,
  type PresetOptions,
} from "./presets";

// Client components (each declares "use client").
export { MotionProvider, useMotion } from "./MotionProvider";
export { useReducedMotion } from "./useReducedMotion";
export { useDrawerSlide } from "./useDrawerSlide";
export { DashboardEntrance } from "./DashboardEntrance";
export { AnimatedMetric } from "./AnimatedMetric";
export { PipelineAnimation } from "./PipelineAnimation";
export { PageTransition } from "./PageTransition";

/* ---- PUBLIC / marketing motion layer (PX.1h) ------------------------------ */

// Pure, gsap-free — the editorial vocabulary + scroll-story data.
export {
  PUBLIC_DURATION,
  PUBLIC_OFFSET,
  PUBLIC_STAGGER,
  MARQUEE,
  PARALLAX,
  SCRUB,
  PUBLIC_PRESET,
  HERO_SEQUENCE,
  JOURNEY_STAGES,
  type PublicPresetName,
  type PublicSpec,
  type HeroStep,
  type JourneyStage,
} from "./public.config";

// gsap builders (client).
export {
  reveal,
  revealStagger,
  maskReveal,
  heroSequence,
  countUp,
  type PublicOptions,
  type CountOptions,
} from "./public";

// Raw gsap + useGSAP for bespoke app-level public animations (client).
export { gsap, useGSAP } from "./gsapClient";

// ScrollTrigger registration + intro handoff (client).
export { registerScrollTrigger, ScrollTrigger } from "./scroll";
export { markIntroReady, whenIntroReady, isIntroReady, INTRO_READY_EVENT } from "./intro";

// Public motion host components (client).
export { Reveal, type RevealProps } from "./Reveal";
export { Parallax, type ParallaxProps } from "./Parallax";
export { CountUp, type CountUpProps } from "./CountUp";
export { HeroSequence, type HeroSequenceProps } from "./HeroSequence";
