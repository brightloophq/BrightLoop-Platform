"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_THEME_CHOICE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  initialChoice,
  normalizeChoice,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

interface ThemeContextValue {
  /** The active theme. Always concrete — "light" or "dark". */
  theme: ThemeChoice;
  /**
   * What is applied to the document. Identical to `theme` now that there is no
   * "system" state to resolve; retained so consumers that read it keep working.
   */
  resolvedTheme: ResolvedTheme;
  /** Persist + apply a new choice. Switches instantly, no reload. */
  setTheme: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(DARK_QUERY).matches;
}

/**
 * The theme to start from: a stored choice if there is a valid one, otherwise
 * the OS preference. A previously-stored "system" is no longer valid and falls
 * through to the OS, which is the same thing it used to resolve to — so nobody
 * is moved off the theme they were already getting.
 */
function readInitialChoice(): ThemeChoice {
  if (typeof window === "undefined") return DEFAULT_THEME_CHOICE;
  try {
    return normalizeChoice(window.localStorage.getItem(THEME_STORAGE_KEY), initialChoice(prefersDark()));
  } catch {
    // Storage blocked (private mode) — the OS preference is still readable.
    return initialChoice(prefersDark());
  }
}

/** Apply the theme to <html> (mirrors what the pre-paint script does). */
function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
}

/**
 * ThemeProvider — the runtime for Light / Dark.
 *
 * Wraps the whole app (in the root layout). The pre-paint `ThemeScript` has
 * already stamped the correct `data-theme` on <html>, so this provider never
 * causes a visual flash: it renders children immediately and only RE-applies the
 * attribute when the user changes the choice.
 *
 * The OS preference is consulted ONLY while no explicit choice is stored. Once
 * the user picks a side it is theirs and an OS flip does not override it — which
 * is the behaviour a two-state control implies. (The previous tri-state runtime
 * tracked `prefers-color-scheme` live to drive a "System" option; with that
 * option gone, continuing to follow the OS would silently undo an explicit
 * choice.)
 *
 * Hydration safety: the first client render initializes from the DEFAULT so it
 * matches the server render exactly; a mount effect then reconciles with the
 * persisted choice. Because the visible theme lives in the `data-theme` attribute
 * (already correct from the inline script) and NOT in React-rendered markup, this
 * reconciliation is invisible — only the toggle's selected indicator settles.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE);
  const mounted = useRef(false);

  // Mount: adopt the stored choice, or the OS preference on a first visit.
  useEffect(() => {
    mounted.current = true;
    const initial = readInitialChoice();
    setThemeState(initial);
    applyResolved(initial);
  }, []);

  // Re-apply whenever the choice changes after mount.
  useEffect(() => {
    if (!mounted.current) return;
    applyResolved(theme);
  }, [theme]);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      /* storage blocked (private mode) — the choice still applies for this session */
    }
    applyResolved(choice);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, resolvedTheme: theme, setTheme }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Access the theme runtime. Throws if used outside a ThemeProvider so a missing
 * provider fails loudly at development time rather than silently no-op-ing.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a <ThemeProvider>");
  return ctx;
}
