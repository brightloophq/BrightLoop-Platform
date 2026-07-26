/* =============================================================================
 * Strategy session lifecycle + record builders (Phase E · Sprint E3) — PURE.
 *
 *   draft → analyzing → completed | failed ; completed | failed → archived
 * Findings / opportunities / risks / recommendations / citations are immutable
 * once produced. All builders are pure; the application persists them.
 * ========================================================================== */

import type {
  BusinessDimension, BusinessFinding, EffortLevel, FindingCategory, ImpactLevel, Likelihood,
  RiskAssessment, StrategyCitation, StrategyFeedback, StrategyFeedbackKind, StrategyPriorityScore,
  StrategyRecommendation, StrategyRiskSeverity, StrategySession, StrategySessionStatus,
} from "@brightloop/schema";
import type { PriorityFactors } from "./scoring.js";
import { calculatePriority } from "./scoring.js";

export const STRATEGY_TRANSITIONS: Record<StrategySessionStatus, readonly StrategySessionStatus[]> = {
  draft: ["analyzing", "archived"],
  analyzing: ["completed", "failed"],
  completed: ["archived"],
  failed: ["analyzing", "archived"],
  archived: [],
};
export function canTransitionStrategy(from: StrategySessionStatus, to: StrategySessionStatus): boolean {
  return STRATEGY_TRANSITIONS[from].includes(to);
}

export interface BuildSessionInput {
  id: string; workspaceId: string; clientId: string | null; title: string; goal: string;
  collectionIds?: readonly string[]; dimensions?: readonly BusinessDimension[];
  requestedByUserId: string; now: string;
}
export function buildSession(input: BuildSessionInput): StrategySession {
  return {
    id: input.id, workspaceId: input.workspaceId, clientId: input.clientId, title: input.title.slice(0, 300),
    status: "draft", goal: input.goal, collectionIds: [...(input.collectionIds ?? [])], dimensions: [...(input.dimensions ?? [])],
    requestedByUserId: input.requestedByUserId, promptId: null, promptVersion: null, provider: null, model: null,
    analysisDurationMs: 0, retrievalCount: 0, tokenTotal: 0, cost: 0, currency: "USD", confidence: 0,
    version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface BuildFindingInput {
  id: string; sessionId: string; workspaceId: string; clientId: string | null;
  dimension: BusinessDimension; category: FindingCategory; title: string; detail?: string;
  businessImpact?: ImpactLevel; confidence: number; evidenceCount?: number; now: string;
}
export function buildFinding(input: BuildFindingInput): BusinessFinding {
  return {
    id: input.id, sessionId: input.sessionId, workspaceId: input.workspaceId, clientId: input.clientId,
    dimension: input.dimension, category: input.category, title: input.title.slice(0, 300), detail: input.detail ?? "",
    businessImpact: input.businessImpact ?? "medium", confidence: input.confidence, evidenceCount: input.evidenceCount ?? 0, createdAt: input.now,
  };
}

export interface BuildRiskInput {
  id: string; sessionId: string; workspaceId: string; clientId: string | null; title: string;
  description?: string; severity: StrategyRiskSeverity; likelihood: Likelihood; mitigation?: string; confidence: number; now: string;
}
export function buildRisk(input: BuildRiskInput): RiskAssessment {
  return {
    id: input.id, sessionId: input.sessionId, workspaceId: input.workspaceId, clientId: input.clientId,
    title: input.title.slice(0, 300), description: input.description ?? "", severity: input.severity,
    likelihood: input.likelihood, mitigation: input.mitigation ?? "", confidence: input.confidence, createdAt: input.now,
  };
}

export interface BuildRecommendationInput {
  id: string; sessionId: string; workspaceId: string; clientId: string | null; title: string;
  description?: string; reasoning?: string; priority: number; effort?: EffortLevel; expectedImpact?: ImpactLevel;
  dependencies?: readonly string[]; confidence: number; recommendedOwner?: string | null; estimatedTimeline?: string | null; order: number; now: string;
}
export function buildRecommendation(input: BuildRecommendationInput): StrategyRecommendation {
  return {
    id: input.id, sessionId: input.sessionId, workspaceId: input.workspaceId, clientId: input.clientId,
    title: input.title.slice(0, 300), description: input.description ?? "", reasoning: input.reasoning ?? "",
    priority: input.priority, effort: input.effort ?? "medium", expectedImpact: input.expectedImpact ?? "medium",
    dependencies: [...(input.dependencies ?? [])], confidence: input.confidence, recommendedOwner: input.recommendedOwner ?? null,
    estimatedTimeline: input.estimatedTimeline ?? null, order: input.order, createdAt: input.now,
  };
}

export function buildPriorityScore(id: string, recommendationId: string, sessionId: string, workspaceId: string, clientId: string | null, factors: PriorityFactors, now: string): StrategyPriorityScore {
  return {
    id, recommendationId, sessionId, workspaceId, clientId,
    businessImpact: Math.round(factors.businessImpact), implementationEffort: Math.round(factors.implementationEffort),
    urgency: Math.round(factors.urgency), riskReduction: Math.round(factors.riskReduction), customerValue: Math.round(factors.customerValue),
    strategicAlignment: Math.round(factors.strategicAlignment), automationPotential: Math.round(factors.automationPotential),
    total: calculatePriority(factors), createdAt: now,
  };
}

export interface BuildCitationInput {
  id: string; sessionId: string; workspaceId: string; clientId: string | null;
  findingId?: string | null; recommendationId?: string | null;
  documentId: string; collectionId: string; chunkId: string; page?: number | null; heading?: string | null; similarity: number; now: string;
}
export function buildStrategyCitation(input: BuildCitationInput): StrategyCitation {
  return {
    id: input.id, sessionId: input.sessionId, workspaceId: input.workspaceId, clientId: input.clientId,
    findingId: input.findingId ?? null, recommendationId: input.recommendationId ?? null, documentId: input.documentId,
    collectionId: input.collectionId, chunkId: input.chunkId, page: input.page ?? null, heading: input.heading ?? null,
    similarity: input.similarity, createdAt: input.now,
  };
}

export function buildFeedback(id: string, sessionId: string, workspaceId: string, clientId: string | null, kind: StrategyFeedbackKind, rating: number | null, comment: string | null, subjectUserId: string, now: string): StrategyFeedback {
  return { id, sessionId, workspaceId, clientId, kind, rating, comment, subjectUserId, createdAt: now };
}
