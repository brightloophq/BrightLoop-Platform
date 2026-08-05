"use client";

/* =============================================================================
 * Parallax — subtle, scroll-linked depth for a single element.
 *
 * Moves its child a small, transform-only distance as it passes through the
 * viewport (scrubbed to scroll). Reduced motion → a no-op (renders a plain div,
 * no transform, no ScrollTrigger). Kept small on purpose: depth, not drama.
 * ========================================================================== */

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { registerScrollTrigger } from "./scroll";
import { PARALLAX, SCRUB } from "./public.config";
import { useReducedMotion } from "./useReducedMotion";

export interface ParallaxProps {
  className?: string;
  /** Half-travel (px). The element moves from +distance to -distance. */
  distance?: number;
  children: ReactNode;
}

export function Parallax({ className, distance = PARALLAX.subtle, children }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduced) return;
      registerScrollTrigger();
      gsap.fromTo(
        el,
        { y: distance },
        {
          y: -distance,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: SCRUB },
        },
      );
    },
    { scope: ref, dependencies: [reduced, distance] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
