"use client";

/* =============================================================================
 * CountUp — animate a verified metric up to its value when it scrolls into view.
 *
 * The FINAL value is rendered server-side (so it's correct for SEO, no-JS, and
 * reduced-motion users); only when motion is allowed does it briefly count up
 * from zero on first entry. Never invents a number — the caller passes a real,
 * verified value. Honours reduced motion (shows the final value, no tween).
 * ========================================================================== */

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { registerScrollTrigger } from "./scroll";
import { countUp } from "./public";
import { useReducedMotion } from "./useReducedMotion";

export interface CountUpProps {
  /** The real, final value to reach. */
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

export function CountUp({ to, decimals = 0, prefix = "", suffix = "", className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const final = `${prefix}${to.toFixed(decimals)}${suffix}`;

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || reduced) return; // reduced → keep the server-rendered final value
      const ST = registerScrollTrigger();
      el.textContent = `${prefix}${(0).toFixed(decimals)}${suffix}`;
      ST.create({
        trigger: el,
        start: "top 90%",
        once: true,
        onEnter: () => countUp(el, to, { decimals, prefix, suffix }),
      });
    },
    { scope: ref, dependencies: [reduced, to, decimals, prefix, suffix] },
  );

  return (
    <span ref={ref} className={className}>
      {final}
    </span>
  );
}
