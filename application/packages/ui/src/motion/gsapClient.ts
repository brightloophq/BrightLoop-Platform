"use client";

/* =============================================================================
 * gsap re-export — the single place app-level client components reach GSAP.
 *
 * GSAP lives as a dependency of @brightloop/ui (not of the app). Exposing `gsap`
 * and `useGSAP` here lets bespoke public animations (the preloader, the scroll
 * story) import them from `@brightloop/ui/motion` — no duplicate dependency in
 * the app, one registration, and useGSAP's automatic tween/ScrollTrigger cleanup
 * everywhere. Client-only.
 * ========================================================================== */

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";

// Register once so useGSAP's context integration is available on public routes
// too (the authenticated MotionProvider does the same for the app tree).
gsap.registerPlugin(useGSAP);

export { gsap, useGSAP };
