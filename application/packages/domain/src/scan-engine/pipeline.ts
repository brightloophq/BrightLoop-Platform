/* =============================================================================
 * Scan engine — PIPELINE stage order (pure). The canonical async flow:
 *   scan request → crawl → normalize → competitor discovery → benchmark →
 *   AI orchestration → diagnose → synthesize (Insights/recommendations) →
 *   report/proposal. A worker advances a job one stage at a time; this module
 *   owns the ORDER, nothing else. No I/O.
 * ========================================================================== */

import type { ScanStage } from "@brightloop/schema";

export const SCAN_PIPELINE: readonly ScanStage[] = [
  "requested",
  "crawling",
  "normalizing",
  "competitor_discovery",
  "benchmarking",
  "ai_orchestration",
  "diagnosing",
  "synthesizing",
  "reporting",
  "complete",
] as const;

/** The stage that follows `stage`, or null at the end of the pipeline. */
export function nextStage(stage: ScanStage): ScanStage | null {
  const i = SCAN_PIPELINE.indexOf(stage);
  if (i < 0 || i >= SCAN_PIPELINE.length - 1) return null;
  return SCAN_PIPELINE[i + 1]!;
}

export function isTerminalStage(stage: ScanStage): boolean {
  return stage === "complete";
}
