/* =============================================================================
 * AI Strategist read models (Phase E · Sprint E3).
 *
 * Read-only projections: strategy dashboard, the full structured result, the
 * recommendation list, roadmap view, business findings, risk register, strategy
 * history, and feedback summary. Load-then-authorize; DTOs only; structured output.
 * ========================================================================== */

import { authorize, requireStrategist, STRATEGY_READ_CAP, type AppContext } from "../context.js";
import { NotFoundError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import {
  toAnalysisDTO, toFeedbackDTO, toFindingDTO, toPriorityScoreDTO, toRecommendationDTO, toRiskDTO, toSessionDTO, toStrategyCitationDTO,
  type FeedbackDTO, type FindingDTO, type RecommendationDTO, type RiskDTO, type SessionDTO, type StrategyDashboardDTO,
  type StrategyResultDTO, type TransformationRoadmapPhasesDTO,
} from "./dto.js";

async function loadSession(ctx: AppContext, sessionId: string) {
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_READ_CAP, session.clientId);
  return { st, session };
}

/** Workspace strategy history (newest first). */
export async function listStrategyHistory(ctx: AppContext, rawWorkspaceId: unknown): Promise<SessionDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const st = requireStrategist(ctx);
  authorize(ctx.actor, STRATEGY_READ_CAP, ctx.actor.clientId);
  const rows = unwrap(await st.sessions.listByWorkspace(workspaceId));
  return [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toSessionDTO);
}

/** Dashboard: session + analysis + counts. */
export async function getStrategyDashboard(ctx: AppContext, rawSessionId: unknown): Promise<StrategyDashboardDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st, session } = await loadSession(ctx, sessionId);
  const [analysis, findings, recommendations, risks, roadmap] = await Promise.all([
    st.analyses.getBySession(sessionId).then(unwrap),
    st.findings.listBySession(sessionId).then(unwrap),
    st.recommendations.listBySession(sessionId).then(unwrap),
    st.risks.listBySession(sessionId).then(unwrap),
    st.roadmaps.getBySession(sessionId).then(unwrap),
  ]);
  return { session: toSessionDTO(session), analysis: analysis ? toAnalysisDTO(analysis) : null, findingCount: findings.length, recommendationCount: recommendations.length, riskCount: risks.length, hasRoadmap: roadmap !== null };
}

/** The complete STRUCTURED strategy result (never free-form). */
export async function getStrategyResult(ctx: AppContext, rawSessionId: unknown): Promise<StrategyResultDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st, session } = await loadSession(ctx, sessionId);
  const [analysis, findings, risks, recommendations, priorityScores, roadmap, citations] = await Promise.all([
    st.analyses.getBySession(sessionId).then(unwrap),
    st.findings.listBySession(sessionId).then(unwrap),
    st.risks.listBySession(sessionId).then(unwrap),
    st.recommendations.listBySession(sessionId).then(unwrap),
    st.priorityScores.listBySession(sessionId).then(unwrap),
    st.roadmaps.getBySession(sessionId).then(unwrap),
    st.citations.listBySession(sessionId).then(unwrap),
  ]);
  const cat = (c: string): FindingDTO[] => findings.filter((f) => f.category === c).map(toFindingDTO);
  return {
    session: toSessionDTO(session),
    executiveSummary: analysis?.executiveSummary ?? "",
    currentState: analysis?.currentState ?? "",
    strengths: [...cat("strength"), ...cat("advantage")],
    weaknesses: [...cat("weakness"), ...cat("bottleneck")],
    opportunities: cat("opportunity"),
    risks: [...risks].sort((a, b) => a.title.localeCompare(b.title)).map(toRiskDTO),
    recommendations: [...recommendations].sort((a, b) => b.priority - a.priority).map(toRecommendationDTO),
    priorityMatrix: [...priorityScores].sort((a, b) => b.total - a.total).map(toPriorityScoreDTO),
    roadmap: (roadmap?.phases ?? []) as TransformationRoadmapPhasesDTO,
    expectedImpact: analysis?.expectedImpact ?? "",
    confidence: session.confidence,
    citations: citations.map(toStrategyCitationDTO),
  };
}

export async function listRecommendations(ctx: AppContext, rawSessionId: unknown): Promise<RecommendationDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st } = await loadSession(ctx, sessionId);
  return unwrap(await st.recommendations.listBySession(sessionId)).sort((a, b) => b.priority - a.priority).map(toRecommendationDTO);
}

export async function getRoadmapView(ctx: AppContext, rawSessionId: unknown): Promise<TransformationRoadmapPhasesDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st } = await loadSession(ctx, sessionId);
  const roadmap = unwrap(await st.roadmaps.getBySession(sessionId));
  return (roadmap?.phases ?? []) as TransformationRoadmapPhasesDTO;
}

export async function listFindings(ctx: AppContext, rawSessionId: unknown): Promise<FindingDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st } = await loadSession(ctx, sessionId);
  return unwrap(await st.findings.listBySession(sessionId)).map(toFindingDTO);
}

/** Risk register for a workspace (all sessions), most severe first. */
export async function getRiskRegister(ctx: AppContext, rawWorkspaceId: unknown): Promise<RiskDTO[]> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const st = requireStrategist(ctx);
  authorize(ctx.actor, STRATEGY_READ_CAP, ctx.actor.clientId);
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return unwrap(await st.risks.listByWorkspace(workspaceId)).sort((a, b) => (order[a.severity] ?? 4) - (order[b.severity] ?? 4)).map(toRiskDTO);
}

export interface FeedbackSummaryDTO { total: number; approvals: number; rejections: number; comments: number; averageRating: number | null; items: FeedbackDTO[]; }

export async function getFeedbackSummary(ctx: AppContext, rawSessionId: unknown): Promise<FeedbackSummaryDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const { st } = await loadSession(ctx, sessionId);
  const rows = unwrap(await st.feedback.listBySession(sessionId));
  const ratings = rows.map((r) => r.rating).filter((r): r is number => r !== null);
  return {
    total: rows.length,
    approvals: rows.filter((r) => r.kind === "approval").length,
    rejections: rows.filter((r) => r.kind === "rejection").length,
    comments: rows.filter((r) => r.kind === "comment").length,
    averageRating: ratings.length === 0 ? null : Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 100) / 100,
    items: [...rows].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(toFeedbackDTO),
  };
}
