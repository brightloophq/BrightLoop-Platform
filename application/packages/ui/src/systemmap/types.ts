/* =============================================================================
 * Interactive System Map — shared types (PX.1d).
 *
 * The explorer is data-source agnostic: it renders whatever `ExplorerData` the
 * caller supplies (demo dataset or live core-surface read). Pure types only.
 * ========================================================================== */

export type NodeStatus = "operating" | "assembling" | "not_operating";
export type NodeRisk = "low" | "medium" | "high" | "critical";

export interface ExplorerSignal {
  readonly title: string;
  readonly severity: "critical" | "high" | "medium" | "low";
}
export interface ExplorerRec {
  readonly title: string;
  readonly priority: "high" | "medium" | "low";
}
export interface ExplorerEvent {
  readonly label: string;
  readonly at: string; // ISO
  readonly icon: string;
}
export interface ExplorerMetric {
  readonly label: string;
  readonly value: string;
}
/** Canned, evidence-shaped AI outputs (no live model call). */
export interface ExplorerAi {
  readonly summarize: string;
  readonly explain: string;
  readonly recommend: string;
  readonly predict: string;
  readonly risk: string;
  readonly nextAction: string;
}

export interface ExplorerNode {
  readonly key: string;
  readonly code: string; // "WEB"
  readonly label: string; // "Digital"
  readonly status: NodeStatus;
  readonly health: number | null; // 0..100
  readonly completion: number; // 0..100
  readonly automation: number; // 0..100 automation coverage
  readonly aiConfidence: number; // 0..1
  readonly risk: NodeRisk;
  readonly owner: string;
  readonly activeSignals: number;
  readonly recommendations: number;
  readonly lastUpdated: string; // ISO
  readonly connections: readonly string[]; // keys of connected domains
  // ---- detail-panel content ----
  readonly summary: string;
  readonly businessImpact: string;
  readonly signals: readonly ExplorerSignal[];
  readonly recs: readonly ExplorerRec[];
  readonly activity: readonly ExplorerEvent[];
  readonly metrics: readonly ExplorerMetric[];
  readonly history: readonly ExplorerEvent[];
  readonly nextActions: readonly string[];
  readonly ai: ExplorerAi;
}

export interface ExplorerConnection {
  readonly from: string;
  readonly to: string;
  /** What travels along the edge (shown on hover). */
  readonly flow: string;
  readonly health: NodeRisk; // reuse the scale for edge health
}

export interface ExplorerData {
  readonly nodes: readonly ExplorerNode[];
  readonly connections: readonly ExplorerConnection[];
  readonly index: { readonly value: number; readonly target: number; readonly pct: number };
  readonly scopeLabel: string;
}

/** Active filter state for the explorer. `null`/empty = no constraint. */
export interface ExplorerFilters {
  readonly minHealth: number | null;
  readonly risk: NodeRisk | null;
  readonly status: NodeStatus | null;
  readonly minAutomation: number | null;
}

export const EMPTY_FILTERS: ExplorerFilters = {
  minHealth: null,
  risk: null,
  status: null,
  minAutomation: null,
};
