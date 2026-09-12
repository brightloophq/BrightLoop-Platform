"use client";

/* =============================================================================
 * RibbonRail — the landing page's signature.
 *
 * The identity is ONE folded ribbon that crosses itself. This draws that ribbon
 * down the left gutter of the whole page: a single gold hairline with four folds
 * — one per discipline — that fills in proportion to how far you have scrolled,
 * with a bead riding the drawn tip. Reaching the closing CTA means you have
 * drawn the mark.
 *
 * It is the one thing on this page that could not be lifted from another studio
 * site, because its geometry is the logo's.
 *
 * ROBUST BY CONSTRUCTION, in the house style:
 *  * No JS / reduced motion / below 1280px → the ribbon renders FULLY DRAWN and
 *    static. Nothing is ever hidden behind an animation, and the un-drawn state
 *    is only ever applied after hydration, when motion is allowed.
 *  * aria-hidden + pointer-events:none — decorative, never in the reading order
 *    and never in the way of a click.
 *  * stroke-dashoffset only (no layout, no paint of anything but the line), and
 *    useGSAP reverts the tween and kills the trigger on unmount.
 *  * matchMedia, not a width check at mount, so a resize across the breakpoint
 *    tears the choreography down instead of leaving it stale.
 * ========================================================================== */

import { useRef } from "react";
import { gsap, useGSAP, registerScrollTrigger, SCRUB } from "@brightloop/ui/motion";
import styles from "./ribbon.module.css";

/**
 * The ribbon path in a 40 × 1000 box (preserveAspectRatio="none", so it stretches
 * to the page's height while the folds keep their proportion). It enters top-left,
 * crosses to the right at each fold, and exits bottom-left — the monogram's strap
 * logic unrolled vertically. `pathLength={1}` normalises the dash maths so the
 * scrub is a plain 1 → 0 regardless of the real path length.
 */
const RIBBON_PATH =
  "M 8 0 L 8 150 Q 8 186 32 200 Q 8 214 8 250 L 8 400 Q 8 436 32 450 Q 8 464 8 500 L 8 650 Q 8 686 32 700 Q 8 714 8 750 L 8 1000";

export function RibbonRail() {
  const rootRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;
      const line = root.querySelector<SVGPathElement>(`.${styles.line}`);
      const bead = root.querySelector<SVGCircleElement>(`.${styles.bead}`);
      if (!line) return;

      const mm = gsap.matchMedia();
      mm.add("(min-width: 1280px) and (prefers-reduced-motion: no-preference)", () => {
        registerScrollTrigger();

        // Undrawn only now — after hydration, on a wide screen, with motion allowed.
        gsap.set(line, { strokeDashoffset: 1 });
        if (bead) gsap.set(bead, { opacity: 1 });

        const tl = gsap.timeline({
          scrollTrigger: {
            // The document itself is the subject: the ribbon tracks the whole
            // page, not one section of it.
            trigger: document.documentElement,
            start: "top top",
            end: "bottom bottom",
            scrub: SCRUB,
            invalidateOnRefresh: true,
          },
        });
        tl.to(line, { strokeDashoffset: 0, ease: "none" }, 0);
        // The bead rides the tip: a transform only, so no layout or reflow. The
        // end value is a function so `invalidateOnRefresh` re-measures it when
        // the viewport is resized — a value captured at build time would leave
        // the bead short of (or past) the rail after any resize.
        if (bead) {
          tl.fromTo(bead, { y: 0 }, { y: () => root.clientHeight, ease: "none" }, 0);
        }

        return () => {
          tl.scrollTrigger?.kill();
          tl.kill();
          gsap.set(line, { strokeDashoffset: 0 });
          if (bead) gsap.set(bead, { opacity: 0 });
        };
      });
    },
    { scope: rootRef, dependencies: [] },
  );

  return (
    <div className={styles.rail} ref={rootRef} aria-hidden="true">
      <svg
        className={styles.svg}
        viewBox="0 0 40 1000"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Vertical metal: the ramp read top-to-bottom, brightest at the folds. */}
          <linearGradient id="auxion-ribbon-rail" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--gold-700)" }} />
            <stop offset="0.2" style={{ stopColor: "var(--gold-300)" }} />
            <stop offset="0.5" style={{ stopColor: "var(--gold-050)" }} />
            <stop offset="0.8" style={{ stopColor: "var(--gold-300)" }} />
            <stop offset="1" style={{ stopColor: "var(--gold-700)" }} />
          </linearGradient>
        </defs>
        {/* The unlit channel the ribbon is drawn into, so the rail reads as a
            track with a known length rather than a line that stops nowhere. */}
        <path className={styles.track} d={RIBBON_PATH} pathLength={1} />
        <path className={styles.line} d={RIBBON_PATH} pathLength={1} />
      </svg>
      {/* The bead. It rides the rail's main upright rather than the folds — a
          5px dot tracing the crossings reads as jitter, not as craft. */}
      <span className={styles.bead} />
    </div>
  );
}
