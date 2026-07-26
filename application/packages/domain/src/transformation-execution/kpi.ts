/* =============================================================================
 * KPI engine (Phase D · Sprint D6) — PURE.
 *
 * `status` is DERIVED from target vs current (up-is-good), never manually set:
 *   current ≥ target        → on_track
 *   current ≥ 70% of target → at_risk
 *   otherwise               → off_track
 * ========================================================================== */

import type { Kpi, KpiStatus } from "@brightloop/schema";

/** Deterministically evaluate a KPI's status from its target + current. Pure. */
export function evaluateKpi(target: number, current: number): KpiStatus {
  if (target <= 0) return current >= target ? "on_track" : "off_track";
  const ratio = current / target;
  if (ratio >= 1) return "on_track";
  if (ratio >= 0.7) return "at_risk";
  return "off_track";
}

export interface CreateKpiInput {
  id: string;
  workspaceId: string;
  clientId: string | null;
  name: string;
  target: number;
  current?: number;
  unit?: string;
  now: string;
}

/** Build a KPI with a derived status. Pure. */
export function createKpi(input: CreateKpiInput): Kpi {
  const current = input.current ?? 0;
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    name: input.name.slice(0, 160),
    target: input.target,
    current,
    unit: input.unit ?? "",
    status: evaluateKpi(input.target, current),
    lastUpdated: input.now,
    version: 1,
    createdAt: input.now,
  };
}

/** Record a new measurement; re-evaluates status, stamps `lastUpdated`. Pure. */
export function updateKpi(kpi: Kpi, current: number, now: string): Kpi {
  return { ...kpi, current, status: evaluateKpi(kpi.target, current), lastUpdated: now, version: kpi.version + 1 };
}
