/* =============================================================================
 * Supabase AI Strategist repositories (Phase E · Sprint E3).
 *
 * Nine adapters (untyped-cast pattern; mappers are the boundary). The session is
 * versioned (optimistic concurrency); analyses, findings, risks, recommendations,
 * priority scores, roadmaps, citations and feedback are append-only.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  err, mapDatabaseError, ok,
  type BusinessFindingRepository, type PriorityScoreRepository, type RiskAssessmentRepository, type RuntimeResult,
  type StrategyAnalysisRepository, type StrategyCitationRepository, type StrategyFeedbackRepository,
  type StrategyRecommendationRepository, type StrategySessionRepository, type TransformationRoadmapRepository,
} from "@brightloop/domain";
import type {
  BusinessFinding, RiskAssessment, StrategyAnalysis, StrategyCitation, StrategyFeedback,
  StrategyPriorityScore, StrategyRecommendation, StrategySession, TransformationRoadmap,
} from "@brightloop/schema";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

const SESS = "strategy_session";
const ANAL = "strategy_analysis";
const FIND = "business_finding";
const RISK = "risk_assessment";
const REC = "recommendation";
const PRIO = "priority_score";
const ROAD = "transformation_roadmap";
const CITE = "strategy_citation";
const FB = "strategy_feedback";

export class SupabaseStrategySessionRepository implements StrategySessionRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async create(s: StrategySession): Promise<RuntimeResult<StrategySession>> {
    const { data, error } = await this.db.from(SESS).insert(m.sessionRow(s)).select("*").single();
    if (error) return mapDatabaseError(error, "strategySession.create");
    return ok("created", m.toSession(data as Record<string, unknown>));
  }
  async getById(id: string): Promise<RuntimeResult<StrategySession | null>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("id", id).maybeSingle();
    if (error) return mapDatabaseError(error, "strategySession.getById");
    return ok("found", data ? m.toSession(data as Record<string, unknown>) : null);
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<StrategySession[]>> {
    const { data, error } = await this.db.from(SESS).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "strategySession.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toSession(r as Record<string, unknown>)));
  }
  async save(next: StrategySession, expectedVersion: number): Promise<RuntimeResult<StrategySession>> {
    const { data, error } = await this.db.from(SESS).update({ status: next.status, provider: next.provider, model: next.model, analysis_duration_ms: next.analysisDurationMs, retrieval_count: next.retrievalCount, token_total: next.tokenTotal, cost: next.cost, confidence: next.confidence, version: next.version, updated_at: next.updatedAt }).eq("id", next.id).eq("version", expectedVersion).select("*").maybeSingle();
    if (error) return mapDatabaseError(error, "strategySession.save");
    if (data === null) return err("conflict", "strategySession.save: version mismatch");
    return ok("updated", m.toSession(data as Record<string, unknown>));
  }
}

export class SupabaseStrategyAnalysisRepository implements StrategyAnalysisRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(a: StrategyAnalysis): Promise<RuntimeResult<StrategyAnalysis>> {
    const { data, error } = await this.db.from(ANAL).insert(m.analysisRow(a)).select("*").single();
    if (error) return mapDatabaseError(error, "strategyAnalysis.append");
    return ok("created", m.toAnalysis(data as Record<string, unknown>));
  }
  async getBySession(sessionId: string): Promise<RuntimeResult<StrategyAnalysis | null>> {
    const { data, error } = await this.db.from(ANAL).select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "strategyAnalysis.getBySession");
    return ok("found", data ? m.toAnalysis(data as Record<string, unknown>) : null);
  }
}

export class SupabaseBusinessFindingRepository implements BusinessFindingRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly BusinessFinding[]): Promise<RuntimeResult<BusinessFinding[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(FIND).insert(rows.map(m.findingRow)).select("*");
    if (error) return mapDatabaseError(error, "businessFinding.appendMany");
    return ok("created", (data ?? []).map((r) => m.toFinding(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<BusinessFinding[]>> {
    const { data, error } = await this.db.from(FIND).select("*").eq("session_id", sessionId).order("created_at", { ascending: true });
    if (error) return mapDatabaseError(error, "businessFinding.listBySession");
    return ok("found", (data ?? []).map((r) => m.toFinding(r as Record<string, unknown>)));
  }
}

export class SupabaseRiskAssessmentRepository implements RiskAssessmentRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly RiskAssessment[]): Promise<RuntimeResult<RiskAssessment[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(RISK).insert(rows.map(m.riskRow)).select("*");
    if (error) return mapDatabaseError(error, "riskAssessment.appendMany");
    return ok("created", (data ?? []).map((r) => m.toRisk(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<RiskAssessment[]>> {
    const { data, error } = await this.db.from(RISK).select("*").eq("session_id", sessionId);
    if (error) return mapDatabaseError(error, "riskAssessment.listBySession");
    return ok("found", (data ?? []).map((r) => m.toRisk(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<RiskAssessment[]>> {
    const { data, error } = await this.db.from(RISK).select("*").eq("workspace_id", workspaceId);
    if (error) return mapDatabaseError(error, "riskAssessment.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toRisk(r as Record<string, unknown>)));
  }
}

export class SupabaseRecommendationRepository implements StrategyRecommendationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly StrategyRecommendation[]): Promise<RuntimeResult<StrategyRecommendation[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(REC).insert(rows.map(m.recommendationRow)).select("*");
    if (error) return mapDatabaseError(error, "recommendation.appendMany");
    return ok("created", (data ?? []).map((r) => m.toRecommendation(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<StrategyRecommendation[]>> {
    const { data, error } = await this.db.from(REC).select("*").eq("session_id", sessionId).order("order_index", { ascending: true });
    if (error) return mapDatabaseError(error, "recommendation.listBySession");
    return ok("found", (data ?? []).map((r) => m.toRecommendation(r as Record<string, unknown>)));
  }
}

export class SupabasePriorityScoreRepository implements PriorityScoreRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly StrategyPriorityScore[]): Promise<RuntimeResult<StrategyPriorityScore[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(PRIO).insert(rows.map(m.priorityRow)).select("*");
    if (error) return mapDatabaseError(error, "priorityScore.appendMany");
    return ok("created", (data ?? []).map((r) => m.toPriority(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<StrategyPriorityScore[]>> {
    const { data, error } = await this.db.from(PRIO).select("*").eq("session_id", sessionId);
    if (error) return mapDatabaseError(error, "priorityScore.listBySession");
    return ok("found", (data ?? []).map((r) => m.toPriority(r as Record<string, unknown>)));
  }
}

export class SupabaseTransformationRoadmapRepository implements TransformationRoadmapRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(x: TransformationRoadmap): Promise<RuntimeResult<TransformationRoadmap>> {
    const { data, error } = await this.db.from(ROAD).insert(m.roadmapRow(x)).select("*").single();
    if (error) return mapDatabaseError(error, "roadmap.append");
    return ok("created", m.toRoadmap(data as Record<string, unknown>));
  }
  async getBySession(sessionId: string): Promise<RuntimeResult<TransformationRoadmap | null>> {
    const { data, error } = await this.db.from(ROAD).select("*").eq("session_id", sessionId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return mapDatabaseError(error, "roadmap.getBySession");
    return ok("found", data ? m.toRoadmap(data as Record<string, unknown>) : null);
  }
}

export class SupabaseStrategyCitationRepository implements StrategyCitationRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async appendMany(rows: readonly StrategyCitation[]): Promise<RuntimeResult<StrategyCitation[]>> {
    if (rows.length === 0) return ok("created", []);
    const { data, error } = await this.db.from(CITE).insert(rows.map(m.citationRow)).select("*");
    if (error) return mapDatabaseError(error, "strategyCitation.appendMany");
    return ok("created", (data ?? []).map((r) => m.toCitation(r as Record<string, unknown>)));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<StrategyCitation[]>> {
    const { data, error } = await this.db.from(CITE).select("*").eq("session_id", sessionId);
    if (error) return mapDatabaseError(error, "strategyCitation.listBySession");
    return ok("found", (data ?? []).map((r) => m.toCitation(r as Record<string, unknown>)));
  }
}

export class SupabaseStrategyFeedbackRepository implements StrategyFeedbackRepository {
  private readonly db: SupabaseClient;
  constructor(client: AuxionSupabaseClient) { this.db = client as unknown as SupabaseClient; }
  async append(f: StrategyFeedback): Promise<RuntimeResult<StrategyFeedback>> {
    const { data, error } = await this.db.from(FB).insert(m.feedbackRow(f)).select("*").single();
    if (error) return mapDatabaseError(error, "strategyFeedback.append");
    return ok("created", m.toFeedback(data as Record<string, unknown>));
  }
  async listBySession(sessionId: string): Promise<RuntimeResult<StrategyFeedback[]>> {
    const { data, error } = await this.db.from(FB).select("*").eq("session_id", sessionId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "strategyFeedback.listBySession");
    return ok("found", (data ?? []).map((r) => m.toFeedback(r as Record<string, unknown>)));
  }
  async listByWorkspace(workspaceId: string): Promise<RuntimeResult<StrategyFeedback[]>> {
    const { data, error } = await this.db.from(FB).select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: false });
    if (error) return mapDatabaseError(error, "strategyFeedback.listByWorkspace");
    return ok("found", (data ?? []).map((r) => m.toFeedback(r as Record<string, unknown>)));
  }
}
