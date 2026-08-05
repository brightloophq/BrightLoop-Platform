/* =============================================================================
 * PlatformShowcase — "Auxion doesn't just advise. It operates."
 *
 * Auxion's edge over an ordinary agency is a real operating platform, so we show
 * it: layered interface panels naming the CANONICAL product surfaces (Console ·
 * Signals · Insights · Recommendations · Moves · Analytics) with depth, subtle
 * parallax, and a staggered scroll reveal. The panels are deliberately abstract
 * UI illustrations — no fabricated metrics, statistics, or client data — so the
 * section sells the system without inventing proof.
 *
 * A server component composing the client motion primitives (Reveal/Parallax),
 * so it ships no extra client boundary of its own.
 * ========================================================================== */

import { Container, Eyebrow, Icon, Section } from "@brightloop/ui";
import { Parallax, Reveal } from "@brightloop/ui/motion";
import styles from "./platform.module.css";

const SURFACES = [
  { name: "Console", icon: "gauge" },
  { name: "Signals", icon: "activity" },
  { name: "Insights", icon: "lightbulb" },
  { name: "Recommendations", icon: "sparkles" },
  { name: "Moves", icon: "workflow" },
  { name: "Analytics", icon: "line-chart" },
] as const;

/** Abstract rows for the Console panel — labels only, never claimed numbers. */
const CONSOLE_ROWS = [
  { label: "Signal", state: "Detected" },
  { label: "Insight", state: "Drafted" },
  { label: "Recommendation", state: "Ready" },
  { label: "Move", state: "Running" },
];

export function PlatformShowcase() {
  return (
    <Section tone="dark" className={styles.section}>
      <div className={styles.glow} aria-hidden="true" />
      <Container width="wide">
        <Reveal className={styles.head}>
          <Eyebrow>The platform</Eyebrow>
          <h2 className={styles.title}>Auxion doesn&rsquo;t just advise. It operates.</h2>
          <p className={styles.lede}>
            Behind the brand is a real operating system — the same console we run transformations
            through. Signals surface what matters, insights explain it, recommendations propose the
            next move, and the platform helps you make it.
          </p>
        </Reveal>

        <div className={styles.stage}>
          {/* Main console panel */}
          <Reveal stagger={false} className={styles.mainPanelWrap}>
            <div className={styles.panel} aria-hidden="true">
              <div className={styles.panelBar}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.panelName}>Console</span>
              </div>
              <div className={styles.panelBody}>
                {CONSOLE_ROWS.map((row) => (
                  <div className={styles.row} key={row.label}>
                    <span className={styles.rowLabel}>{row.label}</span>
                    <span className={styles.rowBar}>
                      <span className={styles.rowBarFill} />
                    </span>
                    <span className={styles.rowState}>{row.state}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          {/* Floating signal card */}
          <Parallax className={styles.floatA} distance={18}>
            <Reveal stagger={false}>
              <div className={styles.card} aria-hidden="true">
                <span className={styles.cardKicker}>
                  <Icon name="activity" size={14} /> Signal
                </span>
                <span className={styles.cardTitle}>Momentum shifting</span>
                <span className={styles.spark} />
              </div>
            </Reveal>
          </Parallax>

          {/* Floating recommendation card */}
          <Parallax className={styles.floatB} distance={26}>
            <Reveal stagger={false}>
              <div className={styles.card} aria-hidden="true">
                <span className={styles.cardKicker}>
                  <Icon name="sparkles" size={14} /> Recommendation
                </span>
                <span className={styles.cardTitle}>Next best move</span>
                <span className={styles.pill}>Approve</span>
              </div>
            </Reveal>
          </Parallax>
        </div>

        {/* Canonical surface strip */}
        <Reveal className={styles.surfaces}>
          {SURFACES.map((s) => (
            <span className={styles.surface} key={s.name}>
              <Icon name={s.icon} size={16} className={styles.surfaceIcon} />
              {s.name}
            </span>
          ))}
        </Reveal>
      </Container>
    </Section>
  );
}
