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
 * The OS preference has NOT been abandoned — it still decides the FIRST visit
 * (see {@link initialChoice}); it simply is not a selectable state any more.
 */
export type ThemeChoice = "light" | "dark";

/** What gets applied to the document. Identical to a choice now that both are concrete. */
export type ResolvedTheme = ThemeChoice;

/** localStorage key holding the persisted {@link ThemeChoice}. */
export const THEME_STORAGE_KEY = "auxion-theme";

/** The attribute the token CSS keys off (`[data-theme="dark"]`). */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * The last-resort default: what to apply when nothing is stored AND the OS
 * preference cannot be read (no `matchMedia`, or a thrown storage access).
 * Dark, because the identity is gold on black — that is the brand's own ground.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "dark";

/** The two choices, in canonical toggle order. */
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark"] as const;

/** Type guard: is an arbitrary (possibly persisted/untrusted) value a valid choice? */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark";
}

/**
 * What to apply when nothing valid is stored: follow the OS on the first visit.
 * Pure — the caller supplies the OS preference, so this stays testable with no
 * `matchMedia` at call time.
 *
 * This is also the migration path for anyone whose localStorage still holds the
 * retired "system" value: it no longer passes {@link isThemeChoice}, so they
 * fall through to here and keep the theme their OS was already giving them
 * rather than being yanked onto a fixed default.
 */
export function initialChoice(systemPrefersDark: boolean): ThemeChoice {
  return systemPrefersDark ? "dark" : "light";
}

/**
 * Normalize a persisted value to a valid choice, falling back to `fallback`.
 * Guards against a corrupted / legacy / hand-edited localStorage entry — and
 * against the retired "system" value, which is now simply invalid.
 */
export function normalizeChoice(value: unknown, fallback: ThemeChoice = DEFAULT_THEME_CHOICE): ThemeChoice {
  return isThemeChoice(value) ? value : fallback;
}

/**
 * The pre-paint inline script (as a string) that eliminates the flash of the
 * wrong theme (FOUC). It runs SYNCHRONOUSLY in <head>, before the body paints,
 * reading the persisted choice — or, on a first visit, the OS preference — then
 * stamping `data-theme` on <html>. Everything is wrapped in try/catch because
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
  return `(function(){try{var c=localStorage.getItem(${JSON.stringify(storageKey)});if(c!=="light"&&c!=="dark"){c=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":(window.matchMedia?"light":${JSON.stringify(fallback)});}document.documentElement.setAttribute(${JSON.stringify(attribute)},c);}catch(e){document.documentElement.setAttribute(${JSON.stringify(attribute)},${JSON.stringify(fallback)});}})();`;
}

/** The concrete script string used by {@link ThemeScript}. */
export const THEME_SCRIPT = buildThemeScript();
