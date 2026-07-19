/* =============================================================================
 * AI Orchestration · provider ROUTER (PDF 27 §06) — SKELETON.
 *
 * The engine treats AI providers as interchangeable resources behind ONE internal
 * interface. No vendor is hardcoded anywhere. A router selects a provider per
 * task on six criteria, with an ordered fallback set. Sprint 1 ships the port +
 * pure fallback ordering — no SDK, no API call, no vendor name in the domain.
 * ========================================================================== */

import type { AiOrchestrator, OrchestrationRequest, OrchestrationResult } from "./providers.js";

/** Live signals the router weighs when choosing a provider for a task. */
export interface ProviderCandidate {
  /** Opaque registry key — NEVER a hardcoded vendor branch in domain code. */
  id: string;
  healthy: boolean;
  rateLimitHeadroom: number; // 0..1
  costPerMTokens: number;
  maxContextTokens: number;
  reasoningQuality: number; // 0..1 (operator/calibration supplied)
  typicalLatencyMs: number;
}

export interface RoutingCriteria {
  task: string;
  minContextTokens: number;
  budgetPerMTokens: number; // ceiling
  needsDeepReasoning: boolean;
  maxLatencyMs: number;
}

/**
 * Pure, deterministic candidate ordering (PDF 27 §06). Filters out unhealthy /
 * out-of-budget / too-small-context / too-slow candidates, then ranks the rest
 * by reasoning quality (desc), then cost (asc), then latency (asc), then id — a
 * total, stable order. Returns the ordered FALLBACK set (first = primary choice).
 */
export function orderProviders(candidates: ProviderCandidate[], criteria: RoutingCriteria): ProviderCandidate[] {
  return candidates
    .filter(
      (c) =>
        c.healthy &&
        c.rateLimitHeadroom > 0 &&
        c.costPerMTokens <= criteria.budgetPerMTokens &&
        c.maxContextTokens >= criteria.minContextTokens &&
        c.typicalLatencyMs <= criteria.maxLatencyMs,
    )
    .sort((a, b) => {
      if (criteria.needsDeepReasoning && b.reasoningQuality !== a.reasoningQuality) return b.reasoningQuality - a.reasoningQuality;
      if (a.costPerMTokens !== b.costPerMTokens) return a.costPerMTokens - b.costPerMTokens;
      if (a.typicalLatencyMs !== b.typicalLatencyMs) return a.typicalLatencyMs - b.typicalLatencyMs;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/**
 * The single AI seam the engine calls. An adapter resolves the ordered
 * candidates to concrete `AiOrchestrator`s and fails over through them; the
 * domain never names a vendor. Implementation is deferred.
 */
export interface AiProviderRouter {
  route(criteria: RoutingCriteria): Promise<AiOrchestrator>;
  /** Convenience: route, then run, with fallback through the ordered set. */
  run<T>(criteria: RoutingCriteria, request: OrchestrationRequest<T>): Promise<OrchestrationResult<T>>;
}
