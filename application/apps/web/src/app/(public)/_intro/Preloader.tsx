"use client";

/* =============================================================================
 * Preloader — the branded Auxion intro for the public site.
 *
 * Not a spinner: the mark resolves, the AUXION wordmark rises, a loop line
 * completes, then the whole overlay masks away and hands off to the hero. Fast
 * (~1.4s), branded, theme-aware. Shown at most ONCE per session and NEVER under
 * reduced motion (both gated pre-paint by IntroScript). When it should not play,
 * it renders nothing and hands off to the hero immediately.
 *
 * The pre-paint CSS cover (intro.css, keyed on `data-intro-pending`) bridges the
 * gap until this client overlay mounts, so there is no flash. On completion this
 * clears the attribute, records the session, and calls markIntroReady() so the
 * hero entrance begins exactly as the loader lifts.
 * ========================================================================== */

import { useRef, useState } from "react";
import { Logo } from "@brightloop/ui";
import { gsap, useGSAP, markIntroReady } from "@brightloop/ui/motion";
import { INTRO_SESSION_KEY } from "./introConfig";
import styles from "./preloader.module.css";

type Phase = "idle" | "playing" | "done";

export function Preloader() {
  const [phase, setPhase] = useState<Phase>("idle");
  const overlayRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const pending =
        typeof document !== "undefined" &&
        document.documentElement.getAttribute("data-intro-pending") === "1";

      if (!pending) {
        // Repeat visit or reduced motion — no loader; let the hero enter now.
        markIntroReady();
        setPhase("done");
        return;
      }

      setPhase("playing");
    },
    { dependencies: [] },
  );

  // Second pass: once the overlay is in the DOM (phase = playing), run the timeline.
  useGSAP(
    () => {
      if (phase !== "playing") return;
      const overlay = overlayRef.current;
      if (!overlay) return;

      const mark = overlay.querySelector(`.${styles.mark}`);
      const word = overlay.querySelector(`.${styles.word}`);
      const barFill = overlay.querySelector(`.${styles.barFill}`);

      const handoff = () => {
        try {
          document.documentElement.removeAttribute("data-intro-pending");
          sessionStorage.setItem(INTRO_SESSION_KEY, "1");
        } catch {
          /* private mode — non-fatal */
        }
        markIntroReady();
      };

      const tl = gsap.timeline({ onComplete: () => setPhase("done") });
      tl.from(mark, { opacity: 0, scale: 0.6, duration: 0.45, ease: "back.out(1.5)" })
        .from(word, { opacity: 0, y: 14, duration: 0.4, ease: "power3.out" }, "-=0.15")
        .fromTo(
          barFill,
          { scaleX: 0 },
          { scaleX: 1, transformOrigin: "left center", duration: 0.55, ease: "power2.inOut" },
          "-=0.1",
        )
        .add(handoff)
        .to(overlay, { yPercent: -100, duration: 0.6, ease: "power3.inOut" });

      return () => {
        tl.kill();
      };
    },
    { scope: overlayRef, dependencies: [phase] },
  );

  if (phase !== "playing") return null;

  return (
    <div ref={overlayRef} className={styles.overlay} role="presentation" aria-hidden="true">
      <div className={styles.inner}>
        <Logo variant="mark" height={56} className={styles.mark} />
        <Logo variant="wordmark" height={22} className={styles.word} />
        <span className={styles.bar}>
          <span className={styles.barFill} />
        </span>
      </div>
    </div>
  );
}
