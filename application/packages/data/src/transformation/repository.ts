/* =============================================================================
 * SupabaseTransformationRepository — production implementation of the
 * TransformationRepository port (Sprint 2), backed by Supabase.
 *
 * ██ RLS IS THE REAL BOUNDARY ██
 *   The client is injected per request and carries the caller's session, so every
 *   query runs under the transformation-table RLS (Sprint 1): internal-only for
 *   operational tables; client-readable for business_health / transformation_index
 *   / approvals. This adapter adds no filters of its own — the service (layer 2)
 *   and RLS (layer 3) are the gates. NEVER cache this instance across requests.
 *
 * ██ TYPING NOTE ██
 *   The generated Database type (packages/db) now includes these tables (Sprint 3
 *   live harness). We still address them through an untyped SupabaseClient view via
 *   a single documented cast at construction, because the DOMAIN layer models every
 *   status as `string` (schema `statusEnum`) while the generated column types are
 *   strict enum literals. A fully typed client would therefore reject `.update({
 *   status })` at each transition and force a scatter of per-call enum casts —
 *   trading one documented cast for many. The mappers remain the type-safe boundary
 *   (their row shapes are exercised against the real schema by the live integration
 *   tests). Removing this cast cleanly is a follow-up that belongs with narrowing
 *   the domain status types to literal unions, not here.
 * ========================================================================== */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Signal,
  Insight,
  Recommendation,
  Approval,
  Move,
  ExecutionRecord,
  Measurement,
  Learning,
  OperationalRisk,
  KnowledgeAsset,
  BusinessHealthRecord,
  TransformationIndexRecord,
} from "@brightloop/schema";
import type { TransformationRepository, TransitionRecord } from "@brightloop/domain";
import type { AuxionSupabaseClient } from "../supabase/reputation.repository.js";
import * as m from "./mappers.js";

export class SupabaseTransformationRepository implements TransformationRepository {
  /** Untyped view of the injected client (see TYPING NOTE above). */
  private readonly db: SupabaseClient;

  constructor(client: AuxionSupabaseClient) {
    this.db = client as unknown as SupabaseClient;
  }

  private fail(op: string, message: string): never {
    // Fail loudly — a silent null would hide a broken table or an RLS denial.
    throw new Error(`transformation.${op} failed: ${message}`);
  }

  /* ---- Signals ----------------------------------------------------------- */
  async createSignal(record: Signal): Promise<Signal> {
    const { data, error } = await this.db.from("signals").insert(m.signalRow(record)).select().single();
    if (error) this.fail("createSignal", error.message);
    return m.toSignal(data);
  }
  async getSignal(id: string): Promise<Signal | null> {
    const { data, error } = await this.db.from("signals").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getSignal", error.message);
    return data ? m.toSignal(data) : null;
  }
  async setSignalStatus(id: string, status: Signal["status"]): Promise<Signal> {
    const { data, error } = await this.db.from("signals").update({ status }).eq("id", id).select().single();
    if (error) this.fail("setSignalStatus", error.message);
    return m.toSignal(data);
  }

  /* ---- Insights ---------------------------------------------------------- */
  async createInsight(record: Insight): Promise<Insight> {
    const { data, error } = await this.db.from("insights").insert(m.insightRow(record)).select().single();
    if (error) this.fail("createInsight", error.message);
    return m.toInsight(data);
  }
  async getInsight(id: string): Promise<Insight | null> {
    const { data, error } = await this.db.from("insights").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getInsight", error.message);
    return data ? m.toInsight(data) : null;
  }
  async setInsightStatus(id: string, status: Insight["status"]): Promise<Insight> {
    const { data, error } = await this.db.from("insights").update({ status }).eq("id", id).select().single();
    if (error) this.fail("setInsightStatus", error.message);
    return m.toInsight(data);
  }

  /* ---- Recommendations --------------------------------------------------- */
  async createRecommendation(record: Recommendation): Promise<Recommendation> {
    const { data, error } = await this.db.from("recommendations").insert(m.recommendationRow(record)).select().single();
    if (error) this.fail("createRecommendation", error.message);
    return m.toRecommendation(data);
  }
  async getRecommendation(id: string): Promise<Recommendation | null> {
    const { data, error } = await this.db.from("recommendations").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getRecommendation", error.message);
    return data ? m.toRecommendation(data) : null;
  }
  async setRecommendationStatus(id: string, status: Recommendation["status"]): Promise<Recommendation> {
    const { data, error } = await this.db.from("recommendations").update({ status }).eq("id", id).select().single();
    if (error) this.fail("setRecommendationStatus", error.message);
    return m.toRecommendation(data);
  }

