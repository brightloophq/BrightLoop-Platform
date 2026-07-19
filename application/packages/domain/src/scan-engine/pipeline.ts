/* =============================================================================
 * Scan engine — PIPELINE stage order (pure). The NINE canonical stages (PDF 26
 * §02), in order: discover → crawl → identify competitors → collect evidence →
 * benchmark → diagnose → generate Insights → build recommendations → prepare
 * report. Each stage is a checkpoint; a worker advances one stage at a time and
 * a dropped job resumes from `lastCompletedStage`. This module owns the ORDER
 * only. No I/O. Queue/terminal state lives in ScanJobStatus, not here.
 * ========================================================================== */

import type { ScanStage } from "@brightloop/schema";

export const SCAN_PIPELINE: readonly ScanStage[] = [
  "discovering",
  "crawling",
  "identifying_competitors",
  "collecting_evidence",
  "benchmarking",
  "diagnosing",
  "generating_insights",
  "building_recommendations",
  "preparing_report",
] as const;

/** The stage that follows `stage`, or null after the final stage. */
export function nextStage(stage: ScanStage): ScanStage | null {
  const i = SCAN_PIPELINE.indexOf(stage);
  if (i < 0 || i >= SCAN_PIPELINE.length - 1) return null;
  return SCAN_PIPELINE[i + 1]!;
}

/** True once `preparing_report` (the ninth stage) is reached. */
export function isTerminalStage(stage: ScanStage): boolean {
  return stage === "preparing_report";
}
