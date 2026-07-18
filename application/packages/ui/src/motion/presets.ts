"use client";

/* =============================================================================
 * Motion presets — the reusable GSAP builders every feature animates through.
 *
 * Components call these instead of hand-writing timelines, so motion stays
 * cohesive and token-driven (see presets.config.ts). Each builder:
 *   - reads its timing from PRESET (never inline numbers),
 *   - animates transform + opacity ONLY,
 *   - honours reduced motion by snapping to the final state (no tween),
 *   - returns the gsap instance so the caller's useGSAP() scope reverts it.
 * ========================================================================== */

import { gsap } from "gsap";
import { PRESET } from "./presets.config";
import { DASHBOARD_SEQUENCE } from "./sequence";
import { DURATION } from "./tokens";

type Targets = gsap.TweenTarget;
export interface PresetOptions {
  /** Snap to the final state instead of animating (prefers-reduced-motion). */
  reduced?: boolean;
  /** Extra start delay (seconds). */
  delay?: number;
}

/* ---- entrance / reveal ---------------------------------------------------- */

/**
 * The dashboard's one coordinated entrance timeline. Reveals each
 * `[data-animate="<step>"]` group in the canonical order with connected overlaps.
 * Scope selection is left to the caller's useGSAP scope.
 */
export function dashboardEntrance(opts: PresetOptions = {}): gsap.core.Timeline {
  const spec = PRESET.dashboardEntrance;
  const tl = gsap.timeline({ delay: opts.delay });
  let placed = false;
  for (const step of DASHBOARD_SEQUENCE) {
    const targets = gsap.utils.toArray<HTMLElement>(`[data-animate="${step.step}"]`);
    if (targets.length === 0) continue;
    if (opts.reduced) {
      tl.set(targets, { opacity: 1, y: 0 });
      continue;
    }
    tl.from(
      targets,
      { opacity: 0, y: spec.offset, duration: spec.duration, ease: spec.ease, stagger: step.stagger },
      placed ? `-=${Math.abs(step.overlap)}` : 0,
    );
    placed = true;
  }
  return tl;
}

/** Reveal a metric row/grid together (used inside a scoped useGSAP). */
export function metricReveal(targets: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.metricReveal;
  if (opts.reduced) return gsap.set(targets, { opacity: 1, y: 0 });
  return gsap.from(targets, {
    opacity: 0,
    y: spec.offset,
    duration: spec.duration,
    ease: spec.ease,
    stagger: spec.stagger,
    delay: opts.delay,
  });
}

/** Reveal the transformation-loop stages left-to-right. */
export function pipelineReveal(targets: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.pipelineReveal;
  if (opts.reduced) return gsap.set(targets, { opacity: 1, y: 0 });
  return gsap.from(targets, {
    opacity: 0,
    y: spec.offset,
    duration: spec.duration,
    ease: spec.ease,
    stagger: spec.stagger,
    delay: opts.delay,
  });
}

/** A subtle whole-page enter (section pages, modeless surfaces). */
export function pageTransition(target: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.pageTransition;
  if (opts.reduced) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.from(target, {
    opacity: 0,
    y: spec.offset,
    duration: spec.duration,
    ease: spec.ease,
    delay: opts.delay,
  });
}

/* ---- drawer --------------------------------------------------------------- */

/** Slide an off-canvas panel + fade its scrim in/out per `open`. */
export function drawer(
  open: boolean,
  panel: Element,
  scrim: Element | null,
  opts: PresetOptions = {},
): void {
  const spec = open ? PRESET.drawerOpen : PRESET.drawerClose;
  const panelTo = { xPercent: open ? 0 : -100 };
  const scrimTo = { autoAlpha: open ? 1 : 0 };
  if (opts.reduced) {
    gsap.set(panel, panelTo);
    if (scrim) gsap.set(scrim, scrimTo);
    return;
  }
  gsap.to(panel, { ...panelTo, duration: spec.duration, ease: spec.ease });
  if (scrim) gsap.to(scrim, { ...scrimTo, duration: DURATION.fast, ease: spec.ease });
}

/* ---- overlays (future-ready: modal + toast) ------------------------------- */

/** Modal appearing — opacity + tiny scale-up (transform only). */
export function modalEnter(target: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.modalEnter;
  if (opts.reduced) return gsap.set(target, { opacity: 1, scale: 1 });
  return gsap.from(target, {
    opacity: 0,
    scale: spec.scale,
    duration: spec.duration,
    ease: spec.ease,
    delay: opts.delay,
  });
}

/** Modal dismissing. Returns the tween so callers can await onComplete. */
export function modalExit(target: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.modalExit;
  if (opts.reduced) return gsap.set(target, { opacity: 0 });
  return gsap.to(target, { opacity: 0, scale: spec.scale, duration: spec.duration, ease: spec.ease });
}

/** Toast entering — slide up + fade. */
export function toastEnter(target: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.toastEnter;
  if (opts.reduced) return gsap.set(target, { opacity: 1, y: 0 });
  return gsap.from(target, {
    opacity: 0,
    y: spec.offset,
    duration: spec.duration,
    ease: spec.ease,
    delay: opts.delay,
  });
}

/** Toast leaving. */
export function toastExit(target: Targets, opts: PresetOptions = {}): gsap.core.Tween {
  const spec = PRESET.toastExit;
  if (opts.reduced) return gsap.set(target, { opacity: 0 });
  return gsap.to(target, { opacity: 0, y: spec.offset, duration: spec.duration, ease: spec.ease });
}
