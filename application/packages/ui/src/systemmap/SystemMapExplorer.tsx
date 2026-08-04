"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "../components/Icon";
import { systemMapGeometry } from "../components/SystemMap";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { connectionPath, explorerView } from "./logic";
import { EMPTY_FILTERS, type ExplorerData, type ExplorerFilters, type NodeStatus } from "./types";
import styles from "./systemmap.module.css";

const STATUS_CLASS: Record<NodeStatus, string> = {
  operating: styles.stOperating!,
  assembling: styles.stAssembling!,
  not_operating: styles.stNot_operating!,
};
const STATUS_LABEL: Record<NodeStatus, string> = {
  operating: "Operating",
  assembling: "Assembling",
  not_operating: "Not operating",
};

export interface SystemMapExplorerProps {
  readonly data: ExplorerData;
}

/**
 * SystemMapExplorer — the signature interactive Transformation System Map (PX.1d).
 * Reuses the canonical `systemMapGeometry` layout and extends it with: interactive
 * nodes (hover summary card + click → detail panel), inter-domain connections
 * (hover explains the flow), search (highlights matches), filters (dims non-
 * matching), keyboard navigation, and a per-node AI layer + timeline in the panel.
 * Token-only (Light/Dark/System), reduced-motion safe, and data-source agnostic
 * (demo or live). No backend/architecture change.
 */
