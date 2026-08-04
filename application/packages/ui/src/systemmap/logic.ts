/* =============================================================================
 * Interactive System Map — pure logic (PX.1d). No React, no DOM: search, filter
 * and connection geometry, all deterministic + unit-tested.
 * ========================================================================== */

import type { ExplorerData, ExplorerFilters, ExplorerNode, NodeRisk } from "./types";

export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Does a node match a free-text query (name/code/owner/status/risk)? Empty = all. */
export function matchesQuery(node: ExplorerNode, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    node.label.toLowerCase().includes(q) ||
    node.code.toLowerCase().includes(q) ||
    node.key.toLowerCase().includes(q) ||
    node.owner.toLowerCase().includes(q) ||
    node.status.replace(/_/g, " ").includes(q) ||
    node.risk.includes(q)
  );
}

const RISK_RANK: Record<NodeRisk, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Does a node satisfy all active filters? */
export function passesFilters(node: ExplorerNode, f: ExplorerFilters): boolean {
  if (f.minHealth !== null && (node.health ?? 0) < f.minHealth) return false;
  if (f.risk !== null && RISK_RANK[node.risk] < RISK_RANK[f.risk]) return false;
  if (f.status !== null && node.status !== f.status) return false;
  if (f.minAutomation !== null && node.automation < f.minAutomation) return false;
  return true;
}

export interface NodeState {
  /** Passes the active filters (else dimmed). */
  readonly visible: boolean;
  /** Matches the search query (else de-emphasized when a query is active). */
  readonly matched: boolean;
}

export interface ExplorerView {
  readonly states: Readonly<Record<string, NodeState>>;
  /** True when a search query is active (drives highlight styling). */
  readonly searching: boolean;
  /** Count of nodes passing filters. */
  readonly visibleCount: number;
  readonly matchedCount: number;
}

/** Compute per-node visible/matched state from filters + query. Pure. */
export function explorerView(data: ExplorerData, filters: ExplorerFilters, query: string): ExplorerView {
  const searching = query.trim().length > 0;
  const states: Record<string, NodeState> = {};
  let visibleCount = 0;
  let matchedCount = 0;
  for (const n of data.nodes) {
    const visible = passesFilters(n, filters);
    const matched = matchesQuery(n, query);
    if (visible) visibleCount++;
    if (searching && matched) matchedCount++;
    states[n.key] = { visible, matched };
  }
  return { states, searching, visibleCount, matchedCount };
}

/**
 * A gently core-bowed quadratic path between two node points, so inter-domain
 * connections read as orbits rather than a flat web. `center` defaults to the map
 * middle (50,50 in the 0–100 viewBox).
 */
export function connectionPath(a: Pt, b: Pt, center: Pt = { x: 50, y: 50 }, bow = 0.35): string {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // control point pulled toward the center for an orbital curve
  const cxp = mx + (center.x - mx) * bow;
  const cyp = my + (center.y - my) * bow;
  return `M${round(a.x)},${round(a.y)} Q${round(cxp)},${round(cyp)} ${round(b.x)},${round(b.y)}`;
}

/** Health → semantic tone (never the only signal; pair with label/icon). */
export function healthTone(health: number | null): "positive" | "caution" | "critical" | "neutral" {
  if (health === null) return "neutral";
  if (health >= 75) return "positive";
  if (health >= 55) return "caution";
  return "critical";
}

export function riskTone(risk: NodeRisk): "positive" | "caution" | "critical" {
  return risk === "low" ? "positive" : risk === "medium" || risk === "high" ? "caution" : "critical";
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