  /* ---- Approvals --------------------------------------------------------- */
  async createApproval(record: Approval): Promise<Approval> {
    const { data, error } = await this.db.from("approvals").insert(m.approvalRow(record)).select().single();
    if (error) this.fail("createApproval", error.message);
    return m.toApproval(data);
  }
  async getApproval(id: string): Promise<Approval | null> {
    const { data, error } = await this.db.from("approvals").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getApproval", error.message);
    return data ? m.toApproval(data) : null;
  }
  async decideApproval(
    id: string,
    decision: "granted" | "denied",
    approverUserId: string,
    decidedAt: string,
    reason: string | null,
  ): Promise<Approval> {
    const { data, error } = await this.db
      .from("approvals")
      .update({ decision, approver_user_id: approverUserId, decided_at: decidedAt, reason })
      .eq("id", id)
      .select()
      .single();
    if (error) this.fail("decideApproval", error.message);
    return m.toApproval(data);
  }

  /* ---- Moves ------------------------------------------------------------- */
  async createMove(record: Move): Promise<Move> {
    const { data, error } = await this.db.from("moves").insert(m.moveRow(record)).select().single();
    if (error) this.fail("createMove", error.message);
    return m.toMove(data);
  }
  async getMove(id: string): Promise<Move | null> {
    const { data, error } = await this.db.from("moves").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getMove", error.message);
    return data ? m.toMove(data) : null;
  }
  async setMoveStatus(id: string, status: Move["status"], approvalId?: string | null): Promise<Move> {
    const patch: Record<string, unknown> = { status };
    if (approvalId !== undefined) patch["approval_id"] = approvalId;
    const { data, error } = await this.db.from("moves").update(patch).eq("id", id).select().single();
    if (error) this.fail("setMoveStatus", error.message);
    return m.toMove(data);
  }

  /* ---- Execution records ------------------------------------------------- */
  async createExecutionRecord(record: ExecutionRecord): Promise<ExecutionRecord> {
    const { data, error } = await this.db.from("execution_records").insert(m.executionRow(record)).select().single();
    if (error) this.fail("createExecutionRecord", error.message);
    return m.toExecutionRecord(data);
  }
  async getExecutionRecord(id: string): Promise<ExecutionRecord | null> {
    const { data, error } = await this.db.from("execution_records").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getExecutionRecord", error.message);
    return data ? m.toExecutionRecord(data) : null;
  }
  async findExecutionByIdempotencyKey(key: string): Promise<ExecutionRecord | null> {
    const { data, error } = await this.db
      .from("execution_records")
      .select("*")
      .eq("idempotency_key", key)
      .maybeSingle();
    if (error) this.fail("findExecutionByIdempotencyKey", error.message);
    return data ? m.toExecutionRecord(data) : null;
  }
  async setExecutionStatus(
    id: string,
    status: ExecutionRecord["status"],
    patch: Partial<Pick<ExecutionRecord, "attempts" | "lastError" | "startedAt" | "finishedAt">>,
  ): Promise<ExecutionRecord> {
    const update: Record<string, unknown> = { status };
    if (patch.attempts !== undefined) update["attempts"] = patch.attempts;
    if (patch.lastError !== undefined) update["last_error"] = patch.lastError;
    if (patch.startedAt !== undefined) update["started_at"] = patch.startedAt;
    if (patch.finishedAt !== undefined) update["finished_at"] = patch.finishedAt;
    const { data, error } = await this.db.from("execution_records").update(update).eq("id", id).select().single();
    if (error) this.fail("setExecutionStatus", error.message);
    return m.toExecutionRecord(data);
  }

