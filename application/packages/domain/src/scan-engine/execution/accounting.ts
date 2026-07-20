/* =============================================================================
 * Usage + cost accounting (Sprint 7 §7 · AIS-001 §12 Cost Awareness · AIS-002 A05).
 *
 * Reconciles estimated vs actual token usage and cost, tracks stage/job spend
 * against the ceiling, and raises the soft warning. When a provider omits usage,
 * usage is marked estimated and cost falls back to the estimate. Pure — the
 * ceiling is absolute (never silently exceeded).
 * ========================================================================== */

import type { ExecutionUsage, ExecutionCostAccounting, TokenEstimate } from "@brightloop/schema";

export interface ProviderPricing {
  inputPerMTokens: number;
  outputPerMTokens: number;
}

/** Cost of a token count at the given per-million pricing. Deterministic. */
export function costOf(inputTokens: number, outputTokens: number, pricing: ProviderPricing): number {
  return (inputTokens / 1_000_000) * pricing.inputPerMTokens + (outputTokens / 1_000_000) * pricing.outputPerMTokens;
}

/**
 * Reconcile usage: when the provider reports BOTH token counts, record them as
 * actual (`estimated=false`); otherwise fall back to the estimate (`estimated=true`).
 */
export function buildUsage(estimate: TokenEstimate, reported: { inputTokens?: number; outputTokens?: number } | undefined): ExecutionUsage {
  const hasActual = reported !== undefined && reported.inputTokens !== undefined && reported.outputTokens !== undefined;
  return {
    estimatedInputTokens: estimate.inputTokens,
    estimatedOutputTokens: estimate.outputTokens,
    actualInputTokens: hasActual ? reported!.inputTokens! : null,
    actualOutputTokens: hasActual ? reported!.outputTokens! : null,
    estimated: !hasActual,
  };
}

export interface CostAccountingInput {
  usage: ExecutionUsage;
  pricing: ProviderPricing;
  priorJobSpend: number; // job spend before this execution
  costCeiling: number; // hard ceiling (the job cost ceiling)
  softWarningAt: number; // spend at/above which the soft warning fires
}

/**
 * Build the cost accounting for one execution. Stage spend uses the actual cost
 * when usage is real, else the estimate; job spend accumulates on prior spend;
 * remaining budget may go negative to expose an overrun (never hidden). Pure.
 */
export function buildCostAccounting(input: CostAccountingInput): ExecutionCostAccounting {
  const { usage, pricing } = input;
  const estimatedCost = costOf(usage.estimatedInputTokens, usage.estimatedOutputTokens, pricing);
  const actualCost = usage.estimated ? null : costOf(usage.actualInputTokens ?? 0, usage.actualOutputTokens ?? 0, pricing);
  const stageSpend = actualCost ?? estimatedCost;
  const jobSpend = input.priorJobSpend + stageSpend;
  return {
    estimatedCost,
    actualCost,
    stageSpend,
    jobSpend,
    remainingBudget: input.costCeiling - jobSpend,
    softWarning: jobSpend >= input.softWarningAt,
    hardCeiling: input.costCeiling,
  };
}

/** A projected spend breaches the hard ceiling (pre-flight stop). Pure. */
export function projectedExceedsCeiling(priorJobSpend: number, estimatedCost: number, costCeiling: number): boolean {
  return priorJobSpend + estimatedCost > costCeiling;
}

/** Actual accounting has overrun the hard ceiling. Pure. */
export function exceedsHardCeiling(accounting: ExecutionCostAccounting): boolean {
  return accounting.jobSpend > accounting.hardCeiling;
}
