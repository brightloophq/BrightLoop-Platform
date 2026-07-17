"use client";

import { useEffect, useState } from "react";

/**
 * Tracks the user's OS-level "reduce motion" preference, live.
 *
 * Starts `false` on the server and first client paint (so content is never
 * hidden waiting for JS), then syncs to the real media-query value after mount
 * and on change. Motion components use this to skip animation entirely and snap
 * elements to their final state.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
