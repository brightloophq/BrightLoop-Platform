"use client";

/* =============================================================================
 * Marquee — a seamless, premium capability ticker for the public site.
 *
 * Two identical tracks drift left as one loop (translateX 0 → -50%), so there is
 * never a visible jump. Speed is px/second (measured, not guessed) so the drift
 * reads the same whatever the content. The SECOND track is aria-hidden so screen
 * readers hear the list once, not twice. Pauses on hover/focus. Under reduced
 * motion it does not move at all — the list simply renders, wrapped and readable.
 *
 * Content is caller-supplied — the homepage passes CANONICAL Auxion capability
 * terms; this component invents nothing.
 * ========================================================================== */

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { MARQUEE } from "../motion/public.config";
import { Icon } from "./Icon";
import styles from "./Marquee.module.css";

export interface MarqueeProps {
  items: readonly string[];
  /** Accessible name for the region. */
  label?: string;
  /** Separator icon between items. */
  icon?: string;
  className?: string;
}

export function Marquee({ items, label = "Capabilities", icon = "sparkles", className }: MarqueeProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [durationS, setDurationS] = useState<number | null>(null);

  // Measure one track's width and derive a constant-speed duration. Re-measure on
  // resize so the drift stays even across breakpoints.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setDurationS(width / MARQUEE.speedPxPerSec);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const Track = ({ hidden }: { hidden: boolean }) => (
    <div className={styles.track} aria-hidden={hidden || undefined} ref={hidden ? undefined : trackRef}>
      {items.map((item, i) => (
        <span className={styles.item} key={`${item}-${i}`}>
          <span className={styles.text}>{item}</span>
          <Icon name={icon} size={14} className={styles.sep} />
        </span>
      ))}
    </div>
  );

  return (
    <div
      className={[styles.marquee, className].filter(Boolean).join(" ")}
      role="group"
      aria-label={label}
      tabIndex={0}
      style={durationS ? ({ ["--marquee-dur"]: `${durationS}s` } as CSSProperties) : undefined}
    >
      <div className={styles.viewport}>
        <div className={styles.lane}>
          <Track hidden={false} />
          <Track hidden={true} />
        </div>
      </div>
    </div>
  );
}
