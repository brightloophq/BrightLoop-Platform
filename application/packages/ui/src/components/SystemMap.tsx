import styles from "./SystemMap.module.css";

export interface SystemMapNodeInput {
  key: string;
  code: string; // "WEB"
  label: string; // "Digital"
  /** Lit (amber) when Operating; planned/dashed otherwise. */
  lit: boolean;
}

export interface SystemMapProps {
  /** The domain nodes (canonically seven), placed evenly around the AUX core. */
  nodes: SystemMapNodeInput[];
  /** Composite Index gauge: value/target and 0–1 progress. */
  index: { value: number; target: number; pct: number };
  /** Rendered box size in px (square). Default 280. */
  size?: number;
  className?: string;
}

/**
 * Evenly-spaced node positions on a ring (first node at top, clockwise). Pure +
 * deterministic — unit-tested independently of rendering.
 */
export function systemMapGeometry(count: number, cx = 50, cy = 50, r = 33): { x: number; y: number }[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => {
    const angle = (-90 + (360 / count) * i) * (Math.PI / 180);
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

const TRACK_R = 44;
const CIRC = 2 * Math.PI * TRACK_R;

/**
 * SystemMap — the canonical Auxion instrument (DS §06): seven domain nodes on an
 * orbit around the AUX core, with an Index gauge arc. Router-agnostic (renders no
 * links), token-only, theme-parity by construction, and reduced-motion aware (the
 * live-core pulse is disabled under prefers-reduced-motion). State is conveyed by
 * shape + the accessible label, never color alone.
 */
export function SystemMap({ nodes, index, size = 280, className }: SystemMapProps) {
  const pts = systemMapGeometry(nodes.length);
  const pct = Math.max(0, Math.min(1, index.pct));
  const operating = nodes.filter((n) => n.lit).length;

  return (
    <div
      className={[styles.wrap, className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`System Index ${index.value} of ${index.target}; ${operating} of ${nodes.length} domains operating`}
    >
      <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true">
        {/* Index gauge: track + progress arc (amber) */}
        <circle cx="50" cy="50" r={TRACK_R} className={styles.gaugeTrack} />
        <circle
          cx="50"
          cy="50"
          r={TRACK_R}
          className={styles.gaugeFill}
          strokeDasharray={`${(pct * CIRC).toFixed(2)} ${CIRC.toFixed(2)}`}
          transform="rotate(-90 50 50)"
        />
        {/* orbit + connectors */}
        <circle cx="50" cy="50" r="33" className={styles.orbit} />
        {pts.map((p, i) => (
          <line key={`link-${i}`} x1="50" y1="50" x2={p.x} y2={p.y} className={nodes[i]?.lit ? styles.linkLit : styles.link} />
        ))}
        {/* nodes */}
        {pts.map((p, i) => {
          const n = nodes[i]!;
          return (
            <g key={n.key}>
              <circle cx={p.x} cy={p.y} r="5.6" className={n.lit ? styles.nodeLit : styles.node} />
              <text x={p.x} y={p.y + 1.7} className={styles.nodeCode}>
                {n.code}
              </text>
            </g>
          );
        })}
        {/* AUX core */}
        <circle cx="50" cy="50" r="10.5" className={styles.core} />
        <text x="50" y="49" className={styles.coreIndex}>
          {index.value}
        </text>
        <text x="50" y="55.4" className={styles.coreLabel}>
          AUX
        </text>
      </svg>
    </div>
  );
}
