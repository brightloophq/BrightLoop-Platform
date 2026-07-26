/* =============================================================================
 * Workspace Health policy (Phase D · Sprint D6) — PURE.
 *
 * Health is DERIVED from the execution signals — never hardcoded on a workspace.
 * A dedicated deterministic policy blends review/task/dependency completion,
 * timeline variance, and KPI status into `healthy | warning | critical`.
 * ========================================================================== */

import type { KpiStatus, WorkspaceHealth } from "@brightloop/schema";

export interface WorkspaceHealthInput {
  /** Ratios in [0, 1]. */
  reviewCompletion: number;
  taskCompletion: number;
  dependencySatisfaction: number;
  /** Aggregate timeline variance in whole days (positive = late); null when none. */
  timelineVarianceDays: number | null;
  kpiStatuses: readonly KpiStatus[];
}

export interface WorkspaceHealthResult {
  health: WorkspaceHealth;
  /** The signals that triggered a downgrade — for the read model, not hardcoded. */
  reasons: string[];
}

/** Days late beyond which the schedule is a critical / warning signal. */
export const HEALTH_TIMELINE_CRITICAL_DAYS = 14;

/** Evaluate workspace health deterministically. Pure. */
export function calculateWorkspaceHealth(input: WorkspaceHealthInput): WorkspaceHealthResult {
  const offTrack = input.kpiStatuses.filter((s) => s === "off_track").length;
  const atRisk = input.kpiStatuses.filter((s) => s === "at_risk").length;
  const late = input.timelineVarianceDays;

  const critical: string[] = [];
  if (input.taskCompletion < 0.3) critical.push("task completion below 30%");
  if (offTrack > 0) critical.push(`${offTrack} KPI(s) off track`);
  if (late !== null && late > HEALTH_TIMELINE_CRITICAL_DAYS) critical.push(`timeline over ${HEALTH_TIMELINE_CRITICAL_DAYS} days late`);
  if (critical.length > 0) return { health: "critical", reasons: critical };

  const warning: string[] = [];
  if (input.taskCompletion < 0.6) warning.push("task completion below 60%");
  if (input.reviewCompletion < 0.5) warning.push("under half of initiatives approved");
  if (input.dependencySatisfaction < 1) warning.push("unsatisfied dependencies");
  if (atRisk > 0) warning.push(`${atRisk} KPI(s) at risk`);
  if (late !== null && late > 0) warning.push("timeline running late");
  if (warning.length > 0) return { health: "warning", reasons: warning };

  return { health: "healthy", reasons: [] };
}
