/* =============================================================================
 * Transformation dashboard — read model (pure).
 *
 * This is the business logic behind the authenticated dashboard: how a raw
 * database snapshot becomes the executive metrics, pipeline counts, attention
 * list and activity feed the UI renders. It is deliberately PURE and free of
 * React and Supabase so it can be unit-tested and reused — the data adapter
 * fills the snapshot, the page renders the view.
 *
 * Authorization + scope live here too (layer 2). RLS remains the real boundary:
 * the snapshot is always produced with the caller's request-scoped client, so a
 * client role physically cannot read another org's rows regardless of this code.
 * ========================================================================== */

import { isClientRole } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { assertCapability } from "../capabilities.js";

/* ---- scope + authorization ------------------------------------------------ */

/**
 * Whose data the dashboard shows. Client roles see only their own organization;
 * internal roles see the whole portfolio (RLS lets internal read every org's
 * transformation rows).
 */
export type DashboardScope =
  | { readonly kind: "organization"; readonly clientId: string }
  | { readonly kind: "portfolio" };

/** Resolve the scope from the actor. Client role without an org id is malformed. */
export function resolveDashboardScope(actor: Actor): DashboardScope {
  if (isClientRole(actor.role)) {
    if (!actor.clientId) {
      throw new Error("A client-scoped actor must carry a client_id to view the dashboard.");
    }
    return { kind: "organization", clientId: actor.clientId };
  }
  return { kind: "portfolio" };
}

/**
 * Assert the actor may read the dashboard. Internal roles need
 * `transformation.read`; client roles need `own.transformation.read` (their own
 * org is enforced by scope + RLS). Throws AuthorizationError otherwise.
 */
export function assertDashboardRead(actor: Actor): void {
  assertCapability(actor, isClientRole(actor.role) ? "own.transformation.read" : "transformation.read");
}

/* ---- raw snapshot (produced by the data adapter) -------------------------- */

/** One row of the audit/activity feed (a persisted state transition). */
export interface DashboardActivity {
  readonly id: string;
  readonly entity: string; // machine name, e.g. "signal"
  readonly entityId: string;
  readonly from: string | null;
  readonly to: string;
  readonly actor: string | null; // display name or user id; null = system
  readonly at: string; // ISO timestamp
}

/** The raw, un-derived read snapshot. Maps are status → count. */
export interface DashboardSnapshot {
  readonly businessHealth: { readonly score: number } | null;
  readonly transformationIndex: { readonly value: number; readonly delta: number | null } | null;
  /** Portfolio scope only: how many organizations have a health snapshot. */
  readonly orgsTracked: number | null;
  readonly signals: Readonly<Record<string, number>>;
  readonly insights: Readonly<Record<string, number>>;
  readonly recommendations: Readonly<Record<string, number>>;
  readonly recommendationsStale: number;
  readonly approvals: Readonly<Record<string, number>>; // by `decision`
  readonly moves: Readonly<Record<string, number>>;
  readonly executions: Readonly<Record<string, number>>;
  readonly measurements: number;
  readonly learnings: number;
  readonly risks: { readonly total: number; readonly criticalOpen: number };
  readonly knowledge: number;
  readonly activity: readonly DashboardActivity[];
}

/**
 * The dashboard read port: produces the raw snapshot for a scope. Implemented by
 * the Supabase adapter (live) and the demo adapter (Demo Mode); consumers depend
 * on this shape, never on a concrete repository or data source.
 */
export interface TransformationDashboardReader {
  read(scope: DashboardScope): Promise<DashboardSnapshot>;
}

/* ---- pure helpers (shared with the adapter, unit-tested) ------------------ */

/** Tally a list of rows by a string field into a status→count map. */
export function tallyByKey<T extends Record<K, string>, K extends string>(
  rows: readonly T[],
  key: K,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const value = row[key];
    out[value] = (out[value] ?? 0) + 1;
  }
  return out;
}

/** Sum selected buckets of a status map (all buckets if none named). */
export function sumBuckets(map: Readonly<Record<string, number>>, keys?: readonly string[]): number {
  if (!keys) return Object.values(map).reduce((a, b) => a + b, 0);
  return keys.reduce((total, k) => total + (map[k] ?? 0), 0);
}

/** A recommendation is stale when still open past the threshold. */
export const STALE_RECOMMENDATION_DAYS = 14;
const OPEN_RECOMMENDATION_STATUSES = ["proposed", "adjusted"] as const;

/** Count still-open recommendations older than `days`. Pure — `nowMs` injected. */
export function countStaleRecommendations(
  rows: readonly { readonly status: string; readonly createdAt: string }[],
  nowMs: number,
  days: number = STALE_RECOMMENDATION_DAYS,
): number {
  const cutoff = nowMs - days * 24 * 60 * 60 * 1000;
  return rows.filter(
    (r) =>
      (OPEN_RECOMMENDATION_STATUSES as readonly string[]).includes(r.status) &&
      Date.parse(r.createdAt) < cutoff,
  ).length;
}

/** Count critical risks that are still open (not mitigated / accepted / dismissed). */
const RESOLVED_RISK_STATUSES = ["mitigated", "accepted", "dismissed"] as const;
export function countCriticalOpenRisks(
  rows: readonly { readonly severity: string; readonly status: string }[],
): number {
  return rows.filter(
    (r) => r.severity === "critical" && !(RESOLVED_RISK_STATUSES as readonly string[]).includes(r.status),
  ).length;
}

