/* =============================================================================
 * Analytics aggregation — pure functions over the event stream + entity counts.
 *
 * Kept pure so the numbers on Admin Analytics are testable and identical
 * regardless of where the rows came from. No hardcoded KPIs (handoff §08).
 * ========================================================================== */

import type { AnalyticsEventName } from "./events.js";

export interface EventRow {
  name: string;
  at: string;
}

/** Count events by name over a list. */
export function countByName(events: readonly EventRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.name] = (out[e.name] ?? 0) + 1;
  return out;
}

export function countOf(events: readonly EventRow[], name: AnalyticsEventName): number {
  return events.reduce((n, e) => (e.name === name ? n + 1 : n), 0);
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous stage, 0–1. Null for the first stage. */
  rate: number | null;
}

/**
 * The acquisition funnel (handoff §08 "assessment→proposal→won conversion").
 * Each stage's rate is relative to the stage before it, so a zero upstream never
 * divides — the rate is null, not NaN or Infinity.
 */
export function acquisitionFunnel(counts: {
  assessments: number;
  proposalsAccepted: number;
  contractsSigned: number;
  activations: number;
}): FunnelStage[] {
  const stages = [
    { key: "assessment", label: "Assessments completed", count: counts.assessments },
    { key: "proposal", label: "Proposals accepted", count: counts.proposalsAccepted },
    { key: "contract", label: "Contracts signed", count: counts.contractsSigned },
    { key: "activation", label: "Clients activated", count: counts.activations },
  ];

  return stages.map((s, i) => {
    if (i === 0) return { ...s, rate: null };
    const prev = stages[i - 1]!.count;
    return { ...s, rate: prev > 0 ? s.count / prev : null };
  });
}

/** Format a 0–1 rate as a percentage string, or "—" when undefined. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}
