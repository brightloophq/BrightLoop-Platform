"use client";

import type { RefObject } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DURATION, EASE } from "./tokens";
import { useMotion } from "./MotionProvider";

const DESKTOP = "(min-width: 1024px)";

/**
 * Slide an off-canvas drawer panel (and fade its scrim) with GSAP — the reusable
 * mobile-drawer animation. Transform + opacity only; snaps instantly under
 * reduced motion; a no-op on desktop (the panel is a static rail there). useGSAP
 * reverts on unmount, so it never leaks across navigations.
 *
 * Keeping GSAP behind this hook lets app shells animate a drawer without
 * importing gsap directly.
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
      const panelEl = panel.current;
      if (!panelEl) return;
      const panelTo = { xPercent: open ? 0 : -100 };
      const scrimTo = { autoAlpha: open ? 1 : 0 };
      if (reducedMotion) {
        gsap.set(panelEl, panelTo);
        if (scrim.current) gsap.set(scrim.current, scrimTo);
        return;
      }
      gsap.to(panelEl, { ...panelTo, duration: DURATION.base, ease: EASE.out });
      if (scrim.current) gsap.to(scrim.current, { ...scrimTo, duration: DURATION.fast, ease: EASE.out });
    },
    { dependencies: [open, reducedMotion] },
  );
}
