"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  DEFAULT_THEME_CHOICE,
  THEME_ATTRIBUTE,
  THEME_STORAGE_KEY,
  normalizeChoice,
  resolveTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

interface ThemeContextValue {
  /** What the user has chosen (may be "system"). */
  theme: ThemeChoice;
  /** What is actually applied right now ("system" resolved against the OS). */
  resolvedTheme: ResolvedTheme;
  /** Whether the OS currently prefers dark (drives "system"). */
  systemPrefersDark: boolean;
  /** Persist + apply a new choice. Switches instantly, no reload. */
  setTheme: (choice: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function prefersDark(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(DARK_QUERY).matches;
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return DEFAULT_THEME_CHOICE;
  try {
    return normalizeChoice(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

/** Apply the resolved theme to <html> (mirrors what the pre-paint script does). */
function applyResolved(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute(THEME_ATTRIBUTE, resolved);
}

/**
 * ThemeProvider — the runtime for Light / Dark / System.
 *
 * Wraps the whole app (in the root layout). The pre-paint `ThemeScript` has
 * already stamped the correct `data-theme` on <html>, so this provider never
 * causes a visual flash: it renders children immediately and only RE-applies the
 * attribute when the user changes the choice or the OS preference changes under
 * "system".
 *
 * Hydration safety: the first client render initializes from the DEFAULT so it
 * matches the server render exactly; a mount effect then reconciles with the
 * persisted choice. Because the visible theme lives in the `data-theme` attribute
 * (already correct from the inline script) and NOT in React-rendered markup, this
 * reconciliation is invisible — only the toggle's selected indicator settles.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(false);
  const mounted = useRef(false);

  // Mount: adopt the persisted choice + current OS preference. Runs once.
  useEffect(() => {
    mounted.current = true;
    const stored = readStoredChoice();
    const dark = prefersDark();
    setThemeState(stored);
    setSystemPrefersDark(dark);
    applyResolved(resolveTheme(stored, dark));
  }, []);

  // Track OS theme changes so "System" follows the OS live, no reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      setSystemPrefersDark(e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // Re-apply whenever the resolved theme changes after mount (choice or OS).
  useEffect(() => {
    if (!mounted.current) return;
    applyResolved(resolveTheme(theme, systemPrefersDark));
  }, [theme, systemPrefersDark]);

  const setTheme = useCallback((choice: ThemeChoice) => {
    setThemeState(choice);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    } catch {
      /* storage blocked (private mode) — the choice still applies for this session */
    }
    applyResolved(resolveTheme(choice, prefersDark()));
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme: resolveTheme(theme, systemPrefersDark),
      systemPrefersDark,
      setTheme,
    }),
    [theme, systemPrefersDark, setTheme],
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
