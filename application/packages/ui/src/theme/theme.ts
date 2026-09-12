/* =============================================================================
 * Theme — pure, framework-free core for the Light / Dark / System theme system.
 *
 * This module holds NO React and NO DOM side-effects at import time, so it is
 * unit-testable in the Node vitest env (like the motion `tokens.ts` and the
 * domain pure logic). The React layer (ThemeProvider / ThemeToggle) and the SSR
 * inline script (ThemeScript) build on these primitives.
 *
 * The token layer already ships a COMPLETE dual-theme palette
 * (`tokens/colors.css`, `[data-theme="dark"]`). This system only adds the
 * RUNTIME: which theme is chosen, how "System" resolves against the OS, how it
 * persists, and how it is applied before first paint (no flash).
 * ========================================================================== */

/**
 * What the user picks. There are exactly two: a third "system" choice was
 * removed because a tri-state control forces the user to reason about what
 * "System" currently resolves to before they can tell what they are looking at.
 * The OS preference is not consulted at all — see {@link DEFAULT_THEME_CHOICE}
 * for why the first visit is dark rather than a per-device coin flip.
 */
export type ThemeChoice = "light" | "dark";

/** What gets applied to the document. Identical to a choice now that both are concrete. */
export type ResolvedTheme = ThemeChoice;

/** localStorage key holding the persisted {@link ThemeChoice}. */
export const THEME_STORAGE_KEY = "auxion-theme";

/** The attribute the token CSS keys off (`[data-theme="dark"]`). */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * THE default, unconditionally. A visitor with no stored choice gets dark, and
 * the OS `prefers-color-scheme` is deliberately NOT consulted: the identity is
 * gold on absolute black, so dark is the brand's intended first impression, not
 * a per-visitor coin flip. Anyone who wants light picks it once and it sticks.
 *
 * (This replaced an OS-following first visit. That is the friendlier default in
 * the abstract, but it meant half of all first impressions landed on paper —
 * which is not the design the brand was built for.)
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "dark";

/** The two choices, in canonical toggle order. */
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark"] as const;

/** Type guard: is an arbitrary (possibly persisted/untrusted) value a valid choice? */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark";
}

/**
 * Normalize a persisted value to a valid choice, falling back to the default.
 * Guards against a corrupted / legacy / hand-edited localStorage entry — and
 * against the retired "system" value, which is now simply invalid, so anyone
 * still carrying it lands on dark like any other first-time visitor.
 */
export function normalizeChoice(value: unknown, fallback: ThemeChoice = DEFAULT_THEME_CHOICE): ThemeChoice {
  return isThemeChoice(value) ? value : fallback;
}

/**
 * The pre-paint inline script (as a string) that eliminates the flash of the
 * wrong theme (FOUC). It runs SYNCHRONOUSLY in <head>, before the body paints,
 * reading the persisted choice — or, with nothing stored, the default — then
 * stamping `data-theme` on <html>. It no longer touches `matchMedia` at all,
 * which also makes it smaller and one less thing to fail. Wrapped in try/catch
 * because
 * localStorage access throws in some privacy modes — a theme read must never
 * break the page.
 *
 * Built from the constants so the storage key / attribute can never drift out of
 * sync with the runtime. Kept tiny and dependency-free (it inlines into HTML).
 */
export function buildThemeScript(
  storageKey: string = THEME_STORAGE_KEY,
  attribute: string = THEME_ATTRIBUTE,
  fallback: ThemeChoice = DEFAULT_THEME_CHOICE,
): string {
  return `(function(){try{var c=localStorage.getItem(${JSON.stringify(storageKey)});if(c!=="light"&&c!=="dark"){c=${JSON.stringify(fallback)};}document.documentElement.setAttribute(${JSON.stringify(attribute)},c);}catch(e){document.documentElement.setAttribute(${JSON.stringify(attribute)},${JSON.stringify(fallback)});}})();`;
}

/** The concrete script string used by {@link ThemeScript}. */
export const THEME_SCRIPT = buildThemeScript();
