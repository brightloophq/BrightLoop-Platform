import { describe, it, expect } from "vitest";
import {
  isThemeChoice,
  initialChoice,
  normalizeChoice,
  buildThemeScript,
  THEME_SCRIPT,
  THEME_STORAGE_KEY,
  THEME_ATTRIBUTE,
  DEFAULT_THEME_CHOICE,
  THEME_CHOICES,
} from "./theme";

describe("isThemeChoice", () => {
  it("accepts the two valid choices", () => {
    expect(isThemeChoice("light")).toBe(true);
    expect(isThemeChoice("dark")).toBe(true);
  });
  it("rejects anything else, INCLUDING the retired 'system'", () => {
    // "system" must not validate: a value still sitting in someone's
    // localStorage has to fall through to the OS-preference path.
    for (const bad of ["", "Light", "auto", "system", null, undefined, 0, {}, "dark "]) {
      expect(isThemeChoice(bad)).toBe(false);
    }
  });
});

describe("initialChoice", () => {
  it("follows the OS when there is nothing stored", () => {
    expect(initialChoice(true)).toBe("dark");
    expect(initialChoice(false)).toBe("light");
  });
});

describe("normalizeChoice", () => {
  it("keeps valid choices", () => {
    expect(normalizeChoice("dark")).toBe("dark");
    expect(normalizeChoice("light")).toBe("light");
  });
  it("falls back to the default for corrupted values", () => {
    expect(normalizeChoice("neon")).toBe(DEFAULT_THEME_CHOICE);
    expect(normalizeChoice(null)).toBe(DEFAULT_THEME_CHOICE);
    expect(normalizeChoice(undefined)).toBe(DEFAULT_THEME_CHOICE);
  });
  it("takes an explicit fallback, which is how a retired 'system' migrates", () => {
    expect(normalizeChoice("system", "light")).toBe("light");
    expect(normalizeChoice("system", initialChoice(true))).toBe("dark");
    // A valid stored choice always beats the fallback.
    expect(normalizeChoice("light", "dark")).toBe("light");
  });
});

describe("constants", () => {
  it("default choice is valid and dark (the identity's own ground)", () => {
    expect(isThemeChoice(DEFAULT_THEME_CHOICE)).toBe(true);
    expect(DEFAULT_THEME_CHOICE).toBe("dark");
  });
  it("exposes exactly the two choices in canonical order", () => {
    expect(THEME_CHOICES).toEqual(["light", "dark"]);
  });
});

describe("buildThemeScript / THEME_SCRIPT", () => {
  it("references the storage key, attribute, and both matchMedia branches", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_STORAGE_KEY));
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_ATTRIBUTE));
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
    // fail-safe: an exception path still stamps a concrete theme
    expect(THEME_SCRIPT).toContain('"dark"');
  });

  it("is a self-invoking, try/catch-guarded expression", () => {
    expect(THEME_SCRIPT.trim().startsWith("(function(){try{")).toBe(true);
    expect(THEME_SCRIPT).toContain("catch");
  });

  it("is parametric — a custom key/attribute/fallback flows through", () => {
    const s = buildThemeScript("my-key", "data-mode", "light");
    expect(s).toContain('"my-key"');
    expect(s).toContain('"data-mode"');
    expect(s).not.toContain("auxion-theme");
    // The fallback is asserted by BEHAVIOUR rather than by string shape: it is
    // reached only when nothing is stored and the OS cannot be asked, and a
    // previous version of this test pinned the exact expression instead, so it
    // broke on a refactor that kept the semantics intact.
    expect(runThemeScript(s, { stored: null, noMatchMedia: true })).toBe("light");
  });

  it("uses the fallback when nothing is stored and matchMedia is unavailable", () => {
    expect(runThemeScript(THEME_SCRIPT, { stored: null, noMatchMedia: true })).toBe(
      DEFAULT_THEME_CHOICE,
    );
  });

  it("actually applies the correct theme when executed (light stored)", () => {
    const applied = runThemeScript(THEME_SCRIPT, { stored: "light", prefersDark: true });
    expect(applied).toBe("light");
  });

  it("treats a legacy stored 'system' as unset and follows the OS", () => {
    expect(runThemeScript(THEME_SCRIPT, { stored: "system", prefersDark: true })).toBe("dark");
    expect(runThemeScript(THEME_SCRIPT, { stored: "system", prefersDark: false })).toBe("light");
  });

  it("follows the OS when nothing is stored", () => {
    expect(runThemeScript(THEME_SCRIPT, { stored: null, prefersDark: true })).toBe("dark");
    expect(runThemeScript(THEME_SCRIPT, { stored: null, prefersDark: false })).toBe("light");
  });

  it("fails safe to the default when localStorage throws", () => {
    expect(runThemeScript(THEME_SCRIPT, { throwOnRead: true, prefersDark: true })).toBe("dark");
  });
});

/**
 * Execute the inline script string in a minimal fake DOM/window sandbox and
 * return the theme it stamped onto <html>. Verifies real runtime behaviour, not
 * just string shape.
 */
function runThemeScript(
  script: string,
  opts: {
    stored?: string | null;
    prefersDark?: boolean;
    throwOnRead?: boolean;
    /** Simulate an environment with no matchMedia, to exercise the fallback. */
    noMatchMedia?: boolean;
  },
): string | null {
  let applied: string | null = null;
  const sandboxWindow = opts.noMatchMedia
    ? {}
    : { matchMedia: (q: string) => ({ matches: q.includes("dark") ? !!opts.prefersDark : false }) };
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
