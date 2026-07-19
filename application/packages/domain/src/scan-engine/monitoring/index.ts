/* =============================================================================
 * L8 · Monitoring Engine (PDF 27 §13) — SKELETON.
 *
 * Once an account is live the engine re-scans on schedule, diffs new evidence
 * against the prior graph to find what actually moved, tracks trend, and raises
 * signals to the operator. Six channels. Ports + pure change-classification only.
 * ========================================================================== */

import { monitoringChannelSchema, type MonitoringChannel } from "@brightloop/schema";

export const MONITORING_CHANNELS: readonly MonitoringChannel[] = monitoringChannelSchema.options;

export type ChangeDirection = "improved" | "declined" | "unchanged";

/** A detected change on one Index dimension between two scans. */
export interface DimensionChange {
  dimension: string;
  previous: number;
  current: number;
  direction: ChangeDirection;
  delta: number;
}

/** Pure change classification with a dead-band so noise isn't reported as movement. */
export function classifyChange(previous: number, current: number, deadband = 1): ChangeDirection {
  const delta = current - previous;
  if (Math.abs(delta) <= deadband) return "unchanged";
  return delta > 0 ? "improved" : "declined";
}

export function diffDimension(dimension: string, previous: number, current: number, deadband = 1): DimensionChange {
  return { dimension, previous, current, delta: current - previous, direction: classifyChange(previous, current, deadband) };
}

/* ---- monitoring port ------------------------------------------------------- */
export interface MonitoringEngine {
  /** Diff the current evidence graph against the prior to surface real movement. */
  detectChange(input: { scanId: string; previousScanId: string }): Promise<DimensionChange[]>;
}
