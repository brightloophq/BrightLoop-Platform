"use client";

import { useRef, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DURATION, EASE, OFFSET_Y, shouldAnimate } from "./tokens";
import { useMotion } from "./MotionProvider";

/**
 * A subtle page-enter reveal for surfaces that don't run the full dashboard
 * sequence (e.g. section pages). A single short translate/opacity tween on the
 * wrapper — enough to feel intentional, never enough to delay usability. Content
 * is visible by default; reduced-motion skips the tween.
 */
export function PageTransition({
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
      if (!shouldAnimate(reducedMotion)) return;
      gsap.from(scope.current, {
        opacity: 0,
        y: OFFSET_Y,
        duration: DURATION.base,
        ease: EASE.out,
      });
    },
    { scope, dependencies: [reducedMotion] },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
