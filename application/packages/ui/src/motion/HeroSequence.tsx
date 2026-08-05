"use client";

/* =============================================================================
 * HeroSequence — the signature entrance host for the public hero.
 *
 * Wraps the (server-rendered) hero content and runs the one coordinated
 * `heroSequence` timeline: eyebrow → masked headline → subcopy → CTAs → note,
 * with the loop ring/nodes/core activating alongside. The timeline is built
 * PAUSED so its `from` tweens immediately render the hidden start state (no
 * flash), then plays the moment the preloader hands off (whenIntroReady). Under
 * reduced motion everything is snapped visible and the gate is irrelevant.
 * ========================================================================== */

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { heroSequence } from "./public";
import { useReducedMotion } from "./useReducedMotion";
import { whenIntroReady } from "./intro";

export interface HeroSequenceProps {
  className?: string;
  children: ReactNode;
}

export function HeroSequence({ className, children }: HeroSequenceProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useGSAP(
    () => {
      const scope = ref.current;
      if (!scope) return;

      if (reduced) {
        heroSequence({ reduced: true }); // snap all hero groups visible
        return;
      }

      // Paused build → hidden start rendered immediately (no flash). Play on handoff.
      const tl = heroSequence({ paused: true });
      const cancel = whenIntroReady(() => tl.play());
      return () => {
        cancel();
        tl.kill();
      };
    },
    { scope: ref, dependencies: [reduced] },
  );

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
