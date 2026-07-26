/* =============================================================================
 * AI Strategist — row ↔ domain mappers (Phase E · Sprint E3). The type-safe
 * boundary; jsonb columns (dimensions, clarifications, dependencies, phases)
 * collapse defensively.
 * ========================================================================== */

import type {
  BusinessFinding, RiskAssessment, StrategyAnalysis, StrategyCitation, StrategyFeedback,
  StrategyPriorityScore, StrategyRecommendation, StrategySession, TransformationRoadmap,
} from "@brightloop/schema";

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const int = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const nstr = (v: unknown): string | null => (v as string | null) ?? null;
const nint = (v: unknown): number | null => (v === null || v === undefined ? null : int(v));

export function sessionRow(s: StrategySession): Record<string, unknown> {
  return { id: s.id, workspace_id: s.workspaceId, client_id: s.clientId, title: s.title, status: s.status, goal: s.goal, collection_ids: s.collectionIds, dimensions: s.dimensions, requested_by_user_id: s.requestedByUserId, prompt_id: s.promptId, prompt_version: s.promptVersion, provider: s.provider, model: s.model, analysis_duration_ms: s.analysisDurationMs, retrieval_count: s.retrievalCount, token_total: s.tokenTotal, cost: s.cost, currency: s.currency, confidence: s.confidence, version: s.version, created_at: s.createdAt, updated_at: s.updatedAt };
}
export function toSession(r: Record<string, unknown>): StrategySession {
  return { id: String(r["id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), status: r["status"] as StrategySession["status"], goal: String(r["goal"] ?? ""), collectionIds: strArr(r["collection_ids"]), dimensions: strArr(r["dimensions"]) as StrategySession["dimensions"], requestedByUserId: String(r["requested_by_user_id"]), promptId: nstr(r["prompt_id"]), promptVersion: nint(r["prompt_version"]), provider: nstr(r["provider"]), model: nstr(r["model"]), analysisDurationMs: int(r["analysis_duration_ms"]), retrievalCount: int(r["retrieval_count"]), tokenTotal: int(r["token_total"]), cost: num(r["cost"]), currency: String(r["currency"] ?? "USD"), confidence: int(r["confidence"]), version: int(r["version"], 1), createdAt: String(r["created_at"]), updatedAt: String(r["updated_at"]) };
}

export function analysisRow(a: StrategyAnalysis): Record<string, unknown> {
  return { id: a.id, session_id: a.sessionId, workspace_id: a.workspaceId, client_id: a.clientId, executive_summary: a.executiveSummary, current_state: a.currentState, expected_impact: a.expectedImpact, confidence: a.confidence, confidence_reason: a.confidenceReason, missing_information: a.missingInformation, clarifications: a.clarifications, provider: a.provider, model: a.model, prompt_version: a.promptVersion, tokens_used: a.tokensUsed, retrieval_latency_ms: a.retrievalLatencyMs, ai_duration_ms: a.aiDurationMs, created_at: a.createdAt };
}
export function toAnalysis(r: Record<string, unknown>): StrategyAnalysis {
  const clar = Array.isArray(r["clarifications"]) ? (r["clarifications"] as unknown[]).map((c) => { const o = (c ?? {}) as Record<string, unknown>; return { question: String(o["question"] ?? ""), dimension: (o["dimension"] as StrategyAnalysis["clarifications"][number]["dimension"]) ?? null }; }) : [];
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), executiveSummary: String(r["executive_summary"] ?? ""), currentState: String(r["current_state"] ?? ""), expectedImpact: String(r["expected_impact"] ?? ""), confidence: int(r["confidence"]), confidenceReason: String(r["confidence_reason"] ?? ""), missingInformation: strArr(r["missing_information"]), clarifications: clar, provider: nstr(r["provider"]), model: nstr(r["model"]), promptVersion: nint(r["prompt_version"]), tokensUsed: int(r["tokens_used"]), retrievalLatencyMs: int(r["retrieval_latency_ms"]), aiDurationMs: int(r["ai_duration_ms"]), createdAt: String(r["created_at"]) };
}

export function findingRow(f: BusinessFinding): Record<string, unknown> {
  return { id: f.id, session_id: f.sessionId, workspace_id: f.workspaceId, client_id: f.clientId, dimension: f.dimension, category: f.category, title: f.title, detail: f.detail, business_impact: f.businessImpact, confidence: f.confidence, evidence_count: f.evidenceCount, created_at: f.createdAt };
}
export function toFinding(r: Record<string, unknown>): BusinessFinding {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), dimension: r["dimension"] as BusinessFinding["dimension"], category: r["category"] as BusinessFinding["category"], title: String(r["title"]), detail: String(r["detail"] ?? ""), businessImpact: r["business_impact"] as BusinessFinding["businessImpact"], confidence: int(r["confidence"]), evidenceCount: int(r["evidence_count"]), createdAt: String(r["created_at"]) };
}

