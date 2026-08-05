"use client";

/* =============================================================================
 * ScrollTrigger registration — the single, idempotent place the public site
 * turns on scroll-linked motion. ScrollTrigger ships inside the `gsap` package
 * (free since 3.11) and is imported ONLY from client modules that live on public
 * routes, so Next code-splits it into the marketing chunk — it never weighs down
 * the authenticated app bundle.
 *
 * Everything that drives motion from scroll goes through registerScrollTrigger()
 * so the plugin is registered exactly once, after hydration, on the client.
 * ========================================================================== */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

let registered = false;

/** Register ScrollTrigger once and return it. Safe to call repeatedly. */
export function registerScrollTrigger(): typeof ScrollTrigger {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger);
    registered = true;
  }
  return ScrollTrigger;
}

export { ScrollTrigger };
