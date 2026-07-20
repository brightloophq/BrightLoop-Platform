/* =============================================================================
 * Recommendation events (Sprint 9 §13) — PURE constructors.
 *
 * Builders for the recommendation.* stream — record only, no transport, no
 * persistence. Each event carries the scan id, an optional recommendation id, a
 * supplied timestamp, and an optional structured detail.
 * ========================================================================== */

import { recommendationEventSchema, type RecommendationEvent, type RecommendationEventType } from "@brightloop/schema";

export function recommendationEvent(type: RecommendationEventType, scanId: string, now: string, recommendationId: string | null = null, detail: string | null = null): RecommendationEvent {
  return recommendationEventSchema.parse({ type, scanId, recommendationId, at: now, detail });
}

export const created = (scanId: string, id: string, now: string, detail?: string) => recommendationEvent("recommendation.created", scanId, now, id, detail ?? null);
export const scored = (scanId: string, id: string, now: string, detail?: string) => recommendationEvent("recommendation.scored", scanId, now, id, detail ?? null);
export const blocked = (scanId: string, id: string, now: string, detail?: string) => recommendationEvent("recommendation.blocked", scanId, now, id, detail ?? null);
export const rankChanged = (scanId: string, id: string, now: string, detail?: string) => recommendationEvent("recommendation.rank_changed", scanId, now, id, detail ?? null);
export const portfolioCreated = (scanId: string, now: string, detail?: string) => recommendationEvent("recommendation.portfolio_created", scanId, now, null, detail ?? null);
export const scenarioCreated = (scanId: string, now: string, detail?: string) => recommendationEvent("recommendation.scenario_created", scanId, now, null, detail ?? null);
export const reviewRequired = (scanId: string, id: string, now: string, detail?: string) => recommendationEvent("recommendation.review_required", scanId, now, id, detail ?? null);
export const decisionBriefCreated = (scanId: string, now: string, detail?: string) => recommendationEvent("recommendation.decision_brief_created", scanId, now, null, detail ?? null);
