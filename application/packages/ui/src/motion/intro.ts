"use client";

/* =============================================================================
 * Intro gate — the tiny handoff between the branded preloader and the hero.
 *
 * The preloader calls markIntroReady() when it has finished masking away (or
 * immediately, when it decides not to show at all). The hero waits via
 * whenIntroReady() so its entrance begins exactly as the loader clears — no
 * guesswork, no fixed delay. A safety timeout guarantees the hero plays even if
 * the preloader never mounts or errors, so content is never trapped behind the
 * gate.
 * ========================================================================== */

export const INTRO_READY_EVENT = "aux:intro-ready";
const INTRO_ATTR = "data-intro";

/** Signal that the intro (preloader) is done and the hero may enter. */
export function markIntroReady(): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(INTRO_ATTR, "ready");
  window.dispatchEvent(new Event(INTRO_READY_EVENT));
}

/** Has the intro already cleared? */
export function isIntroReady(): boolean {
  return typeof document !== "undefined" && document.documentElement.getAttribute(INTRO_ATTR) === "ready";
}

/**
 * Run `cb` once the intro is ready. Returns a cleanup that removes the listener
 * and cancels the safety timeout. If already ready (or on the server), runs
 * synchronously.
 */
export function whenIntroReady(cb: () => void, safetyMs = 1600): () => void {
  if (typeof window === "undefined" || isIntroReady()) {
    cb();
    return () => {};
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    cleanup();
    cb();
  };
  const onEvent = () => finish();
  const timer = window.setTimeout(finish, safetyMs);
  window.addEventListener(INTRO_READY_EVENT, onEvent, { once: true });
  const cleanup = () => {
    window.clearTimeout(timer);
    window.removeEventListener(INTRO_READY_EVENT, onEvent);
  };
  return cleanup;
}
