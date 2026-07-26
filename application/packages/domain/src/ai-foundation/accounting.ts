/* =============================================================================
 * Token + cost accounting (Phase E · Sprint E1) — PURE.
 *
 * A deterministic token heuristic (≈4 chars/token) drives estimates and the mock
 * provider; real providers report exact usage which overrides the estimate. Cost
 * is derived from the model registry's per-1M-token pricing. Deterministic; no io.
 * ========================================================================== */

import type { AiModelDescriptor } from "@brightloop/schema";
import type { AiUsage } from "./provider.js";

/** Deterministic token estimate for a string (~4 chars/token, min 1 for non-empty). */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/** Total tokens for a usage bundle. Cached tokens are a subset of prompt tokens. */
export function totalTokens(usage: AiUsage): number {
  return usage.promptTokens + usage.completionTokens;
}

export interface CostBreakdown {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  currency: string;
}

/** Round to 6 decimal places (micro-dollar precision) to keep sums stable. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * Cost for a usage against a model descriptor. Cached prompt tokens bill at the
 * cached rate; the rest of the prompt at the input rate; completion at the output
 * rate. All prices are per 1,000,000 tokens. Pure.
 */
export function calculateCost(usage: AiUsage, model: AiModelDescriptor): CostBreakdown {
  const cached = Math.min(usage.cachedTokens, usage.promptTokens);
  const uncachedPrompt = usage.promptTokens - cached;
  const inputCost = round6((uncachedPrompt * model.inputPricePerMTok + cached * model.cachedInputPricePerMTok) / 1_000_000);
  const outputCost = round6((usage.completionTokens * model.outputPricePerMTok) / 1_000_000);
  return { inputCost, outputCost, totalCost: round6(inputCost + outputCost), currency: model.currency };
}

/** Sum a list of {totalTokens} / {totalCost} for daily/monthly aggregation. Pure. */
export function sumBy<T>(rows: readonly T[], pick: (row: T) => number): number {
  return round6(rows.reduce((sum, r) => sum + pick(r), 0));
}

/** Group rows into `YYYY-MM-DD` (day) or `YYYY-MM` (month) buckets by an ISO `at`. */
export function bucketByPeriod<T>(rows: readonly T[], at: (row: T) => string, granularity: "day" | "month"): Map<string, T[]> {
  const width = granularity === "day" ? 10 : 7;
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = at(row).slice(0, width);
    const list = out.get(key);
    if (list === undefined) out.set(key, [row]);
    else list.push(row);
  }
  return out;
}
