"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { DURATION, EASE } from "./tokens";
import { useReducedMotion } from "./useReducedMotion";

// Register @gsap/react's plugin once, at module load. useGSAP() relies on it for
// automatic cleanup (it reverts every tween/timeline created in its scope on
// unmount) — the core reason we never leak animations across route changes.
gsap.registerPlugin(useGSAP);

interface MotionContextValue {
  /** Honour prefers-reduced-motion — components skip animation when true. */
  reducedMotion: boolean;
}

const MotionContext = createContext<MotionContextValue>({ reducedMotion: false });

/** Read the ambient motion settings (reduced-motion). Safe outside a provider. */
export function useMotion(): MotionContextValue {
  return useContext(MotionContext);
}

/**
 * The motion engine's root. Sets GSAP defaults from the Auxion tokens once, and
 * publishes the live reduced-motion preference to every descendant animation.
 * Cheap and side-effect-light — mount it high in the authenticated tree.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();

  // GSAP global defaults, aligned with the CSS tokens so JS and CSS motion match.
  useGSAP(() => {
    gsap.defaults({ duration: DURATION.base, ease: EASE.out });
  }, []);

  const value = useMemo<MotionContextValue>(() => ({ reducedMotion }), [reducedMotion]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
