"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { THEME_CHOICES, type ThemeChoice } from "./theme";
import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

const META: Record<ThemeChoice, { label: string; icon: string; hint: string }> = {
  light: { label: "Light", icon: "sun", hint: "Light theme" },
  dark: { label: "Dark", icon: "moon", hint: "Dark theme" },
  system: { label: "System", icon: "monitor", hint: "Match your device" },
};

export interface ThemeToggleProps {
  /** `segmented` shows icon+label pills; `compact` shows icon-only (tight chrome). */
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
 * are CSS-only so `prefers-reduced-motion` is honored automatically.
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
            <Icon name={meta.icon} size={variant === "compact" ? 16 : 15} />
            {variant === "segmented" && <span className={styles.optionLabel}>{meta.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
