/* =============================================================================
 * Intro pre-paint script — the flash-free bridge for the branded preloader.
 *
 * Mirrors the theme runtime's ThemeScript approach: a tiny synchronous IIFE that
 * runs BEFORE first paint and stamps `data-intro-pending` on <html> only when a
 * branded intro should play (first visit this session AND motion is allowed). A
 * CSS cover keyed off that attribute (see intro.css) hides the hero underneath
 * until React's Preloader takes over — so there is never a flash of hero before
 * the loader, and content is never trapped: with no JS the attribute is never
 * set, the cover stays hidden, and the page renders normally.
 * ========================================================================== */

/** sessionStorage key — set once the preloader has played this session. */
export const INTRO_SESSION_KEY = "aux:intro-shown";

/** The pre-paint IIFE, as a string, for dangerouslySetInnerHTML. */
export const INTRO_SCRIPT = `(function(){try{var m=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;var s=sessionStorage.getItem("${INTRO_SESSION_KEY}");if(!m&&!s){document.documentElement.setAttribute("data-intro-pending","1");}}catch(e){}})();`;
