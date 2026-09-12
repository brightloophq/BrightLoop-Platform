"use client";

import { useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { THEME_CHOICES, type ThemeChoice } from "./theme";
import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

/**
 * The sun and moon, drawn here rather than imported.
 *
 * The platform carries no icon set (ENGINEERING_CONTEXT §13 B.1), and these do
 * not reintroduce one: they are two shapes belonging to this one component, in
 * the same spirit as the Accordion's plus/minus and the Navbar's caret. A theme
 * switch is the one control where a glyph genuinely beats a word — sun and moon
 * are understood without being read, in any language, which is why every
 * platform uses them. They still ship WITH their label, so nothing depends on
 * recognising them.
 *
 * `currentColor` throughout, so they inherit the pill's selected/hover colour.
 */
function SunMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4.6" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="12" y1="1.8" x2="12" y2="4.4" />
        <line x1="12" y1="19.6" x2="12" y2="22.2" />
        <line x1="1.8" y1="12" x2="4.4" y2="12" />
        <line x1="19.6" y1="12" x2="22.2" y2="12" />
        <line x1="4.9" y1="4.9" x2="6.7" y2="6.7" />
        <line x1="17.3" y1="17.3" x2="19.1" y2="19.1" />
        <line x1="4.9" y1="19.1" x2="6.7" y2="17.3" />
        <line x1="17.3" y1="6.7" x2="19.1" y2="4.9" />
      </g>
    </svg>
  );
}

function MoonMark() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
      {/* A crescent as one filled path: a disc with a second disc subtracted by
          the even-odd winding of the arc pair — no mask, no second colour, so it
          reads correctly on any ground. */}
      <path
        d="M20.2 15.4A8.8 8.8 0 0 1 8.6 3.8 8.8 8.8 0 1 0 20.2 15.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

const META: Record<ThemeChoice, { label: string; hint: string; Mark: () => React.JSX.Element }> = {
  light: { label: "Light", hint: "Light theme", Mark: SunMark },
  dark: { label: "Dark", hint: "Dark theme", Mark: MoonMark },
};

export interface ThemeToggleProps {
  /** `segmented` shows mark + label; `compact` shows the mark alone (tight chrome). */
  variant?: "segmented" | "compact";
  /** Accessible group label. Defaults to "Theme". */
  label?: string;
  className?: string;
}

/**
 * ThemeToggle — the Light / Dark control.
 *
 * An ARIA `radiogroup` with roving tabindex: Tab lands on the selected option;
 * Arrow keys move and select; the choice is applied instantly (no reload) and
 * persisted by the provider. Selection is conveyed by `aria-checked` + a filled
 * pill (never colour alone), the focus ring is always visible, and all
 * transitions are CSS-only so `prefers-reduced-motion` is honored automatically.
 *
 * Every option carries an `aria-label`, so the compact variant is fully
 * described to assistive tech even though its label is visually hidden.
 */
export function ThemeToggle({ variant = "segmented", label = "Theme", className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
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
            title={meta.hint}
            aria-label={`${meta.label} theme`}
            onClick={() => setTheme(choice)}
          >
            <meta.Mark />
            {variant === "segmented" ? <span className={styles.optionLabel}>{meta.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
