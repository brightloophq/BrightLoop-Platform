/* =============================================================================
 * AI Strategist use-cases (Phase E · Sprint E3).
 *
 * The multi-pass reasoning pipeline and the strategy application services. The
 * Strategist consumes E1 (Prompt/Execution) and E2 (Knowledge) ONLY through their
 * public application services (executePrompt, retrieveContext via the Context
 * Assembler). Prompts are never hardcoded; vectors are never queried directly.
 *
 *   Pass 1 info gathering (context) → Pass 2 business reasoning (findings/analysis)
 *   → Pass 3 recommendations → Pass 4 roadmap → Pass 5 validation.
 * ========================================================================== */

import {
  buildFeedback, buildFinding, buildPriorityScore, buildRecommendation, buildRisk, buildRoadmap, buildSession,
  buildStrategyCitation, calculateConfidence, calculatePriority, canTransitionStrategy, CONFIDENCE_THRESHOLD,
  generateClarifications, levelToScore, validateStrategy as domainValidate,
  type PriorityFactors,
} from "@brightloop/domain";
import type {
  BusinessDimension, BusinessFinding, EffortLevel, FindingCategory, ImpactLevel, StrategyCitation,
  StrategyFeedbackKind, StrategyPriorityScore, StrategyRecommendation,
} from "@brightloop/schema";
import { executePrompt } from "../ai-foundation/execution-engine.js";
import {
  authorize, requireStrategist, STRATEGY_FEEDBACK_CAP, STRATEGY_READ_CAP, STRATEGY_REVIEW_CAP, STRATEGY_RUN_CAP, STRATEGY_WRITE_CAP,
  type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId, requireString } from "../validate.js";
import { assembleStrategyContext } from "./context-assembler.js";
import {
  toAnalysisDTO, toFeedbackDTO, toPriorityScoreDTO, toRecommendationDTO, toRoadmapDTO, toSessionDTO, toStrategyCitationDTO,
  type AnalysisDTO, type StrategyCitationResultDTO, type ClarificationDTO, type FeedbackDTO, type PriorityScoreDTO, type RecommendationDTO,
  type RoadmapDTO, type SessionDTO, type ValidationResultDTO,
} from "./dto.js";

const snippet = (s: string, n = 160): string => (s.length <= n ? s : `${s.slice(0, n).trim()}…`);
const impactFromScore = (score: number): ImpactLevel => (score >= 0.7 ? "high" : score >= 0.4 ? "medium" : "low");
const CATEGORIES: FindingCategory[] = ["strength", "weakness", "opportunity"];

/* ---- session --------------------------------------------------------------- */

export interface CreateSessionInput { title: string; goal: string; collectionIds?: string[]; dimensions?: BusinessDimension[]; }

export async function createStrategySession(ctx: AppContext, rawWorkspaceId: unknown, input: CreateSessionInput): Promise<SessionDTO> {
  const workspaceId = requireId(rawWorkspaceId, "workspaceId");
  const title = requireString(input.title, "title").trim();
  const goal = requireString(input.goal, "goal").trim();
  if (title === "" || goal === "") throw new ValidationError("A strategy title and goal are required");
  const st = requireStrategist(ctx);
  authorize(ctx.actor, STRATEGY_WRITE_CAP, ctx.actor.clientId);
  const session = buildSession({ id: ctx.ids("strat"), workspaceId, clientId: ctx.actor.clientId, title, goal, collectionIds: input.collectionIds ?? [], dimensions: input.dimensions ?? [], requestedByUserId: ctx.actor.userId, now: ctx.clock() });
  unwrap(await st.sessions.create(session));
  return toSessionDTO(session);
}

/* ---- Pass 1 + 2: context assembly + business reasoning --------------------- */

export interface RunAnalysisOptions { promptId?: string; provider?: string; model?: string; sleep?: (ms: number) => Promise<void>; }

