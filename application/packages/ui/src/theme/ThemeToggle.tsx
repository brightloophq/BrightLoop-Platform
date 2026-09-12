"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { THEME_CHOICES, type ThemeChoice } from "./theme";
import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

/* `short` is what the compact variant shows in place of the sun/moon/monitor
   pictograms — three letters, so the control still fits tight chrome while
   saying which theme it is in characters rather than a glyph. */
const META: Record<ThemeChoice, { label: string; short: string; hint: string }> = {
  light: { label: "Light", short: "Lgt", hint: "Light theme" },
  dark: { label: "Dark", short: "Drk", hint: "Dark theme" },
  system: { label: "System", short: "Sys", hint: "Match your device" },
};

export interface ThemeToggleProps {
  /** `segmented` shows full-word pills; `compact` shows the 3-letter form (tight chrome). */
  variant?: "segmented" | "compact";
  /** Accessible group label. Defaults to "Theme". */
  label?: string;
  className?: string;
}

/**
 * ThemeToggle — the Light / Dark / System control.
 *
 * An ARIA `radiogroup` with roving tabindex: Tab lands on the selected option;
 * Arrow keys move and select; the choice is applied instantly (no reload) and
 * persisted by the provider. Selection is conveyed by `aria-checked` + a filled
 * pill (not color alone), the focus ring is always visible, and all transitions
 * are CSS-only so `prefers-reduced-motion` is honored automatically. Both
 * variants label themselves in text — there is no icon-only state — so the
 * control never depends on a glyph the user has to learn.
 *
 * `system` shows a subtle "· dark"/"· light" resolved hint so the user can tell
 * what System currently maps to.
 */
export function ThemeToggle({ variant = "segmented", label = "Theme", className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const btnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (delta: number) => {
    const i = THEME_CHOICES.indexOf(theme);
    const next = THEME_CHOICES[(i + delta + THEME_CHOICES.length) % THEME_CHOICES.length]!;
    setTheme(next);
    btnRefs.current[THEME_CHOICES.indexOf(next)]?.focus();
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={[styles.group, variant === "compact" ? styles.compact : null, className]
        .filter(Boolean)
        .join(" ")}
      onKeyDown={onKeyDown}
      data-variant={variant}
    >
      {THEME_CHOICES.map((choice, i) => {
        const meta = META[choice];
        const selected = theme === choice;
        const title =
          choice === "system" ? `${meta.hint} (now ${resolvedTheme})` : meta.hint;
        return (
          <button
            key={choice}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={styles.option}
            data-selected={selected}
            title={title}
            aria-label={choice === "system" ? `${meta.label} theme, currently ${resolvedTheme}` : `${meta.label} theme`}
            onClick={() => setTheme(choice)}
          >
            <span className={styles.optionLabel}>
              {variant === "compact" ? meta.short : meta.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
