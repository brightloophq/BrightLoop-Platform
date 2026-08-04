import { describe, it, expect } from "vitest";
import {
  isThemeChoice,
  resolveTheme,
  normalizeChoice,
  buildThemeScript,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  THEME_ATTRIBUTE,
  DEFAULT_THEME_CHOICE,
  THEME_CHOICES,
} from "./theme";

describe("isThemeChoice", () => {
  it("accepts the three valid choices", () => {
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("system")).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "Light", "auto", null, undefined, 0, {}, "system "]) {
      expect(isThemeChoice(bad)).toBe(false);
    }
  });
});

describe("resolveTheme", () => {
  it("passes concrete choices through unchanged, regardless of OS", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("resolves system against the OS preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("normalizeChoice", () => {
  it("keeps valid choices", () => {
    expect(normalizeChoice("dark")).toBe("dark");
  });
  it("falls back to the default for corrupted values", () => {
    expect(normalizeChoice("neon")).toBe(DEFAULT_THEME_CHOICE);
    expect(normalizeChoice(null)).toBe(DEFAULT_THEME_CHOICE);
    expect(normalizeChoice(undefined)).toBe(DEFAULT_THEME_CHOICE);
  });
});

describe("constants", () => {
  it("default choice is a valid choice and system-first", () => {
    expect(isThemeChoice(DEFAULT_THEME_CHOICE)).toBe(true);
    expect(DEFAULT_THEME_CHOICE).toBe("system");
  });
  it("exposes exactly the three choices in canonical order", () => {
    expect(THEME_CHOICES).toEqual(["light", "dark", "system"]);
  });
});

describe("buildThemeScript / THEME_SCRIPT", () => {
  it("references the storage key, attribute, and both matchMedia branches", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_ATTRIBUTE));
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
    // fail-safe: an exception path still stamps a concrete theme
    expect(THEME_SCRIPT).toContain('"light"');
  });

  it("is a self-invoking, try/catch-guarded expression", () => {
    expect(THEME_SCRIPT.trim().startsWith("(function(){try{")).toBe(true);
    expect(THEME_SCRIPT).toContain("catch");
  });

  it("is parametric — a custom key/attribute/fallback flows through", () => {
    const s = buildThemeScript("my-key", "data-mode", "dark");
    expect(s).toContain('"my-key"');
    expect(s).toContain('"data-mode"');
    expect(s).toContain('c="dark"');
    expect(s).not.toContain("auxion-theme");
  });

  it("actually applies the correct theme when executed (light stored)", () => {
    const applied = runThemeScript(THEME_SCRIPT, { stored: "light", prefersDark: true });
    expect(applied).toBe("light");
  });

  it("resolves a stored 'system' against the OS when executed", () => {
    expect(runThemeScript(THEME_SCRIPT, { stored: "system", prefersDark: true })).toBe("dark");
    expect(runThemeScript(THEME_SCRIPT, { stored: "system", prefersDark: false })).toBe("light");
  });

  it("falls back to the default (system→OS) when nothing is stored", () => {
    expect(runThemeScript(THEME_SCRIPT, { stored: null, prefersDark: true })).toBe("dark");
    expect(runThemeScript(THEME_SCRIPT, { stored: null, prefersDark: false })).toBe("light");
  });

  it("fails safe to light when localStorage throws", () => {
    expect(runThemeScript(THEME_SCRIPT, { throwOnRead: true, prefersDark: true })).toBe("light");
  });
});

/**
 * Execute the inline script string in a minimal fake DOM/window sandbox and
 * return the theme it stamped onto <html>. Verifies real runtime behaviour, not
 * just string shape.
 */
function runThemeScript(
  script: string,
  opts: { stored?: string | null; prefersDark?: boolean; throwOnRead?: boolean },
): string | null {
  let applied: string | null = null;
  const sandboxWindow = {
    matchMedia: (q: string) => ({ matches: q.includes("dark") ? !!opts.prefersDark : false }),
  };
  const sandboxDocument = {
    documentElement: {
      setAttribute: (_name: string, value: string) => {
        applied = value;
      },
    },
  };
  const sandboxLocalStorage = {
    getItem: (_k: string) => {
      if (opts.throwOnRead) throw new Error("blocked");
      return opts.stored ?? null;
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("window", "document", "localStorage", script)(
    sandboxWindow,
    sandboxDocument,
    sandboxLocalStorage,
  );
  return applied;
}
