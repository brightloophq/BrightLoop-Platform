/* =============================================================================
 * Budget propagation (Sprint 8 §6 · AIS-001 §12 Cost Awareness · AIS-002 A05) — PURE.
 *
 * Propagates the scan budget down to stage and reasoning-job ceilings, accumulates
 * estimated + actual spend, and enforces the hard ceiling: NO downstream stage may
 * be granted more than the remaining budget. The soft warning fires before the
 * hard stop; the hard ceiling is absolute.
 * ========================================================================== */

import type { PipelineBudget, PipelineSpend, ReasoningBudget } from "@brightloop/schema";

/** Fresh spend state for a new run. Pure. */
export function initialSpend(budget: PipelineBudget): PipelineSpend {
  return { estimated: 0, actual: 0, remaining: budget.scanCeiling, softWarning: false, hardStop: false };
}

export function remainingBudget(budget: PipelineBudget, spend: PipelineSpend): number {
  return budget.scanCeiling - spend.actual;
}

/**
 * Accrue spend from a completed stage. `remaining` may go negative to expose an
 * overrun rather than hide it; `hardStop` latches once the ceiling is breached. Pure.
 */
export function accrueSpend(budget: PipelineBudget, spend: PipelineSpend, estimated: number, actual: number): PipelineSpend {
  const nextEstimated = spend.estimated + estimated;
  const nextActual = spend.actual + actual;
  const remaining = budget.scanCeiling - nextActual;
  return {
    estimated: nextEstimated,
    actual: nextActual,
    remaining,
    softWarning: nextActual >= budget.softWarningAt,
    hardStop: spend.hardStop || nextActual > budget.scanCeiling,
  };
}

/**
 * The ceiling a stage may spend: the stage ceiling, capped by what remains of the
 * scan budget. Never exceeds the remaining hard ceiling. Pure.
 */
export function stageCeiling(budget: PipelineBudget, spend: PipelineSpend): number {
  return Math.max(0, Math.min(budget.stageCeiling, remainingBudget(budget, spend)));
}

/** A stage may run only when some budget remains. Pure. */
export function canAffordStage(budget: PipelineBudget, spend: PipelineSpend): boolean {
  return !spend.hardStop && stageCeiling(budget, spend) > 0;
}

/**
 * Derive a reasoning-job budget from the pipeline budget + current spend. The cost
 * ceiling is the job ceiling capped by the stage ceiling capped by what remains —
 * so a downstream job can never outspend the scan. Pure.
 */
export function reasoningBudgetFor(budget: PipelineBudget, spend: PipelineSpend, tokens: { inputTokens: number; outputTokens: number }, latencyCeilingMs: number): ReasoningBudget {
  const ceiling = Math.max(0, Math.min(budget.reasoningJobCeiling, stageCeiling(budget, spend)));
  return { costCeiling: ceiling, inputTokens: tokens.inputTokens, outputTokens: tokens.outputTokens, latencyCeilingMs };
}
