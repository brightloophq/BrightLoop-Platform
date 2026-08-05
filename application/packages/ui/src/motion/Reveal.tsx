"use client";

/* =============================================================================
 * Reveal — the workhorse scroll-reveal host for the public site.
 *
 * Wraps server-rendered content and, once it scrolls into view, reveals the
 * elements marked `data-reveal` inside it (falling back to its direct children)
 * with a small fade + rise + stagger. Content stays in the DOM and server-
 * rendered; this component only choreographs its arrival.
 *
 * Discipline: transform + opacity only; timing from PUBLIC_PRESET; reduced motion
 * shows everything immediately (nothing is ever hidden from a reduce-motion or
 * no-JS user — the hidden state is applied in JS, after hydration, only when
 * motion is allowed). useGSAP reverts all tweens + kills the ScrollTrigger on
 * unmount, so nothing leaks across route changes.
 * ========================================================================== */

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { registerScrollTrigger } from "./scroll";
import { PUBLIC_PRESET } from "./public.config";
import { useReducedMotion } from "./useReducedMotion";

export interface RevealProps {
  /** Element to render (default "div"). */
  as?: ElementType;
  className?: string;
  /** Reveal each element with a stagger (default). If false, reveal as one. */
  stagger?: boolean;
  /** Replay every time it re-enters (default false → reveal once). */
  repeat?: boolean;
  /** Viewport start position (ScrollTrigger `start`). */
  start?: string;
  id?: string;
  children: ReactNode;
}

export function Reveal({
  as,
  className,
  stagger = true,
  repeat = false,
  start = "top 84%",
  id,
  children,
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      const scope = ref.current;
      if (!scope || reduced) return; // reduced motion → content stays visible, no motion

      const marked = scope.querySelectorAll<HTMLElement>("[data-reveal]");
      const targets: HTMLElement[] = marked.length
        ? Array.from(marked)
        : (Array.from(scope.children) as HTMLElement[]);
      if (targets.length === 0) return;

      const spec = PUBLIC_PRESET.revealStagger;
      // Hide first (post-hydration only), then reveal on enter — no pre-hydration flash gap.
      gsap.set(targets, { opacity: 0, y: spec.offset });

      const ST = registerScrollTrigger();
      ST.create({
        trigger: scope,
        start,
        once: !repeat,
        onEnter: () =>
          gsap.to(targets, {
            opacity: 1,
            y: 0,
            duration: spec.duration,
            ease: spec.ease,
            stagger: stagger ? spec.stagger : 0,
            overwrite: "auto",
          }),
        // If replaying, reset when scrolled back above the trigger.
        onLeaveBack: repeat ? () => gsap.set(targets, { opacity: 0, y: spec.offset }) : undefined,
      });
    },
    { scope: ref, dependencies: [reduced, repeat, stagger, start] },
  );

  return (
    <Tag ref={ref} className={className} id={id}>
      {children}
    </Tag>
  );
}