export function riskRow(x: RiskAssessment): Record<string, unknown> {
  return { id: x.id, session_id: x.sessionId, workspace_id: x.workspaceId, client_id: x.clientId, title: x.title, description: x.description, severity: x.severity, likelihood: x.likelihood, mitigation: x.mitigation, confidence: x.confidence, created_at: x.createdAt };
}
export function toRisk(r: Record<string, unknown>): RiskAssessment {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), description: String(r["description"] ?? ""), severity: r["severity"] as RiskAssessment["severity"], likelihood: r["likelihood"] as RiskAssessment["likelihood"], mitigation: String(r["mitigation"] ?? ""), confidence: int(r["confidence"]), createdAt: String(r["created_at"]) };
}

export function recommendationRow(x: StrategyRecommendation): Record<string, unknown> {
  return { id: x.id, session_id: x.sessionId, workspace_id: x.workspaceId, client_id: x.clientId, title: x.title, description: x.description, reasoning: x.reasoning, priority: x.priority, effort: x.effort, expected_impact: x.expectedImpact, dependencies: x.dependencies, confidence: x.confidence, recommended_owner: x.recommendedOwner, estimated_timeline: x.estimatedTimeline, order_index: x.order, created_at: x.createdAt };
}
export function toRecommendation(r: Record<string, unknown>): StrategyRecommendation {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), title: String(r["title"]), description: String(r["description"] ?? ""), reasoning: String(r["reasoning"] ?? ""), priority: int(r["priority"]), effort: r["effort"] as StrategyRecommendation["effort"], expectedImpact: r["expected_impact"] as StrategyRecommendation["expectedImpact"], dependencies: strArr(r["dependencies"]), confidence: int(r["confidence"]), recommendedOwner: nstr(r["recommended_owner"]), estimatedTimeline: nstr(r["estimated_timeline"]), order: int(r["order_index"]), createdAt: String(r["created_at"]) };
}

export function priorityRow(p: StrategyPriorityScore): Record<string, unknown> {
  return { id: p.id, recommendation_id: p.recommendationId, session_id: p.sessionId, workspace_id: p.workspaceId, client_id: p.clientId, business_impact: p.businessImpact, implementation_effort: p.implementationEffort, urgency: p.urgency, risk_reduction: p.riskReduction, customer_value: p.customerValue, strategic_alignment: p.strategicAlignment, automation_potential: p.automationPotential, total: p.total, created_at: p.createdAt };
}
export function toPriority(r: Record<string, unknown>): StrategyPriorityScore {
  return { id: String(r["id"]), recommendationId: String(r["recommendation_id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), businessImpact: int(r["business_impact"]), implementationEffort: int(r["implementation_effort"]), urgency: int(r["urgency"]), riskReduction: int(r["risk_reduction"]), customerValue: int(r["customer_value"]), strategicAlignment: int(r["strategic_alignment"]), automationPotential: int(r["automation_potential"]), total: int(r["total"]), createdAt: String(r["created_at"]) };
}

export function roadmapRow(x: TransformationRoadmap): Record<string, unknown> {
  return { id: x.id, session_id: x.sessionId, workspace_id: x.workspaceId, client_id: x.clientId, phases: x.phases, created_at: x.createdAt };
}
export function toRoadmap(r: Record<string, unknown>): TransformationRoadmap {
  const phases = Array.isArray(r["phases"]) ? (r["phases"] as TransformationRoadmap["phases"]) : [];
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), phases, createdAt: String(r["created_at"]) };
}

export function citationRow(c: StrategyCitation): Record<string, unknown> {
  return { id: c.id, session_id: c.sessionId, workspace_id: c.workspaceId, client_id: c.clientId, finding_id: c.findingId, recommendation_id: c.recommendationId, document_id: c.documentId, collection_id: c.collectionId, chunk_id: c.chunkId, page: c.page, heading: c.heading, similarity: c.similarity, created_at: c.createdAt };
}
export function toCitation(r: Record<string, unknown>): StrategyCitation {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), findingId: nstr(r["finding_id"]), recommendationId: nstr(r["recommendation_id"]), documentId: String(r["document_id"]), collectionId: String(r["collection_id"]), chunkId: String(r["chunk_id"]), page: nint(r["page"]), heading: nstr(r["heading"]), similarity: num(r["similarity"]), createdAt: String(r["created_at"]) };
}

export function feedbackRow(f: StrategyFeedback): Record<string, unknown> {
  return { id: f.id, session_id: f.sessionId, workspace_id: f.workspaceId, client_id: f.clientId, kind: f.kind, rating: f.rating, comment: f.comment, subject_user_id: f.subjectUserId, created_at: f.createdAt };
}
export function toFeedback(r: Record<string, unknown>): StrategyFeedback {
  return { id: String(r["id"]), sessionId: String(r["session_id"]), workspaceId: String(r["workspace_id"]), clientId: nstr(r["client_id"]), kind: r["kind"] as StrategyFeedback["kind"], rating: nint(r["rating"]), comment: nstr(r["comment"]), subjectUserId: String(r["subject_user_id"]), createdAt: String(r["created_at"]) };
}
