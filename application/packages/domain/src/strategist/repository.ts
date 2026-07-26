/* =============================================================================
 * AI Strategist — REPOSITORY PORTS (Phase E · Sprint E3).
 *
 * Persistence contracts; Supabase adapters live in `@brightloop/data`. The session
 * is versioned (optimistic concurrency); analyses, findings, risks, recommendations,
 * priority scores, roadmaps, citations and feedback are append-only. RLS is the
 * tenant boundary. The Strategist consumes E1/E2 ONLY through their application
 * services, so no knowledge/AI ports appear here.
 * ========================================================================== */

import type {
  BusinessFinding, RiskAssessment, StrategyAnalysis, StrategyCitation, StrategyFeedback,
  StrategyPriorityScore, StrategyRecommendation, StrategySession, TransformationRoadmap,
} from "@brightloop/schema";
import type { RuntimeResult } from "../runtime/results.js";

export interface StrategySessionRepository {
  create(session: StrategySession): Promise<RuntimeResult<StrategySession>>;
  getById(id: string): Promise<RuntimeResult<StrategySession | null>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<StrategySession[]>>;
  save(next: StrategySession, expectedVersion: number): Promise<RuntimeResult<StrategySession>>;
}

export interface StrategyAnalysisRepository {
  append(analysis: StrategyAnalysis): Promise<RuntimeResult<StrategyAnalysis>>;
  getBySession(sessionId: string): Promise<RuntimeResult<StrategyAnalysis | null>>;
}

export interface BusinessFindingRepository {
  appendMany(findings: readonly BusinessFinding[]): Promise<RuntimeResult<BusinessFinding[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<BusinessFinding[]>>;
}

export interface RiskAssessmentRepository {
  appendMany(risks: readonly RiskAssessment[]): Promise<RuntimeResult<RiskAssessment[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<RiskAssessment[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<RiskAssessment[]>>;
}

export interface StrategyRecommendationRepository {
  appendMany(recommendations: readonly StrategyRecommendation[]): Promise<RuntimeResult<StrategyRecommendation[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<StrategyRecommendation[]>>;
}

export interface PriorityScoreRepository {
  appendMany(scores: readonly StrategyPriorityScore[]): Promise<RuntimeResult<StrategyPriorityScore[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<StrategyPriorityScore[]>>;
}

export interface TransformationRoadmapRepository {
  append(roadmap: TransformationRoadmap): Promise<RuntimeResult<TransformationRoadmap>>;
  getBySession(sessionId: string): Promise<RuntimeResult<TransformationRoadmap | null>>;
}

export interface StrategyCitationRepository {
  appendMany(citations: readonly StrategyCitation[]): Promise<RuntimeResult<StrategyCitation[]>>;
  listBySession(sessionId: string): Promise<RuntimeResult<StrategyCitation[]>>;
}

export interface StrategyFeedbackRepository {
  append(feedback: StrategyFeedback): Promise<RuntimeResult<StrategyFeedback>>;
  listBySession(sessionId: string): Promise<RuntimeResult<StrategyFeedback[]>>;
  listByWorkspace(workspaceId: string): Promise<RuntimeResult<StrategyFeedback[]>>;
}

/** The ports the Strategist application use-cases are wired with. */
export interface StrategistRepositories {
  sessions: StrategySessionRepository;
  analyses: StrategyAnalysisRepository;
  findings: BusinessFindingRepository;
  risks: RiskAssessmentRepository;
  recommendations: StrategyRecommendationRepository;
  priorityScores: PriorityScoreRepository;
  roadmaps: TransformationRoadmapRepository;
  citations: StrategyCitationRepository;
  feedback: StrategyFeedbackRepository;
}
