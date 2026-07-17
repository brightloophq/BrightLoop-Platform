/* =============================================================================
 * TransformationRepository — the PORT for transformation-cycle persistence.
 *
 * The domain services depend on THIS interface, never on a concrete backend.
 * A SupabaseTransformationRepository (packages/data) implements it; tests use an
 * in-memory fake. The repository is a thin persistence layer: it does NOT decide
 * ids, statuses, timestamps, actor attribution, capability, or transition
 * legality — those are the service's job (packages/domain/transformation/service.ts).
 *
 * Every method is tenant-safe by construction because the concrete Supabase
 * adapter runs under the caller's RLS-scoped client (layer 3). The service adds
 * capability + client-scope checks (layer 2) on top.
 * ========================================================================== */

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
import type { TransitionRecord } from "../guard.js";

export interface TransformationRepository {
  // ---- Signals -------------------------------------------------------------
  createSignal(record: Signal): Promise<Signal>;
  getSignal(id: string): Promise<Signal | null>;
  setSignalStatus(id: string, status: Signal["status"]): Promise<Signal>;

  // ---- Insights ------------------------------------------------------------
  createInsight(record: Insight): Promise<Insight>;
  getInsight(id: string): Promise<Insight | null>;
  setInsightStatus(id: string, status: Insight["status"]): Promise<Insight>;

  // ---- Recommendations -----------------------------------------------------
  createRecommendation(record: Recommendation): Promise<Recommendation>;
  getRecommendation(id: string): Promise<Recommendation | null>;
  setRecommendationStatus(id: string, status: Recommendation["status"]): Promise<Recommendation>;

  // ---- Approvals -----------------------------------------------------------
  createApproval(record: Approval): Promise<Approval>;
  getApproval(id: string): Promise<Approval | null>;
  /** Record a decision on a pending approval (approver + decision + decidedAt). */
  decideApproval(
    id: string,
    decision: "granted" | "denied",
    approverUserId: string,
    decidedAt: string,
    reason: string | null,
  ): Promise<Approval>;

  // ---- Moves ---------------------------------------------------------------
  createMove(record: Move): Promise<Move>;
  getMove(id: string): Promise<Move | null>;
  setMoveStatus(id: string, status: Move["status"], approvalId?: string | null): Promise<Move>;

  // ---- Execution records ---------------------------------------------------
  createExecutionRecord(record: ExecutionRecord): Promise<ExecutionRecord>;
  getExecutionRecord(id: string): Promise<ExecutionRecord | null>;
  /** Idempotency lookup — returns an existing run for this key, or null. */
  findExecutionByIdempotencyKey(key: string): Promise<ExecutionRecord | null>;
  setExecutionStatus(
    id: string,
    status: ExecutionRecord["status"],
    patch: Partial<Pick<ExecutionRecord, "attempts" | "lastError" | "startedAt" | "finishedAt">>,
  ): Promise<ExecutionRecord>;

  // ---- Measurements (append-only) ------------------------------------------
  createMeasurement(record: Measurement): Promise<Measurement>;

  // ---- Learnings (append-only) ---------------------------------------------
  createLearning(record: Learning): Promise<Learning>;

  // ---- Operational risks ---------------------------------------------------
  createOperationalRisk(record: OperationalRisk): Promise<OperationalRisk>;
  getOperationalRisk(id: string): Promise<OperationalRisk | null>;
  setOperationalRiskStatus(id: string, status: OperationalRisk["status"]): Promise<OperationalRisk>;

  // ---- Knowledge assets ----------------------------------------------------
  createKnowledgeAsset(record: KnowledgeAsset): Promise<KnowledgeAsset>;
  getKnowledgeAsset(id: string): Promise<KnowledgeAsset | null>;
  setKnowledgeAssetStatus(id: string, status: KnowledgeAsset["status"]): Promise<KnowledgeAsset>;

  // ---- Snapshots (append-only) ---------------------------------------------
  recordBusinessHealth(record: BusinessHealthRecord): Promise<BusinessHealthRecord>;
  latestBusinessHealth(clientId: string): Promise<BusinessHealthRecord | null>;
  recordTransformationIndex(record: TransformationIndexRecord): Promise<TransformationIndexRecord>;
  latestTransformationIndex(clientId: string): Promise<TransformationIndexRecord | null>;

  // ---- Audit ---------------------------------------------------------------
  /** Append a row to the transition_log (append-only audit of status changes). */
  appendTransition(record: TransitionRecord): Promise<void>;
}