/* ---- derived view model (what the page renders) --------------------------- */

export interface DashboardMetric {
  readonly key: string;
  readonly label: string;
  /** null → no data yet; the card shows an empty state instead of a misleading 0. */
  readonly value: number | null;
  readonly suffix?: string;
  readonly href?: string;
}

export interface PipelineStage {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly href?: string;
}

export interface AttentionItem {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly tone: "danger" | "warning" | "info";
  readonly href?: string;
}

export interface DashboardView {
  readonly scope: DashboardScope;
  readonly metrics: readonly DashboardMetric[];
  readonly pipeline: readonly PipelineStage[];
  readonly attention: readonly AttentionItem[];
  /** True when nothing needs attention — the UI shows a positive empty state. */
  readonly attentionClear: boolean;
  readonly activity: readonly DashboardActivity[];
  /** True when the whole scope has no transformation data yet. */
  readonly isEmpty: boolean;
}

/** How many activity rows the feed shows. */
export const ACTIVITY_LIMIT = 8;

// Buckets that make up each derived count.
const OPEN_SIGNALS = ["detected", "validated", "prioritized"];
const ACTIVE_INSIGHTS = ["generated", "endorsed"];
const ACTIVE_RECS = ["proposed", "adjusted"];
const MOVES_IN_PROGRESS = ["approved", "executing"];
const MOVES_COMPLETED = ["completed", "measured"];

/**
 * Turn a raw snapshot into the dashboard view model. Metrics with no underlying
 * data are left `null` (never a fabricated 0). Attention items are dropped when
 * their count is 0, and activity is ordered newest-first and capped.
 */
export function buildDashboardView(snapshot: DashboardSnapshot, scope: DashboardScope): DashboardView {
  const health = snapshot.businessHealth?.score ?? null;
  const index = snapshot.transformationIndex?.value ?? null;

  const openSignals = sumBuckets(snapshot.signals, OPEN_SIGNALS);
  const insights = sumBuckets(snapshot.insights, ACTIVE_INSIGHTS);
  const recommendations = sumBuckets(snapshot.recommendations, ACTIVE_RECS);
  const awaitingApproval = snapshot.approvals["pending"] ?? 0;
  const movesInProgress = sumBuckets(snapshot.moves, MOVES_IN_PROGRESS);
  const movesCompleted = sumBuckets(snapshot.moves, MOVES_COMPLETED);

  const metrics: DashboardMetric[] = [
    { key: "health", label: "Business Health", value: health, suffix: "/100" },
    { key: "index", label: "Transformation Index", value: index },
    { key: "open-signals", label: "Open Signals", value: openSignals, href: "/admin/signals" },
    { key: "insights", label: "Insights", value: insights, href: "/admin/insights" },
    { key: "recommendations", label: "Recommendations", value: recommendations, href: "/admin/recommendations" },
    { key: "awaiting-approval", label: "Awaiting Approval", value: awaitingApproval, href: "/admin/approvals" },
    { key: "moves-in-progress", label: "Moves In Progress", value: movesInProgress, href: "/admin/moves" },
    { key: "moves-completed", label: "Completed Moves", value: movesCompleted, href: "/admin/moves" },
  ];

  const pipeline: PipelineStage[] = [
    { key: "signal", label: "Signal", count: sumBuckets(snapshot.signals), href: "/admin/signals" },
    { key: "insight", label: "Insight", count: sumBuckets(snapshot.insights), href: "/admin/insights" },
    { key: "recommendation", label: "Recommendation", count: sumBuckets(snapshot.recommendations), href: "/admin/recommendations" },
    { key: "approval", label: "Approval", count: sumBuckets(snapshot.approvals), href: "/admin/approvals" },
    { key: "move", label: "Move", count: sumBuckets(snapshot.moves), href: "/admin/moves" },
    { key: "execution", label: "Execution", count: sumBuckets(snapshot.executions), href: "/admin/moves" },
    { key: "measurement", label: "Measurement", count: snapshot.measurements, href: "/admin/measurements" },
    { key: "learning", label: "Learning", count: snapshot.learnings },
  ];

  const attentionAll: AttentionItem[] = [
    { key: "pending-approvals", label: "Pending approvals", count: awaitingApproval, tone: "warning", href: "/admin/approvals" },
    { key: "critical-risks", label: "Critical risks", count: snapshot.risks.criticalOpen, tone: "danger" },
    { key: "blocked-executions", label: "Blocked executions", count: snapshot.executions["failed"] ?? 0, tone: "danger", href: "/admin/moves" },
    { key: "stale-recommendations", label: "Stale recommendations", count: snapshot.recommendationsStale, tone: "warning", href: "/admin/recommendations" },
  ];
  const attention = attentionAll.filter((a) => a.count > 0);

  const activity = [...snapshot.activity]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, ACTIVITY_LIMIT);

  const totalPipeline = pipeline.reduce((sum, stage) => sum + stage.count, 0);
  const isEmpty = totalPipeline === 0 && health === null && index === null && snapshot.activity.length === 0;

  return {
    scope,
    metrics,
    pipeline,
    attention,
    attentionClear: attention.length === 0,
    activity,
    isEmpty,
  };
}
