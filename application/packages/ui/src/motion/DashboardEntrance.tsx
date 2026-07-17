"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DURATION, EASE, OFFSET_Y, shouldAnimate } from "./tokens";
import { DASHBOARD_SEQUENCE } from "./sequence";
import { useMotion } from "./MotionProvider";

/**
 * The dashboard's single coordinated entrance timeline.
 *
 * It reveals element groups in order — header → metrics → pipeline → attention →
 * activity — where each group is any descendant carrying `data-animate="<step>"`
 * (AnimatedMetric / PipelineAnimation add these). One `gsap.timeline` drives the
 * whole sequence so it reads as one intentional motion, not five independent ones.
 *
 * Safety:
 *   - Content is fully visible in CSS by default, so there is NEVER a blank screen
 *     waiting for JS (and no-JS / slow-JS just shows the finished layout).
 *   - useGSAP() runs in a layout effect and reverts every tween on unmount, so
 *     nothing leaks across route changes.
 *   - `gsap.from` only touches transform + opacity — no layout properties.
 *   - prefers-reduced-motion → the timeline is skipped entirely.
 */
export function DashboardEntrance({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotion();

  useGSAP(
    () => {
      if (!shouldAnimate(reducedMotion)) return; // leave elements in their visible state
      const tl = gsap.timeline();
      let placed = false;
      for (const s of DASHBOARD_SEQUENCE) {
        const targets = gsap.utils.toArray<HTMLElement>(`[data-animate="${s.step}"]`);
        if (targets.length === 0) continue;
        tl.from(
          targets,
          {
            opacity: 0,
            y: OFFSET_Y,
            duration: DURATION[s.duration],
            ease: EASE.out,
            stagger: s.stagger,
          },
          placed ? `-=${Math.abs(s.overlap)}` : 0,
        );
        placed = true;
      }
    },
    { scope, dependencies: [reducedMotion] },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
