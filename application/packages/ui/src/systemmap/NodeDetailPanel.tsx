"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Badge } from "../components/Badge";
import { healthTone, riskTone } from "./logic";
import type { ExplorerAi, ExplorerNode } from "./types";
import styles from "./NodeDetailPanel.module.css";

const AI_ACTIONS: { key: keyof ExplorerAi; label: string; icon: string }[] = [
  { key: "summarize", label: "Summarize", icon: "sparkles" },
  { key: "explain", label: "Explain", icon: "lightbulb" },
  { key: "recommend", label: "Recommend", icon: "target" },
  { key: "predict", label: "Predict", icon: "trending-up" },
  { key: "risk", label: "Risk analysis", icon: "bell" },
  { key: "nextAction", label: "Next best action", icon: "arrow-up-right" },
];

const STATUS_LABEL: Record<string, string> = {
  operating: "Operating",
  assembling: "Assembling",
  not_operating: "Not operating",
};

function relative(iso: string, now: number): string {
  const mins = Math.max(0, Math.floor((now - Date.parse(iso)) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d ago` : new Date(iso).toLocaleDateString();
}

export interface NodeDetailPanelProps {
  readonly node: ExplorerNode;
  readonly connectedLabels: readonly string[];
  readonly now: number;
  readonly onClose: () => void;
}

/**
 * NodeDetailPanel — the professional per-node detail (PX.1d): overview, status,
 * impact, signals, recommendations, activity, connected systems, metrics,
 * history, next actions, and an AI layer (canned, evidence-shaped outputs — no
 * live model call). role="dialog", Esc to close, focus moved in on open and a
 * screen-reader-friendly structure. Token-only → theme-aware.
 */
export function NodeDetailPanel({ node, connectedLabels, now, onClose }: NodeDetailPanelProps) {
  const [ai, setAi] = useState<keyof ExplorerAi | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAi(null);
    ref.current?.focus();
  }, [node.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const statusTone = node.status === "operating" ? "positive" : node.status === "assembling" ? "caution" : "neutral";

  return (
    <aside
      className={styles.panel}
      role="dialog"
      aria-label={`${node.label} details`}
      tabIndex={-1}
      ref={ref}
    >
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>{node.code} · {STATUS_LABEL[node.status]}</div>
          <h2 className={styles.title}>{node.label}</h2>
        </div>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close details">
          <Icon name="x" size={18} />
        </button>
      </header>

      <div className={styles.scroll}>
        {/* Overview */}
        <p className={styles.summary}>{node.summary}</p>

        {/* Current status */}
        <Section title="Current status">
          <div className={styles.statGrid}>
            <Stat k="Status" v={STATUS_LABEL[node.status]!} tone={statusTone} icon="activity" />
            <Stat k="Health" v={node.health === null ? "—" : `${node.health}/100`} tone={healthTone(node.health)} icon="gauge" />
            <Stat k="Completion" v={`${node.completion}%`} icon="check-circle" />
            <Stat k="Automation" v={`${node.automation}%`} icon="workflow" />
            <Stat k="AI confidence" v={`${Math.round(node.aiConfidence * 100)}%`} icon="sparkles" />
            <Stat k="Risk" v={node.risk} tone={riskTone(node.risk)} icon="bell" />
          </div>
        </Section>

        {/* Business impact */}
        <Section title="Business impact">
          <p className={styles.body}>{node.businessImpact}</p>
        </Section>

        {/* AI layer */}
        <Section title="AI assistance">
          <div className={styles.aiRow}>
            {AI_ACTIONS.map((a) => (
              <button
                key={a.key}
                type="button"
                className={styles.aiBtn}
                data-active={ai === a.key}
                onClick={() => setAi((cur) => (cur === a.key ? null : a.key))}
              >
                <Icon name={a.icon} size={13} /> {a.label}
              </button>
            ))}
          </div>
          {ai && (
            <div className={styles.aiOut} role="status">
              <span className={styles.aiTag}>AI</span> {node.ai[ai]}
            </div>
          )}
        </Section>

        {/* Open signals */}
        <Section title={`Open signals (${node.signals.length})`}>
          {node.signals.length === 0 ? (
            <p className={styles.muted}>No open signals.</p>
          ) : (
            <ul className={styles.list}>
              {node.signals.map((s) => (
                <li key={s.title} className={styles.listRow}>
                  <span>{s.title}</span>
                  <Badge status={s.severity} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Recommendations */}
        <Section title={`Recommendations (${node.recs.length})`}>
          {node.recs.length === 0 ? (
            <p className={styles.muted}>None right now.</p>
          ) : (
            <ul className={styles.list}>
              {node.recs.map((r) => (
                <li key={r.title} className={styles.listRow}>
                  <span>{r.title}</span>
                  <Badge status={r.priority} />
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Recent activity */}
        <Section title="Recent activity">
          <ul className={styles.timeline}>
            {node.activity.map((e, i) => (
              <li key={i} className={styles.tItem}>
                <span className={styles.tIcon}><Icon name={e.icon} size={13} /></span>
                <span className={styles.tLabel}>{e.label}</span>
                <span className={styles.tTime}>{relative(e.at, now)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Connected systems */}
        <Section title="Connected systems">
          <div className={styles.chips}>
            {connectedLabels.length === 0 ? (
              <span className={styles.muted}>No dependencies.</span>
            ) : (
              connectedLabels.map((c) => <span key={c} className={styles.chip}>{c}</span>)
            )}
          </div>
        </Section>

        {/* Metrics */}
        <Section title="Metrics">
          <div className={styles.metricGrid}>
            {node.metrics.map((m) => (
              <div key={m.label} className={styles.metric}>
                <div className={styles.metricV}>{m.value}</div>
                <div className={styles.metricK}>{m.label}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* History */}
        <Section title="History">
          <ul className={styles.timeline}>
            {node.history.map((e, i) => (
              <li key={i} className={styles.tItem}>
                <span className={styles.tIcon}><Icon name={e.icon} size={13} /></span>
                <span className={styles.tLabel}>{e.label}</span>
                <span className={styles.tTime}>{relative(e.at, now)}</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Next actions */}
        <Section title="Next actions">
          <ul className={styles.actions}>
            {node.nextActions.map((a) => (
              <li key={a} className={styles.action}>
                <Icon name="arrow-right" size={13} /> {a}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {children}
    </section>
  );
}

function Stat({ k, v, tone, icon }: { k: string; v: string; tone?: string; icon: string }) {
  return (
    <div className={styles.stat} data-tone={tone ?? "neutral"}>
      <span className={styles.statIcon}><Icon name={icon} size={13} /></span>
      <div>
        <div className={styles.statV}>{v}</div>
        <div className={styles.statK}>{k}</div>
      </div>
    </div>
  );
}
