"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { dashboardEntrance } from "./presets";
import { useMotion } from "./MotionProvider";

/**
 * The dashboard's coordinated entrance — a thin host around the
 * `dashboardEntrance` motion preset. It reveals `[data-animate="<step>"]` groups
 * in the canonical order (header → metrics → pipeline → attention → activity)
 * as one timeline, scoped so useGSAP reverts it on unmount.
 *
 * Content is fully visible in CSS by default (no blank screen waiting for JS);
 * the preset snaps instantly under prefers-reduced-motion.
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

  useGSAP(() => dashboardEntrance({ reduced: reducedMotion }), {
    scope,
    dependencies: [reducedMotion],
  });

  return (
    <div ref={scope} className={className}>
      {children}
    </div>
  );
}
