"use client";

import type { RefObject } from "react";
import { useGSAP } from "@gsap/react";
import { drawer } from "./presets";
import { useMotion } from "./MotionProvider";

const DESKTOP = "(min-width: 1024px)";

/**
 * Slide an off-canvas drawer panel (and fade its scrim) via the shared `drawer`
 * motion preset. A no-op on desktop (the panel is a static rail there); snaps
 * instantly under reduced motion. useGSAP reverts on unmount, so it never leaks
 * across navigations. Keeping GSAP behind the preset lets app shells animate a
 * drawer without importing gsap.
 */
export function useDrawerSlide(
  open: boolean,
  panel: RefObject<HTMLElement | null>,
  scrim: RefObject<HTMLElement | null>,
): void {
  const { reducedMotion } = useMotion();

  useGSAP(
    () => {
      if (typeof window === "undefined" || window.matchMedia(DESKTOP).matches) return;
      if (!panel.current) return;
      drawer(open, panel.current, scrim.current, { reduced: reducedMotion });
    },
    { dependencies: [open, reducedMotion] },
  );
}