export function SystemMapExplorer({ data }: SystemMapExplorerProps) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ExplorerFilters>(EMPTY_FILTERS);
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const nodeRefs = useRef<Array<SVGGElement | null>>([]);

  const pts = useMemo(() => systemMapGeometry(data.nodes.length), [data.nodes.length]);
  const posByKey = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {};
    data.nodes.forEach((n, i) => (m[n.key] = pts[i]!));
    return m;
  }, [data.nodes, pts]);
  const view = useMemo(() => explorerView(data, filters, query), [data, filters, query]);

  const selected = selectedKey ? data.nodes.find((n) => n.key === selectedKey) ?? null : null;
  const hovered = hoverKey ? data.nodes.find((n) => n.key === hoverKey) ?? null : null;
  const connectedLabels = selected
    ? selected.connections
        .map((k) => data.nodes.find((n) => n.key === k)?.label)
        .filter((l): l is string => Boolean(l))
    : [];

  const toggle = <K extends keyof ExplorerFilters>(key: K, value: ExplorerFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));

  const onNodeKey = (e: ReactKeyboardEvent, i: number, key: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedKey(key);
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nodeRefs.current[(i + 1) % data.nodes.length]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nodeRefs.current[(i - 1 + data.nodes.length) % data.nodes.length]?.focus();
    }
  };

  return (
    <div className={styles.explorer} data-open={selected ? "true" : "false"}>
      <div>
        {/* controls */}
        <div className={styles.controls}>
          <label className={styles.search}>
            <Icon name="search" size={15} />
            <input
              className={styles.searchInput}
              type="search"
              placeholder="Search domains, owners, status…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search the system map"
            />
          </label>
          <button type="button" className={styles.filterChip} data-active={filters.status === "operating"} onClick={() => toggle("status", "operating")}>
            <Icon name="check-circle" size={12} /> Operating
          </button>
          <button type="button" className={styles.filterChip} data-active={filters.minHealth === 70} onClick={() => toggle("minHealth", 70)}>
            <Icon name="gauge" size={12} /> Health ≥ 70
          </button>
          <button type="button" className={styles.filterChip} data-active={filters.risk === "high"} onClick={() => toggle("risk", "high")}>
            <Icon name="bell" size={12} /> Risk ≥ high
          </button>
          <button type="button" className={styles.filterChip} data-active={filters.minAutomation === 50} onClick={() => toggle("minAutomation", 50)}>
            <Icon name="workflow" size={12} /> Automation ≥ 50%
          </button>
          <span className={styles.resultCount}>
            {view.searching ? `${view.matchedCount} match${view.matchedCount === 1 ? "" : "es"}` : `${view.visibleCount}/${data.nodes.length} domains`}
          </span>
        </div>

        {/* the map */}
        <div className={styles.stage}>
          <svg viewBox="0 0 100 100" className={styles.svg} role="group" aria-label={`Transformation System Map — ${data.scopeLabel}. ${data.nodes.length} domains.`}>
            <circle cx="50" cy="50" r="33" className={styles.orbit} />

            {/* connections */}
            {data.connections.map((c, i) => {
              const a = posByKey[c.from];
              const b = posByKey[c.to];
              if (!a || !b) return null;
              const active = hoverEdge === i || (hovered && (c.from === hoverKey || c.to === hoverKey)) || (selected && (c.from === selectedKey || c.to === selectedKey));
              return (
                <path
                  key={`${c.from}-${c.to}`}
                  d={connectionPath(a, b)}
                  className={active ? styles.connectionFlow : styles.connection}
                  data-active={active ? "true" : "false"}
                  onMouseEnter={() => setHoverEdge(i)}
                  onMouseLeave={() => setHoverEdge(null)}
                  aria-label={`${data.nodes.find((n) => n.key === c.from)?.label} → ${data.nodes.find((n) => n.key === c.to)?.label}: ${c.flow}`}
                />
              );
            })}

            {/* nodes */}
            {data.nodes.map((n, i) => {
              const p = pts[i]!;
              const st = view.states[n.key]!;
              const dim = (!st.visible) || (view.searching && !st.matched);
              return (
                <g
                  key={n.key}
                  ref={(el) => { nodeRefs.current[i] = el; }}
                  className={[styles.node, dim ? styles.nodeDim : null].filter(Boolean).join(" ")}
                  tabIndex={0}
                  role="button"
                  aria-label={`${n.label} — ${STATUS_LABEL[n.status]}, health ${n.health ?? "unknown"}, ${n.activeSignals} active signals. Open details.`}
                  data-selected={selectedKey === n.key ? "true" : "false"}
                  data-matched={view.searching && st.matched ? "true" : "false"}
                  onMouseEnter={() => setHoverKey(n.key)}
                  onMouseLeave={() => setHoverKey((k) => (k === n.key ? null : k))}
                  onFocus={() => setHoverKey(n.key)}
                  onBlur={() => setHoverKey((k) => (k === n.key ? null : k))}
                  onClick={() => setSelectedKey(n.key)}
                  onKeyDown={(e) => onNodeKey(e, i, n.key)}
                >
                  <circle cx={p.x} cy={p.y} r="8.5" className={styles.nodeRing} />
                  <circle cx={p.x} cy={p.y} r="6.2" className={`${styles.nodeCircle} ${STATUS_CLASS[n.status]}`} />
                  <text x={p.x} y={p.y + 0.4} className={styles.nodeCode} fill={n.status === "operating" ? "var(--on-signal)" : "var(--text-primary)"}>
                    {n.code}
                  </text>
                  <text x={p.x} y={p.y + 12} className={styles.nodeLabel}>{n.label}</text>
                </g>
              );
            })}

            {/* core */}
            <circle cx="50" cy="50" r="11" className={styles.core} />
            <text x="50" y="49.5" className={styles.coreIndex}>{data.index.value}</text>
            <text x="50" y="55" className={styles.coreLabel}>AUX</text>
          </svg>

          {/* hover summary card */}
          {hovered && posByKey[hovered.key] && (
            <div className={styles.hoverCard} style={{ left: `${posByKey[hovered.key]!.x}%`, top: `${posByKey[hovered.key]!.y}%` }}>
              <div className={styles.hoverTitle}>
                <Icon name="activity" size={14} /> {hovered.label}
              </div>
              <div className={styles.hoverGrid}>
                <span className={styles.hoverK}>Status</span><span className={styles.hoverV}>{STATUS_LABEL[hovered.status]}</span>
                <span className={styles.hoverK}>Health</span><span className={styles.hoverV}>{hovered.health ?? "—"}</span>
                <span className={styles.hoverK}>Completion</span><span className={styles.hoverV}>{hovered.completion}%</span>
                <span className={styles.hoverK}>Automation</span><span className={styles.hoverV}>{hovered.automation}%</span>
                <span className={styles.hoverK}>AI conf.</span><span className={styles.hoverV}>{Math.round(hovered.aiConfidence * 100)}%</span>
                <span className={styles.hoverK}>Owner</span><span className={styles.hoverV}>{hovered.owner}</span>
                <span className={styles.hoverK}>Signals</span><span className={styles.hoverV}>{hovered.activeSignals}</span>
                <span className={styles.hoverK}>Recs</span><span className={styles.hoverV}>{hovered.recommendations}</span>
              </div>
            </div>
          )}

          {/* connection tooltip */}
          {hoverEdge !== null && data.connections[hoverEdge] && (() => {
            const c = data.connections[hoverEdge]!;
            const a = posByKey[c.from];
            const b = posByKey[c.to];
            if (!a || !b) return null;
            return (
              <div className={styles.edgeTip} style={{ left: `${(a.x + b.x) / 2}%`, top: `${(a.y + b.y) / 2}%` }}>
                <strong>{data.nodes.find((n) => n.key === c.from)?.label}</strong> → <strong>{data.nodes.find((n) => n.key === c.to)?.label}</strong>
                <br />{c.flow} · health {c.health}
              </div>
            );
          })()}
        </div>

        {/* legend */}
        <div className={styles.legendRow}>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "var(--positive)" }} /> Operating</span>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "var(--caution)" }} /> Assembling</span>
          <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "var(--surface-2)", border: "1px solid var(--line-strong)" }} /> Not operating</span>
        </div>
      </div>

      {selected && (
        <NodeDetailPanel node={selected} connectedLabels={connectedLabels} now={now} onClose={() => setSelectedKey(null)} />
      )}
    </div>
  );
}