  /* ---- Measurements / Learnings (append-only) ---------------------------- */
  async createMeasurement(record: Measurement): Promise<Measurement> {
    const { data, error } = await this.db.from("measurements").insert(m.measurementRow(record)).select().single();
    if (error) this.fail("createMeasurement", error.message);
    return m.toMeasurement(data);
  }
  async createLearning(record: Learning): Promise<Learning> {
    const { data, error } = await this.db.from("learnings").insert(m.learningRow(record)).select().single();
    if (error) this.fail("createLearning", error.message);
    return m.toLearning(data);
  }

  /* ---- Operational risks ------------------------------------------------- */
  async createOperationalRisk(record: OperationalRisk): Promise<OperationalRisk> {
    const { data, error } = await this.db.from("operational_risks").insert(m.operationalRiskRow(record)).select().single();
    if (error) this.fail("createOperationalRisk", error.message);
    return m.toOperationalRisk(data);
  }
  async getOperationalRisk(id: string): Promise<OperationalRisk | null> {
    const { data, error } = await this.db.from("operational_risks").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getOperationalRisk", error.message);
    return data ? m.toOperationalRisk(data) : null;
  }
  async setOperationalRiskStatus(id: string, status: OperationalRisk["status"]): Promise<OperationalRisk> {
    const { data, error } = await this.db.from("operational_risks").update({ status }).eq("id", id).select().single();
    if (error) this.fail("setOperationalRiskStatus", error.message);
    return m.toOperationalRisk(data);
  }

  /* ---- Knowledge assets -------------------------------------------------- */
  async createKnowledgeAsset(record: KnowledgeAsset): Promise<KnowledgeAsset> {
    const { data, error } = await this.db.from("knowledge_assets").insert(m.knowledgeAssetRow(record)).select().single();
    if (error) this.fail("createKnowledgeAsset", error.message);
    return m.toKnowledgeAsset(data);
  }
  async getKnowledgeAsset(id: string): Promise<KnowledgeAsset | null> {
    const { data, error } = await this.db.from("knowledge_assets").select("*").eq("id", id).maybeSingle();
    if (error) this.fail("getKnowledgeAsset", error.message);
    return data ? m.toKnowledgeAsset(data) : null;
  }
  async setKnowledgeAssetStatus(id: string, status: KnowledgeAsset["status"]): Promise<KnowledgeAsset> {
    const { data, error } = await this.db.from("knowledge_assets").update({ status }).eq("id", id).select().single();
    if (error) this.fail("setKnowledgeAssetStatus", error.message);
    return m.toKnowledgeAsset(data);
  }

  /* ---- Snapshots --------------------------------------------------------- */
  async recordBusinessHealth(record: BusinessHealthRecord): Promise<BusinessHealthRecord> {
    const { data, error } = await this.db.from("business_health").insert(m.businessHealthRow(record)).select().single();
    if (error) this.fail("recordBusinessHealth", error.message);
    return m.toBusinessHealthRecord(data);
  }
  async latestBusinessHealth(clientId: string): Promise<BusinessHealthRecord | null> {
    const { data, error } = await this.db
      .from("business_health")
      .select("*")
      .eq("client_id", clientId)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail("latestBusinessHealth", error.message);
    return data ? m.toBusinessHealthRecord(data) : null;
  }
  async recordTransformationIndex(record: TransformationIndexRecord): Promise<TransformationIndexRecord> {
    const { data, error } = await this.db.from("transformation_index").insert(m.transformationIndexRow(record)).select().single();
    if (error) this.fail("recordTransformationIndex", error.message);
    return m.toTransformationIndexRecord(data);
  }
  async latestTransformationIndex(clientId: string): Promise<TransformationIndexRecord | null> {
    const { data, error } = await this.db
      .from("transformation_index")
      .select("*")
      .eq("client_id", clientId)
      .order("at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) this.fail("latestTransformationIndex", error.message);
    return data ? m.toTransformationIndexRecord(data) : null;
  }

  /* ---- Audit ------------------------------------------------------------- */
  async appendTransition(record: TransitionRecord): Promise<void> {
    const { error } = await this.db.from("transition_log").insert({
      machine: record.machine,
      entity_type: record.machine,
      entity_id: record.entityId,
      from_state: record.from,
      to_state: record.to,
      actor_id: record.actorId,
      reason: record.reason,
      at: record.at,
    });
    if (error) this.fail("appendTransition", error.message);
  }
}
