"use client";

/* =============================================================================
 * PUBLIC motion builders — the editorial GSAP layer for the marketing site.
 *
 * Same discipline as presets.ts: read timing from PUBLIC_PRESET (never inline
 * numbers), animate transform + opacity ONLY, snap to the final state under
 * reduced motion, and return the gsap instance so the caller's useGSAP() scope
 * reverts it on unmount. These are used by the public motion hosts (Reveal,
 * HeroSequence, Parallax, CountUp) and the marketing sections.
 * ========================================================================== */

import { gsap } from "gsap";
import { PUBLIC_PRESET, HERO_SEQUENCE } from "./public.config";

type Targets = gsap.TweenTarget;

export interface PublicOptions {
  /** Snap to final state instead of animating (prefers-reduced-motion). */
  reduced?: boolean;
  /** Extra start delay (seconds). */
  delay?: number;
  /** Build the timeline paused (caller plays it — e.g. after the preloader). */
  paused?: boolean;
}

/* ---- reveals -------------------------------------------------------------- */

/** A single element (or set) arriving — fade + rise. Starts hidden. */
export function reveal(targets: Targets, opts: PublicOptions = {}): gsap.core.Tween {
  const spec = PUBLIC_PRESET.reveal;
  if (opts.reduced) return gsap.set(targets, { opacity: 1, y: 0 });
  return gsap.from(targets, {
    opacity: 0,
    y: spec.offset,
    duration: spec.duration,
    ease: spec.ease,
    delay: opts.delay,
  });
}

/** A group arriving together with a small stagger. */
export function revealStagger(targets: Targets, opts: PublicOptions = {}): gsap.core.Tween {
  const spec = PUBLIC_PRESET.revealStagger;
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

/**
 * A masked line reveal — the element rises from behind its (overflow-hidden)
 * wrapper. Transform + opacity only; the mask itself is CSS on the parent.
 */
export function maskReveal(targets: Targets, opts: PublicOptions = {}): gsap.core.Tween {
  const spec = PUBLIC_PRESET.maskReveal;
  if (opts.reduced) return gsap.set(targets, { yPercent: 0, opacity: 1 });
  return gsap.from(targets, {
    yPercent: 110,
    opacity: 0,
    duration: spec.duration,
    ease: spec.ease,
    stagger: spec.stagger,
    delay: opts.delay,
  });
}

/* ---- hero signature entrance --------------------------------------------- */

/**
 * The hero's one coordinated entrance timeline. Reveals each
 * `[data-hero="<key>"]` group in canonical order with connected overlaps, giving
 * each step a treatment appropriate to its role (mask for the headline, a scale
 * pop for the loop core, a staggered arrival for the nodes). Scope selection is
 * left to the caller's useGSAP scope. Snaps everything visible under reduced
 * motion so the hero is instantly complete and readable.
 */
export function heroSequence(opts: PublicOptions = {}): gsap.core.Timeline {
  const heroDur = PUBLIC_PRESET.heroStep.duration;
  const ease = PUBLIC_PRESET.heroStep.ease;
  const tl = gsap.timeline({ delay: opts.delay, paused: opts.paused });
  let placed = false;

  for (const step of HERO_SEQUENCE) {
    const targets = gsap.utils.toArray<HTMLElement>(`[data-hero="${step.key}"]`);
    if (targets.length === 0) continue;
    const at = placed ? `>${step.overlap}` : 0;

    if (opts.reduced) {
      tl.set(targets, { opacity: 1, y: 0, yPercent: 0, scale: 1 });
      placed = true;
      continue;
    }

    switch (step.kind) {
      case "mask":
        tl.from(
          targets,
          { yPercent: 110, opacity: 0, duration: PUBLIC_PRESET.maskReveal.duration, ease, stagger: step.stagger },
          at,
        );
        break;
      case "loopRing":
        tl.from(targets, { opacity: 0, scale: 0.7, duration: PUBLIC_PRESET.draw.duration, ease }, at);
        break;
      case "loopNodes":
        // Scale + fade only — the nodes are absolutely positioned via CSS
        // transforms (translateX/Y centering), so we avoid adding y and disturbing it.
        tl.from(
          targets,
          { opacity: 0, scale: 0.6, duration: heroDur, ease, stagger: step.stagger, transformOrigin: "center center" },
          at,
        );
        break;
      case "loopCore":
        tl.from(targets, { opacity: 0, scale: 0.5, duration: heroDur, ease: "back.out(1.6)" }, at);
        break;
      default: // "rise"
        tl.from(
          targets,
          { opacity: 0, y: PUBLIC_PRESET.heroStep.offset, duration: heroDur, ease, stagger: step.stagger },
          at,
        );
    }
    placed = true;
  }
  return tl;
}

/* ---- number count-up ------------------------------------------------------ */

export interface CountOptions extends PublicOptions {
  /** Decimal places to preserve (e.g. a 4.9 rating → 1). */
  decimals?: number;
  /** Text appended after the number (e.g. "+", "%"). */
  suffix?: string;
  /** Text prepended before the number. */
  prefix?: string;
}

/**
 * Count a numeric element up to `to`. Writes textContent on each tick; under
 * reduced motion it writes the final value once (no tween). Returns the tween so
 * a useGSAP scope reverts it.
 */
export function countUp(el: HTMLElement, to: number, opts: CountOptions = {}): gsap.core.Tween {
  const decimals = opts.decimals ?? 0;
  const prefix = opts.prefix ?? "";
  const suffix = opts.suffix ?? "";
  const write = (v: number) => {
    el.textContent = `${prefix}${v.toFixed(decimals)}${suffix}`;
  };
  if (opts.reduced) {
    write(to);
    return gsap.set(el, {});
  }
  const state = { v: 0 };
  return gsap.to(state, {
    v: to,
    duration: PUBLIC_PRESET.counter.duration,
    ease: PUBLIC_PRESET.counter.ease,
    delay: opts.delay,
    onUpdate: () => write(state.v),
  });
}
