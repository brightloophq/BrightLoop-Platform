"use client";

/* =============================================================================
 * TransformationJourney — the signature scroll story.
 *
 * A native sticky-scroll sequence (no scroll-jacking, no pin fragility): a loop
 * diagram stays put on the left while the four stages — Brand · Build · Automate
 * · Grow — scroll past on the right. As each stage crosses the viewport its node
 * lights and its connection to the AUX core draws in, so by the end the loop is
 * visibly complete: the platform's story told in one scroll. This doubles as the
 * public "System Map" marketing sequence — the node placement reuses the real
 * `systemMapGeometry` primitive (§13), with generic, product-safe marketing data.
 *
 * Robust by construction: the DOM renders fully-lit and readable with no JS and
 * under reduced motion (content is never gated on animation); the scroll
 * choreography is added only on desktop with motion allowed, via gsap.matchMedia
 * (auto-cleaned). Mobile flows the stages naturally (sticky released).
 * ========================================================================== */

import { useRef } from "react";
import { Icon, systemMapGeometry } from "@brightloop/ui";
import { gsap, useGSAP, registerScrollTrigger, JOURNEY_STAGES } from "@brightloop/ui/motion";
import styles from "./journey.module.css";

const CODE: Record<string, string> = { Brand: "BR", Build: "BD", Automate: "AU", Grow: "GR" };
const GEO = systemMapGeometry(JOURNEY_STAGES.length); // 4 points on the orbit (0–100 space)
const CENTER = { x: 50, y: 50 };

export function TransformationJourney() {
  const rootRef = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      // CSS-module class names (indexed access is `string | undefined` under
      // noUncheckedIndexedAccess; they always exist at runtime).
      const LIT = styles.lit ?? "";
      const ACTIVE = styles.active ?? "";

      const nodes = gsap.utils.toArray<SVGGElement>(`.${styles.node}`, root);
      const links = gsap.utils.toArray<SVGLineElement>(`.${styles.link}`, root);
      const steps = gsap.utils.toArray<HTMLElement>(`.${styles.step}`, root);

      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px) and (prefers-reduced-motion: no-preference)", () => {
        registerScrollTrigger();

        // Reset to the "un-built" state, then let scroll build the loop.
        nodes.forEach((n) => n.classList.remove(LIT));
        links.forEach((l) => gsap.set(l, { strokeDashoffset: 1 }));

        const light = (i: number) => {
          const node = nodes[i];
          const link = links[i];
          if (node) node.classList.add(LIT);
          if (link) gsap.to(link, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out" });
        };
        const dim = (i: number) => {
          const node = nodes[i];
          const link = links[i];
          if (node) node.classList.remove(LIT);
          if (link) gsap.to(link, { strokeDashoffset: 1, duration: 0.4, ease: "power2.in" });
        };

        const triggers = steps.map((step, i) =>
          ScrollTriggerCreate(step, {
            onEnter: () => light(i),
            onEnterBack: () => step.classList.add(ACTIVE),
            onLeaveBack: () => {
              dim(i);
              step.classList.remove(ACTIVE);
            },
            onToggle: (active: boolean) => step.classList.toggle(ACTIVE, active),
          }),
        );

        return () => triggers.forEach((t) => t.kill());
      });
    },
    { scope: rootRef, dependencies: [] },
  );

  return (
    <section className={styles.journey} ref={rootRef} aria-label="How Auxion works">
      <div className={styles.grid}>
        {/* Sticky loop diagram (also the public System Map sequence). */}
        <div className={styles.sticky}>
          <div className={styles.diagram}>
            <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true">
              <circle cx="50" cy="50" r="33" className={styles.orbit} />
              {GEO.map((p, i) => (
                <line
                  key={`link-${i}`}
                  className={styles.link}
                  x1={p.x}
                  y1={p.y}
                  x2={CENTER.x}
                  y2={CENTER.y}
                  pathLength={1}
                  data-idx={i}
                />
              ))}
              {GEO.map((p, i) => (
                // Lit by default so no-JS / reduced-motion / mobile show the
                // complete loop; the scroll build removes then re-adds `lit`.
                <g key={`node-${i}`} className={`${styles.node} ${styles.lit}`} data-idx={i}>
                  <circle cx={p.x} cy={p.y} r="7.5" className={styles.nodeDisc} />
                  <text x={p.x} y={p.y} className={styles.nodeText} dominantBaseline="central" textAnchor="middle">
                    {CODE[JOURNEY_STAGES[i]!.discipline]}
                  </text>
                </g>
              ))}
              <circle cx="50" cy="50" r="12" className={styles.core} />
              <text x="50" y="50" className={styles.coreText} dominantBaseline="central" textAnchor="middle">
                AUX
              </text>
            </svg>
            <p className={styles.diagramCaption}>One connected loop — not four disconnected services.</p>
          </div>
        </div>

        {/* The four stages. */}
        <ol className={styles.steps}>
          {JOURNEY_STAGES.map((stage) => (
            <li className={styles.step} key={stage.discipline}>
              <span className={styles.stepNum} aria-hidden="true">
                {stage.n}
              </span>
              <div className={styles.stepBody}>
                <span className={styles.stepDiscipline}>
                  <Icon name={stage.icon} size={16} />
                  {stage.discipline}
                </span>
                <h3 className={styles.stepTitle}>{stage.title}</h3>
                <p className={styles.stepText}>{stage.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Thin wrapper so ScrollTrigger's typed create stays local and readable. */
function ScrollTriggerCreate(
  trigger: Element,
  cbs: {
    onEnter?: () => void;
    onEnterBack?: () => void;
    onLeaveBack?: () => void;
    onToggle?: (active: boolean) => void;
  },
) {
  const ST = registerScrollTrigger();
  return ST.create({
    trigger,
    start: "top 68%",
    end: "bottom 40%",
    onEnter: cbs.onEnter,
    onEnterBack: cbs.onEnterBack,
    onLeaveBack: cbs.onLeaveBack,
    onToggle: (self) => cbs.onToggle?.(self.isActive),
  });
}
