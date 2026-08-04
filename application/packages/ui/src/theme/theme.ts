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

/** What the user picks. "system" follows the OS via `prefers-color-scheme`. */
export type ThemeChoice = "light" | "dark" | "system";

/** What actually gets applied to the document — "system" is always resolved away. */
export type ResolvedTheme = "light" | "dark";

/** localStorage key holding the persisted {@link ThemeChoice}. */
export const THEME_STORAGE_KEY = "auxion-theme";

/** The attribute the token CSS keys off (`[data-theme="dark"]`). */
export const THEME_ATTRIBUTE = "data-theme";

/**
 * The default choice when the user has never picked one. "system" is the modern,
 * least-surprising default: the app follows the OS. The SSR fallback (before the
 * inline script runs) is the CSS `:root` = light; the script corrects to the
 * resolved system value before paint, so there is no flash.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/** The three choices, in canonical toggle order. */
export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"] as const;

/** Type guard: is an arbitrary (possibly persisted/untrusted) value a valid choice? */
export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Resolve a choice to a concrete theme. "system" resolves via the supplied OS
 * preference (whether `prefers-color-scheme: dark` matches) — kept as a parameter
 * so this stays pure and testable (no `matchMedia` at call time).
 */
export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === "system") return systemPrefersDark ? "dark" : "light";
  return choice;
}

/**
 * Normalize a persisted value to a valid choice, falling back to the default.
 * Guards against a corrupted / legacy / hand-edited localStorage entry.
 */
export function normalizeChoice(value: unknown): ThemeChoice {
  return isThemeChoice(value) ? value : DEFAULT_THEME_CHOICE;
}

/**
 * The pre-paint inline script (as a string) that eliminates the flash of the
 * wrong theme (FOUC). It runs SYNCHRONOUSLY in <head>, before the body paints,
 * reading the persisted choice and resolving "system" against the OS, then
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
  return `(function(){try{var c=localStorage.getItem(${JSON.stringify(storageKey)});if(c!=="light"&&c!=="dark"&&c!=="system"){c=${JSON.stringify(fallback)};}var d=c==="system"?(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):c;document.documentElement.setAttribute(${JSON.stringify(attribute)},d);}catch(e){document.documentElement.setAttribute(${JSON.stringify(attribute)},"light");}})();`;
}

/** The concrete script string used by {@link ThemeScript}. */
export const THEME_SCRIPT = buildThemeScript();