export async function runBusinessAnalysis(ctx: AppContext, rawSessionId: unknown, opts: RunAnalysisOptions = {}): Promise<AnalysisDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_RUN_CAP, session.clientId);
  if (!canTransitionStrategy(session.status, "analyzing")) throw new ConflictError(`Cannot analyze a ${session.status} strategy`);
  const startedAt = ctx.clock();
  unwrap(await st.sessions.save({ ...session, status: "analyzing", updatedAt: ctx.clock(), version: session.version + 1 }, session.version));

  // Pass 1 — information gathering (Context Assembler → E2/E1).
  const context = await assembleStrategyContext(ctx, { workspaceId: session.workspaceId, goal: session.goal, collectionIds: session.collectionIds });
  const requested = session.dimensions.length > 0 ? session.dimensions : (["operations", "sales", "marketing", "automation_maturity"] as BusinessDimension[]);

  // Pass 2 — business reasoning: AI narrative (via E1 Prompt/Execution) + derived findings.
  let executiveSummary = `Strategic analysis for: ${session.goal}`;
  let aiTokens = 0;
  let aiCost = 0;
  let aiProvider: string | null = null;
  let aiModel: string | null = null;
  let aiDurationMs = 0;
  if (opts.promptId !== undefined && ctx.ai !== undefined && ctx.aiProviders !== undefined) {
    const contextText = context.chunks.map((c) => c.content).join("\n---\n").slice(0, 8000);
    const exec = await executePrompt(ctx, { promptId: opts.promptId, values: { goal: session.goal, context: contextText }, provider: opts.provider as never, model: opts.model }, { sleep: opts.sleep });
    executiveSummary = exec.content.slice(0, 4000);
    aiTokens = exec.usage.totalTokens; aiCost = exec.cost.totalCost; aiProvider = exec.provider; aiModel = exec.model; aiDurationMs = exec.durationMs;
  }

  // Derive findings: assign the top retrieved chunks to requested dimensions.
  const findings: BusinessFinding[] = [];
  const citations: StrategyCitation[] = [];
  const covered: BusinessDimension[] = [];
  requested.forEach((dimension, i) => {
    const chunk = context.chunks[i];
    if (chunk === undefined) return;
    covered.push(dimension);
    const finding = buildFinding({ id: ctx.ids("sfind"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, dimension, category: CATEGORIES[i % CATEGORIES.length]!, title: snippet(chunk.heading ?? chunk.content, 120), detail: snippet(chunk.content, 400), businessImpact: impactFromScore(chunk.score), confidence: Math.round(chunk.score * 100), evidenceCount: 1, now: ctx.clock() });
    findings.push(finding);
    citations.push(buildStrategyCitation({ id: ctx.ids("scite"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, findingId: finding.id, documentId: chunk.documentId, collectionId: chunk.collectionId, chunkId: chunk.chunkId, page: chunk.page, heading: chunk.heading, similarity: chunk.score, now: ctx.clock() }));
  });
  if (findings.length > 0) unwrap(await st.findings.appendMany(findings));
  if (citations.length > 0) unwrap(await st.citations.appendMany(citations));

  // Derive a risk when coverage/evidence is thin.
  const conf = calculateConfidence({ requestedDimensions: requested, coveredDimensions: covered, evidenceCount: context.chunks.length });
  if (conf.missingInformation.length > 0) {
    unwrap(await st.risks.appendMany([buildRisk({ id: ctx.ids("srisk"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, title: "Incomplete information for a confident strategy", description: `Missing coverage of: ${conf.missingInformation.join(", ")}`, severity: conf.value < 30 ? "high" : "medium", likelihood: "high", mitigation: "Gather the missing information via the clarification questions.", confidence: conf.value, now: ctx.clock() })]));
  }

  const clarifications = conf.value < CONFIDENCE_THRESHOLD ? generateClarifications(conf.missingInformation as BusinessDimension[]) : [];
  const analysis = {
    id: ctx.ids("sanal"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId,
    executiveSummary, currentState: snippet(context.chunks.map((c) => c.heading ?? "").filter(Boolean).join("; ") || "No documented current state retrieved.", 1000),
    expectedImpact: `Addressing the findings is expected to improve ${requested.join(", ")}.`,
    confidence: conf.value, confidenceReason: conf.reason, missingInformation: conf.missingInformation,
    clarifications, provider: aiProvider, model: aiModel, promptVersion: session.promptVersion, tokensUsed: aiTokens,
    retrievalLatencyMs: context.retrievalLatencyMs, aiDurationMs, createdAt: ctx.clock(),
  };
  unwrap(await st.analyses.append(analysis));

  const endedAt = ctx.clock();
  unwrap(await st.sessions.save({ ...session, status: "analyzing", retrievalCount: context.chunks.length, tokenTotal: aiTokens, cost: aiCost, provider: aiProvider, model: aiModel, confidence: conf.value, analysisDurationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)), updatedAt: endedAt, version: session.version + 2 }, session.version + 1));
  return toAnalysisDTO(analysis);
}

/* ---- Pass 3: recommendations + priority scores ----------------------------- */

function factorsFor(finding: BusinessFinding): PriorityFactors {
  const impact = levelToScore(finding.businessImpact);
  return {
    businessImpact: impact,
    implementationEffort: 50,
    urgency: finding.category === "risk" || finding.category === "bottleneck" ? 80 : 50,
    riskReduction: finding.category === "risk" ? 85 : 40,
    customerValue: finding.dimension === "customer_journey" || finding.dimension === "sales" ? 75 : 50,
    strategicAlignment: 70,
    automationPotential: finding.dimension === "automation_maturity" ? 85 : 40,
  };
}

export async function generateRecommendations(ctx: AppContext, rawSessionId: unknown): Promise<RecommendationDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_RUN_CAP, session.clientId);
  const existing = unwrap(await st.recommendations.listBySession(sessionId));
  if (existing.length > 0) return existing.sort((a, b) => a.order - b.order).map(toRecommendationDTO); // idempotent

  const findings = unwrap(await st.findings.listBySession(sessionId));
  const findingCitations = unwrap(await st.citations.listBySession(sessionId));
  const actionable = findings.filter((f) => f.category !== "strength" && f.category !== "advantage");
  const recommendations: StrategyRecommendation[] = [];
  const scores: StrategyPriorityScore[] = [];
  const recCitations: StrategyCitation[] = [];
  actionable.forEach((finding, i) => {
    const factors = factorsFor(finding);
    const priority = calculatePriority(factors);
    const rec = buildRecommendation({ id: ctx.ids("srec"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, title: `Address: ${finding.title}`, description: finding.detail, reasoning: `Derived from the ${finding.dimension} ${finding.category} finding.`, priority, effort: "medium" as EffortLevel, expectedImpact: finding.businessImpact, confidence: finding.confidence, order: i, now: ctx.clock() });
    recommendations.push(rec);
    scores.push(buildPriorityScore(ctx.ids("sprio"), rec.id, sessionId, session.workspaceId, session.clientId, factors, ctx.clock()));
    // Carry the finding's citation onto the recommendation it produced.
    for (const c of findingCitations.filter((fc) => fc.findingId === finding.id)) {
      recCitations.push(buildStrategyCitation({ id: ctx.ids("scite"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, recommendationId: rec.id, documentId: c.documentId, collectionId: c.collectionId, chunkId: c.chunkId, page: c.page, heading: c.heading, similarity: c.similarity, now: ctx.clock() }));
    }
  });
  if (recommendations.length > 0) {
    unwrap(await st.recommendations.appendMany(recommendations));
    unwrap(await st.priorityScores.appendMany(scores));
  }
  if (recCitations.length > 0) unwrap(await st.citations.appendMany(recCitations));
  return recommendations.sort((a, b) => b.priority - a.priority).map(toRecommendationDTO);
}

export async function calculatePriorityScores(ctx: AppContext, rawSessionId: unknown): Promise<PriorityScoreDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_RUN_CAP, session.clientId);
  const scores = unwrap(await st.priorityScores.listBySession(sessionId));
  return [...scores].sort((a, b) => b.total - a.total).map(toPriorityScoreDTO);
}

