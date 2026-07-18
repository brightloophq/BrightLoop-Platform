"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { pageTransition } from "./presets";
import { useMotion } from "./MotionProvider";

/**
 * A subtle page-enter reveal for surfaces that don't run the full dashboard
 * sequence (e.g. section pages) — a thin host around the `pageTransition` preset.
 * Content is visible by default; reduced motion snaps.
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
      if (scope.current) pageTransition(scope.current, { reduced: reducedMotion });
    },
    { scope, dependencies: [reducedMotion] },
  );

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
