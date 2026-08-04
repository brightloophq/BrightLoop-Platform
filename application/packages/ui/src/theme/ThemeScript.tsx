import { THEME_SCRIPT } from "./theme";

/**
 * ThemeScript — the FOUC (flash-of-wrong-theme) guard.
 *
 * Render this ONCE, as early as possible in the document <head>, BEFORE any
 * styled markup. It runs synchronously (no `async`/`defer`) so `data-theme` is
 * stamped on <html> before the first paint, meaning the page is never briefly
 * shown in the wrong theme while React hydrates.
 *
 * It is a server component (no "use client") — it emits a static <script> tag
 * with a constant, self-contained body and no props, so it is safe to inline and
 * satisfies a strict `script-src` that allows inline scripts via the framework's
 * nonce/hash handling. The body is a trusted constant built in `theme.ts`, never
 * user input.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />;
}