/* ---- Pass 4: roadmap ------------------------------------------------------- */

export async function generateRoadmap(ctx: AppContext, rawSessionId: unknown): Promise<RoadmapDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_RUN_CAP, session.clientId);
  const existing = unwrap(await st.roadmaps.getBySession(sessionId));
  if (existing !== null) return toRoadmapDTO(existing);

  const recommendations = unwrap(await st.recommendations.listBySession(sessionId));
  const phases = buildRoadmap(recommendations);
  const roadmap = { id: ctx.ids("sroad"), sessionId, workspaceId: session.workspaceId, clientId: session.clientId, phases, createdAt: ctx.clock() };
  unwrap(await st.roadmaps.append(roadmap));
  // Complete the session once the roadmap exists.
  if (canTransitionStrategy(session.status, "completed")) {
    unwrap(await st.sessions.save({ ...session, status: "completed", updatedAt: ctx.clock(), version: session.version + 1 }, session.version));
  }
  return toRoadmapDTO(roadmap);
}

/* ---- Pass 5 + services: validation / citations / clarifications / feedback -- */

export async function collectCitations(ctx: AppContext, rawSessionId: unknown): Promise<StrategyCitationResultDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_READ_CAP, session.clientId);
  return unwrap(await st.citations.listBySession(sessionId)).map(toStrategyCitationDTO);
}

