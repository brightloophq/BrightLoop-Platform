/* =============================================================================
 * Cost model (PDF 27 §15) — PURE.
 *
 * Estimates request cost from token estimates + provider cost metadata, and
 * evaluates it against the per-stage / per-job / hard-ceiling / soft-warning
 * budget. No real token counter — the caller supplies token estimates. Pure +
 * deterministic; no I/O.
 * ========================================================================== */

import type { ProviderDescriptor, TokenEstimate, Budget } from "@brightloop/schema";

/** Estimated request cost = input + output priced per million tokens. Deterministic. */
export function estimateCost(descriptor: Pick<ProviderDescriptor, "cost">, tokens: TokenEstimate): number {
  const input = (tokens.inputTokens / 1_000_000) * descriptor.cost.inputPerMTokens;
  const output = (tokens.outputTokens / 1_000_000) * descriptor.cost.outputPerMTokens;
  return input + output;
}

export interface BudgetEvaluation {
  estimatedCost: number;
  projectedJobSpend: number; // spentSoFar + estimatedCost
  withinStage: boolean; // estimatedCost <= perStage
  withinJob: boolean; // projected <= perJob
  withinHardCeiling: boolean; // projected <= hardCeiling
  softWarning: boolean; // projected >= softWarning (still allowed)
  /** Overall allow decision: within stage, job, AND hard ceiling. Soft warning does not block. */
  allowed: boolean;
}

/**
 * Evaluate a cost against a budget. The hard ceiling is absolute (never
 * exceeded); the soft-warning threshold flags an at-risk spend but still allows
 * it. Pure + deterministic.
 */
export function evaluateBudget(estimatedCost: number, spentSoFar: number, budget: Budget): BudgetEvaluation {
  const projectedJobSpend = spentSoFar + estimatedCost;
  const withinStage = estimatedCost <= budget.perStage;
  const withinJob = projectedJobSpend <= budget.perJob;
  const withinHardCeiling = projectedJobSpend <= budget.hardCeiling;
  return {
    estimatedCost,
    projectedJobSpend,
    withinStage,
    withinJob,
    withinHardCeiling,
    softWarning: projectedJobSpend >= budget.softWarning,
    allowed: withinStage && withinJob && withinHardCeiling,
  };
}
