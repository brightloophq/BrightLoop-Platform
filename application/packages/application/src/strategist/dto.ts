/* =============================================================================
 * AI Strategist DTOs (Phase E · Sprint E3) — the outward boundary.
 * ========================================================================== */

import type {
  BusinessFinding, RiskAssessment, StrategyAnalysis, StrategyCitation, StrategyFeedback,
  StrategyPriorityScore, StrategyRecommendation, StrategySession, TransformationRoadmap,
} from "@brightloop/schema";

export interface SessionDTO {
  id: string; title: string; status: StrategySession["status"]; goal: string; dimensions: string[];
  collectionIds: string[]; confidence: number; retrievalCount: number; tokenTotal: number; cost: number;
  currency: string; analysisDurationMs: number; provider: string | null; model: string | null; version: number; createdAt: string; updatedAt: string;
}
export const toSessionDTO = (s: StrategySession): SessionDTO => ({ id: s.id, title: s.title, status: s.status, goal: s.goal, dimensions: s.dimensions, collectionIds: s.collectionIds, confidence: s.confidence, retrievalCount: s.retrievalCount, tokenTotal: s.tokenTotal, cost: s.cost, currency: s.currency, analysisDurationMs: s.analysisDurationMs, provider: s.provider, model: s.model, version: s.version, createdAt: s.createdAt, updatedAt: s.updatedAt });

export interface ClarificationDTO { question: string; dimension: string | null; }

export interface AnalysisDTO {
  id: string; sessionId: string; executiveSummary: string; currentState: string; expectedImpact: string;
  confidence: number; confidenceReason: string; missingInformation: string[]; clarifications: ClarificationDTO[];
  provider: string | null; model: string | null; tokensUsed: number; retrievalLatencyMs: number; aiDurationMs: number; createdAt: string;
}
export const toAnalysisDTO = (a: StrategyAnalysis): AnalysisDTO => ({ id: a.id, sessionId: a.sessionId, executiveSummary: a.executiveSummary, currentState: a.currentState, expectedImpact: a.expectedImpact, confidence: a.confidence, confidenceReason: a.confidenceReason, missingInformation: a.missingInformation, clarifications: a.clarifications.map((c) => ({ question: c.question, dimension: c.dimension })), provider: a.provider, model: a.model, tokensUsed: a.tokensUsed, retrievalLatencyMs: a.retrievalLatencyMs, aiDurationMs: a.aiDurationMs, createdAt: a.createdAt });

export interface FindingDTO { id: string; dimension: BusinessFinding["dimension"]; category: BusinessFinding["category"]; title: string; detail: string; businessImpact: BusinessFinding["businessImpact"]; confidence: number; evidenceCount: number; }
export const toFindingDTO = (f: BusinessFinding): FindingDTO => ({ id: f.id, dimension: f.dimension, category: f.category, title: f.title, detail: f.detail, businessImpact: f.businessImpact, confidence: f.confidence, evidenceCount: f.evidenceCount });

export interface RiskDTO { id: string; title: string; description: string; severity: RiskAssessment["severity"]; likelihood: RiskAssessment["likelihood"]; mitigation: string; confidence: number; }
export const toRiskDTO = (r: RiskAssessment): RiskDTO => ({ id: r.id, title: r.title, description: r.description, severity: r.severity, likelihood: r.likelihood, mitigation: r.mitigation, confidence: r.confidence });

export interface RecommendationDTO {
  id: string; title: string; description: string; reasoning: string; priority: number; effort: StrategyRecommendation["effort"];
  expectedImpact: StrategyRecommendation["expectedImpact"]; dependencies: string[]; confidence: number;
  recommendedOwner: string | null; estimatedTimeline: string | null; order: number;
}
export const toRecommendationDTO = (r: StrategyRecommendation): RecommendationDTO => ({ id: r.id, title: r.title, description: r.description, reasoning: r.reasoning, priority: r.priority, effort: r.effort, expectedImpact: r.expectedImpact, dependencies: r.dependencies, confidence: r.confidence, recommendedOwner: r.recommendedOwner, estimatedTimeline: r.estimatedTimeline, order: r.order });

export interface PriorityScoreDTO {
  recommendationId: string; businessImpact: number; implementationEffort: number; urgency: number;
  riskReduction: number; customerValue: number; strategicAlignment: number; automationPotential: number; total: number;
}
export const toPriorityScoreDTO = (p: StrategyPriorityScore): PriorityScoreDTO => ({ recommendationId: p.recommendationId, businessImpact: p.businessImpact, implementationEffort: p.implementationEffort, urgency: p.urgency, riskReduction: p.riskReduction, customerValue: p.customerValue, strategicAlignment: p.strategicAlignment, automationPotential: p.automationPotential, total: p.total });

export type TransformationRoadmapPhasesDTO = TransformationRoadmap["phases"];
export interface RoadmapDTO { id: string; sessionId: string; phases: TransformationRoadmap["phases"]; }
export const toRoadmapDTO = (r: TransformationRoadmap): RoadmapDTO => ({ id: r.id, sessionId: r.sessionId, phases: r.phases });

export interface StrategyCitationResultDTO { id: string; findingId: string | null; recommendationId: string | null; documentId: string; collectionId: string; chunkId: string; page: number | null; heading: string | null; similarity: number; }
export const toStrategyCitationDTO = (c: StrategyCitation): StrategyCitationResultDTO => ({ id: c.id, findingId: c.findingId, recommendationId: c.recommendationId, documentId: c.documentId, collectionId: c.collectionId, chunkId: c.chunkId, page: c.page, heading: c.heading, similarity: c.similarity });

export interface FeedbackDTO { id: string; kind: StrategyFeedback["kind"]; rating: number | null; comment: string | null; subjectUserId: string; createdAt: string; }
export const toFeedbackDTO = (f: StrategyFeedback): FeedbackDTO => ({ id: f.id, kind: f.kind, rating: f.rating, comment: f.comment, subjectUserId: f.subjectUserId, createdAt: f.createdAt });

/** The complete structured strategy result — never free-form. */
export interface StrategyResultDTO {
  session: SessionDTO;
  executiveSummary: string;
  currentState: string;
  strengths: FindingDTO[];
  weaknesses: FindingDTO[];
  opportunities: FindingDTO[];
  risks: RiskDTO[];
  recommendations: RecommendationDTO[];
  priorityMatrix: PriorityScoreDTO[];
  roadmap: TransformationRoadmap["phases"];
  expectedImpact: string;
  confidence: number;
  citations: StrategyCitationResultDTO[];
}

export interface ValidationResultDTO { ok: boolean; issues: string[]; }
export interface ContextChunkRef { chunkId: string; documentId: string; collectionId: string; page: number | null; heading: string | null; score: number; content: string; }
export interface StrategyContextDTO {
  chunks: ContextChunkRef[];
  retrievalSessionId: string;
  retrievalLatencyMs: number;
  provider: string; model: string; totalTokens: number;
  workspaceMetadata: { workspaceId: string; collectionIds: string[] };
  recentConversations: { id: string; title: string }[];
}

export interface StrategyDashboardDTO { session: SessionDTO; analysis: AnalysisDTO | null; findingCount: number; recommendationCount: number; riskCount: number; hasRoadmap: boolean; }