export async function validateStrategy(ctx: AppContext, rawSessionId: unknown, allowModelGenerated = false): Promise<ValidationResultDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_REVIEW_CAP, session.clientId);
  const [analysis, findings, recommendations, citations] = await Promise.all([
    st.analyses.getBySession(sessionId).then(unwrap),
    st.findings.listBySession(sessionId).then(unwrap),
    st.recommendations.listBySession(sessionId).then(unwrap),
    st.citations.listBySession(sessionId).then(unwrap),
  ]);
  const citedRecs = new Set(citations.filter((c) => c.recommendationId !== null).map((c) => c.recommendationId as string));
  return domainValidate({
    executiveSummary: analysis?.executiveSummary ?? "",
    findingCount: findings.length,
    recommendations: recommendations.map((r) => ({ priority: r.priority, confidence: r.confidence })),
    citedRecommendationIds: citedRecs,
    recommendationIds: recommendations.map((r) => r.id),
    allowModelGenerated,
  });
}

export async function requestClarifications(ctx: AppContext, rawSessionId: unknown): Promise<ClarificationDTO[]> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_READ_CAP, session.clientId);
  const analysis = unwrap(await st.analyses.getBySession(sessionId));
  if (analysis === null) return [];
  const clarifications = analysis.clarifications.length > 0 ? analysis.clarifications : generateClarifications(analysis.missingInformation as BusinessDimension[]);
  return clarifications.map((c) => ({ question: c.question, dimension: c.dimension }));
}

export interface SubmitFeedbackInput { kind: StrategyFeedbackKind; rating?: number | null; comment?: string | null; }

export async function submitFeedback(ctx: AppContext, rawSessionId: unknown, input: SubmitFeedbackInput): Promise<FeedbackDTO> {
  const sessionId = requireId(rawSessionId, "sessionId");
  const st = requireStrategist(ctx);
  const session = unwrap(await st.sessions.getById(sessionId));
  if (session === null) throw new NotFoundError("strategy session");
  authorize(ctx.actor, STRATEGY_FEEDBACK_CAP, session.clientId);
  const feedback = buildFeedback(ctx.ids("sfb"), sessionId, session.workspaceId, session.clientId, input.kind, input.rating ?? null, input.comment ?? null, ctx.actor.userId, ctx.clock());
  unwrap(await st.feedback.append(feedback));
  return toFeedbackDTO(feedback);
}
