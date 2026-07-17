/* =============================================================================
 * Transformation domain service (Sprint 2). The production service layer for the
 * transformation cycle, built on the Sprint 1 schema + RLS.
 *
 * Every mutation flows through here and enforces, IN ORDER:
 *   1. capability (assertCapability)         — layer 2 authorization
 *   2. client scope for client-role reads    — layer 2 tenant isolation
 *   3. transition legality (assertTransition) — layer 2 lifecycle guard
 *   4. the human-approval gate on Move execution
 *   5. actor attribution (createdBy / approverUserId = the acting user)
 *   6. append-only transition audit + a DomainEvent
 *
 * The concrete repository runs under the caller's RLS-scoped client (layer 3),
 * so the database is the final boundary. This layer fails fast with clear errors.
 *
 * AI is never required: aiProvenance is optional on recommendations and defaults
 * to null. No method calls a model, a queue, or an external provider.
 * ========================================================================== */

import {
  signalSchema,
  insightSchema,
  recommendationSchema,
  approvalSchema,
  moveSchema,
  executionRecordSchema,
  measurementSchema,
  learningSchema,
  operationalRiskSchema,
  knowledgeAssetSchema,
  businessHealthRecordSchema,
  transformationIndexRecordSchema,
  type Signal,
  type Insight,
  type Recommendation,
  type Approval,
  type Move,
  type ExecutionRecord,
  type Measurement,
  type Learning,
  type OperationalRisk,
  type KnowledgeAsset,
  type BusinessHealthRecord,
  type TransformationIndexRecord,
  type EvidenceItem,
  type AiProvenance,
} from "@brightloop/schema";
import { isClientRole } from "@brightloop/schema";
import { type Actor, assertCapability, assertOwnClient } from "../capabilities.js";
import { assertTransition, transition, systemClock, type Clock } from "../guard.js";
import { ApprovalRequiredError, NotFoundError } from "../errors.js";
import type { EventSink } from "../events.js";
import { NoopEventSink } from "../events.js";
import type { TransformationRepository } from "./repository.js";
import { emitTransformation, type TransformationEventName } from "./events.js";

/** Generates a prefixed id (e.g. ids("sig") -> "sig_..."). Injected for determinism. */
export type IdGen = (prefix: string) => string;

export interface TransformationServiceDeps {
  repo: TransformationRepository;
  events?: EventSink;
  clock?: Clock;
  ids: IdGen;
}

/** Capability strings (namespaced). Kept here so the matrix and the service agree. */
const CAP = {
  read: "transformation.read",
  signals: "transformation.signals.write",
  insights: "transformation.insights.write",
  recommendations: "transformation.recommendations.write",
  requestApproval: "transformation.approvals.request",
  approve: "transformation.approve",
  moves: "transformation.moves.write",
  executions: "transformation.executions.write",
  measurements: "transformation.measurements.write",
  learnings: "transformation.learnings.write",
  risks: "transformation.risks.write",
  knowledge: "transformation.knowledge.write",
  health: "transformation.health.write",
  index: "transformation.index.write",
} as const;

/* ---- service-input types (service owns id/status/timestamps/attribution) --- */

export interface NewSignal {
  clientId: string;
  title: string;
  detail?: string | null;
  sourceRef?: string | null;
  evidence?: EvidenceItem[];
}
export interface NewInsight {
  clientId: string;
  signalId: string;
  summary: string;
  detail?: string | null;
  evidence?: EvidenceItem[];
  confidence?: number | null;
}
export interface NewRecommendation {
  clientId: string;
  insightId: string;
  summary: string;
  rationale: string;
  expectedOutcome?: string | null;
  evidence?: EvidenceItem[];
  confidence?: number | null;
  /** Optional — a human-authored recommendation omits this (AI is never required). */
  aiProvenance?: AiProvenance | null;
}
export interface NewMove {
  clientId: string;
  title: string;
  intent: string;
  expectedOutcome?: string | null;
  recommendationId?: string | null;
}
export interface NewMeasurement {
  clientId: string;
  moveId: string;
  metricKey: string;
  observed: number;
  target?: number | null;
  delta?: number | null;
  unit?: string | null;
  measuredAt?: string;
}
export interface NewLearning {
  clientId: string;
  summary: string;
  detail?: string | null;
  moveId?: string | null;
  measurementId?: string | null;
  capturedAt?: string;
}
export interface NewOperationalRisk {
  clientId: string;
  title: string;
  severity: OperationalRisk["severity"];
  likelihood: OperationalRisk["likelihood"];
  detail?: string | null;
  signalId?: string | null;
  moveId?: string | null;
  ownerUserId?: string | null;
  evidence?: EvidenceItem[];
}
export interface NewKnowledgeAsset {
  /** Nullable: a platform-level (shared) asset has no client. */
  clientId: string | null;
  title: string;
  kind: KnowledgeAsset["kind"];
  body: string;
  sourceRef?: string | null;
}
export interface NewBusinessHealth {
  clientId: string;
  dimensions: Record<string, number>;
  score: number;
  basis?: string | null;
  capturedAt?: string;
}
export interface NewTransformationIndex {
  clientId: string;
  value: number;
  delta?: number | null;
  basis?: string | null;
  at?: string;
}

/**
 * The transformation service. Construct once per request with an RLS-scoped
 * repository, then call methods with the authenticated Actor.
 */
export class TransformationService {
  private readonly repo: TransformationRepository;
  private readonly events: EventSink;
  private readonly clock: Clock;
  private readonly ids: IdGen;

  constructor(deps: TransformationServiceDeps) {
    this.repo = deps.repo;
    this.events = deps.events ?? new NoopEventSink();
    this.clock = deps.clock ?? systemClock;
    this.ids = deps.ids;
  }

  /* ---- Signals ----------------------------------------------------------- */

  async createSignal(actor: Actor, input: NewSignal): Promise<Signal> {
    assertCapability(actor, CAP.signals);
    const at = this.clock();
    const record = signalSchema.parse({
      id: this.ids("sig"),
      clientId: input.clientId,
      title: input.title,
      detail: input.detail ?? null,
      status: "detected",
      sourceRef: input.sourceRef ?? null,
      evidence: input.evidence ?? [],
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createSignal(record);
    await this.emit("transformation.signal.detected", actor, saved.clientId, at, { id: saved.id });
    return saved;
  }

  async transitionSignal(actor: Actor, id: string, to: Signal["status"], reason?: string): Promise<Signal> {
    const current = await this.require("Signal", await this.repo.getSignal(id), id);
    return this.guarded(
      actor,
      CAP.signals,
      "signal",
      current,
      to,
      (t) => this.repo.setSignalStatus(id, t),
      "transformation.signal.status_changed",
      reason,
    );
  }

  /* ---- Insights ---------------------------------------------------------- */

  async createInsight(actor: Actor, input: NewInsight): Promise<Insight> {
    assertCapability(actor, CAP.insights);
    const at = this.clock();
    const record = insightSchema.parse({
      id: this.ids("ins"),
      clientId: input.clientId,
      signalId: input.signalId,
      summary: input.summary,
      detail: input.detail ?? null,
      status: "generated",
      evidence: input.evidence ?? [],
      confidence: input.confidence ?? null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createInsight(record);
    await this.emit("transformation.insight.generated", actor, saved.clientId, at, { id: saved.id });
    return saved;
  }

  async transitionInsight(actor: Actor, id: string, to: Insight["status"], reason?: string): Promise<Insight> {
    const current = await this.require("Insight", await this.repo.getInsight(id), id);
    return this.guarded(
      actor,
      CAP.insights,
      "insight",
      current,
      to,
      (t) => this.repo.setInsightStatus(id, t),
      "transformation.insight.status_changed",
      reason,
    );
  }

  /* ---- Recommendations --------------------------------------------------- */

  async createRecommendation(actor: Actor, input: NewRecommendation): Promise<Recommendation> {
    assertCapability(actor, CAP.recommendations);
    const at = this.clock();
    const record = recommendationSchema.parse({
      id: this.ids("rec"),
      clientId: input.clientId,
      insightId: input.insightId,
      summary: input.summary,
      rationale: input.rationale,
      expectedOutcome: input.expectedOutcome ?? null,
      status: "proposed",
      evidence: input.evidence ?? [],
      confidence: input.confidence ?? null,
      aiProvenance: input.aiProvenance ?? null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createRecommendation(record);
    await this.emit("transformation.recommendation.created", actor, saved.clientId, at, {
      id: saved.id,
      aiAssisted: saved.aiProvenance !== null,
    });
    return saved;
  }

  async transitionRecommendation(
    actor: Actor,
    id: string,
    to: Recommendation["status"],
    reason?: string,
  ): Promise<Recommendation> {
    const current = await this.require("Recommendation", await this.repo.getRecommendation(id), id);
    return this.guarded(
      actor,
      CAP.recommendations,
      "recommendation",
      current,
      to,
      (t) => this.repo.setRecommendationStatus(id, t),
      "transformation.recommendation.status_changed",
      reason,
    );
  }

  /* ---- Approvals (first-class human-authorization records) ---------------- */

  /** Request a (pending) approval for a subject — an operator preparing work. */
  async requestApproval(
    actor: Actor,
    input: { clientId: string; subjectType: Approval["subjectType"]; subjectId: string },
  ): Promise<Approval> {
    assertCapability(actor, CAP.requestApproval);
    const at = this.clock();
    const record = approvalSchema.parse({
      id: this.ids("apr"),
      clientId: input.clientId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      decision: "pending",
      approverUserId: null,
      reason: null,
      requestedAt: at,
      decidedAt: null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createApproval(record);
    await this.emit("transformation.approval.requested", actor, saved.clientId, at, {
      id: saved.id,
      subjectType: saved.subjectType,
    });
    return saved;
  }

  /**
   * Record a human decision. The approver is ALWAYS the acting user — an approval
   * cannot be forged for another actor. Requires the `transformation.approve`
   * capability (owner/admin — a Strategist authority; operators cannot approve).
   */
  async decideApproval(
    actor: Actor,
    input: { approvalId: string; decision: "granted" | "denied"; reason?: string | null },
  ): Promise<Approval> {
    assertCapability(actor, CAP.approve);
    const current = await this.require("Approval", await this.repo.getApproval(input.approvalId), input.approvalId);
    assertTransition("approval", current.decision, input.decision);
    const at = this.clock();
    const saved = await this.repo.decideApproval(
      input.approvalId,
      input.decision,
      actor.userId, // attribution: approver = the acting human, never client-supplied
      at,
      input.reason ?? null,
    );
    await this.repo.appendTransition(
      transition(
        { machine: "approval", entityId: input.approvalId, from: current.decision, to: input.decision, actorId: actor.userId, reason: input.reason ?? null },
        () => at,
      ),
    );
    await this.emit("transformation.approval.decided", actor, saved.clientId, at, {
      id: saved.id,
      decision: saved.decision,
    });
    return saved;
  }

  /* ---- Moves (approval-gated) -------------------------------------------- */

  async createMove(actor: Actor, input: NewMove): Promise<Move> {
    assertCapability(actor, CAP.moves);
    const at = this.clock();
    const record = moveSchema.parse({
      id: this.ids("mov"),
      clientId: input.clientId,
      title: input.title,
      intent: input.intent,
      expectedOutcome: input.expectedOutcome ?? null,
      status: "draft",
      recommendationId: input.recommendationId ?? null,
      approvalId: null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createMove(record);
    await this.emit("transformation.move.created", actor, saved.clientId, at, { id: saved.id });
    return saved;
  }

  /** draft → recommended, and open a pending approval for the move. */
  async submitMoveForApproval(actor: Actor, moveId: string): Promise<{ move: Move; approval: Approval }> {
    assertCapability(actor, CAP.requestApproval);
    const move = await this.require("Move", await this.repo.getMove(moveId), moveId);
    const approval = await this.requestApproval(actor, {
      clientId: move.clientId,
      subjectType: "move",
      subjectId: moveId,
    });
    const updated = await this.guarded(
      actor,
      CAP.moves,
      "move",
      move,
      "recommended",
      (t) => this.repo.setMoveStatus(moveId, t),
      "transformation.move.status_changed",
    );
    return { move: updated, approval };
  }

  /** recommended/draft → approved, linking a GRANTED approval to the move. */
  async approveMove(actor: Actor, moveId: string, approvalId: string): Promise<Move> {
    assertCapability(actor, CAP.moves);
    const move = await this.require("Move", await this.repo.getMove(moveId), moveId);
    await this.requireGrantedApprovalForMove(approvalId, moveId, move.clientId);
    assertTransition("move", move.status, "approved");
    const at = this.clock();
    const updated = await this.repo.setMoveStatus(moveId, "approved", approvalId);
    await this.repo.appendTransition(
      transition({ machine: "move", entityId: moveId, from: move.status, to: "approved", actorId: actor.userId, reason: null }, () => at),
    );
    await this.emit("transformation.move.status_changed", actor, move.clientId, at, { id: moveId, from: move.status, to: "approved" });
    return updated;
  }

  /**
   * approved → executing. THE HUMAN-AUTHORITY GATE: a move cannot execute unless
   * it carries a granted approval whose subject is this move. Mirrors the DB gate.
   */
  async executeMove(actor: Actor, moveId: string): Promise<Move> {
    assertCapability(actor, CAP.moves);
    const move = await this.require("Move", await this.repo.getMove(moveId), moveId);
    if (!move.approvalId) throw new ApprovalRequiredError(moveId);
    await this.requireGrantedApprovalForMove(move.approvalId, moveId, move.clientId);
    return this.guarded(
      actor,
      CAP.moves,
      "move",
      move,
      "executing",
      (t) => this.repo.setMoveStatus(moveId, t),
      "transformation.move.status_changed",
    );
  }

  async completeMove(actor: Actor, moveId: string): Promise<Move> {
    const move = await this.require("Move", await this.repo.getMove(moveId), moveId);
    return this.guarded(actor, CAP.moves, "move", move, "completed", (t) => this.repo.setMoveStatus(moveId, t), "transformation.move.status_changed");
  }

  async markMoveMeasured(actor: Actor, moveId: string): Promise<Move> {
    const move = await this.require("Move", await this.repo.getMove(moveId), moveId);
    return this.guarded(actor, CAP.moves, "move", move, "measured", (t) => this.repo.setMoveStatus(moveId, t), "transformation.move.status_changed");
  }

  /* ---- Execution records (idempotent) ------------------------------------ */

  /**
   * Start (queue) an execution for an approved move. Idempotent: if an
   * idempotencyKey is supplied and a run already exists for it, the existing run
   * is returned and no duplicate is created.
   */
  async startExecution(
    actor: Actor,
    input: { clientId: string; moveId: string; idempotencyKey?: string | null },
  ): Promise<ExecutionRecord> {
    assertCapability(actor, CAP.executions);
    if (input.idempotencyKey) {
      const existing = await this.repo.findExecutionByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing; // idempotent: no duplicate work
    }
    const at = this.clock();
    const record = executionRecordSchema.parse({
      id: this.ids("exe"),
      clientId: input.clientId,
      moveId: input.moveId,
      status: "queued",
      idempotencyKey: input.idempotencyKey ?? null,
      attempts: 0,
      lastError: null,
      startedAt: null,
      finishedAt: null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createExecutionRecord(record);
    await this.emit("transformation.execution.started", actor, saved.clientId, at, { id: saved.id, moveId: saved.moveId });
    return saved;
  }

  async transitionExecution(
    actor: Actor,
    id: string,
    to: ExecutionRecord["status"],
    patch: Partial<Pick<ExecutionRecord, "attempts" | "lastError" | "startedAt" | "finishedAt">> = {},
    reason?: string,
  ): Promise<ExecutionRecord> {
    assertCapability(actor, CAP.executions);
    const current = await this.require("ExecutionRecord", await this.repo.getExecutionRecord(id), id);
    assertTransition("executionRecord", current.status, to);
    const at = this.clock();
    const updated = await this.repo.setExecutionStatus(id, to, patch);
    await this.repo.appendTransition(
      transition({ machine: "executionRecord", entityId: id, from: current.status, to, actorId: actor.userId, reason: reason ?? null }, () => at),
    );
    await this.emit("transformation.execution.status_changed", actor, current.clientId, at, { id, from: current.status, to });
    return updated;
  }

  /* ---- Measurements ------------------------------------------------------ */

  async recordMeasurement(actor: Actor, input: NewMeasurement): Promise<Measurement> {
    assertCapability(actor, CAP.measurements);
    const at = this.clock();
    const record = measurementSchema.parse({
      id: this.ids("mea"),
      clientId: input.clientId,
      moveId: input.moveId,
      metricKey: input.metricKey,
      target: input.target ?? null,
      observed: input.observed,
      delta: input.delta ?? null,
      unit: input.unit ?? null,
      measuredAt: input.measuredAt ?? at,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createMeasurement(record);
    await this.emit("transformation.measurement.recorded", actor, saved.clientId, at, { id: saved.id, moveId: saved.moveId });
    return saved;
  }

  /* ---- Learnings --------------------------------------------------------- */

  async captureLearning(actor: Actor, input: NewLearning): Promise<Learning> {
    assertCapability(actor, CAP.learnings);
    const at = this.clock();
    const record = learningSchema.parse({
      id: this.ids("lrn"),
      clientId: input.clientId,
      summary: input.summary,
      detail: input.detail ?? null,
      moveId: input.moveId ?? null,
      measurementId: input.measurementId ?? null,
      capturedAt: input.capturedAt ?? at,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createLearning(record);
    await this.emit("transformation.learning.captured", actor, saved.clientId, at, { id: saved.id });
    return saved;
  }

  /* ---- Operational risks ------------------------------------------------- */

  async createOperationalRisk(actor: Actor, input: NewOperationalRisk): Promise<OperationalRisk> {
    assertCapability(actor, CAP.risks);
    const at = this.clock();
    const record = operationalRiskSchema.parse({
      id: this.ids("rsk"),
      clientId: input.clientId,
      title: input.title,
      detail: input.detail ?? null,
      status: "identified",
      severity: input.severity,
      likelihood: input.likelihood,
      signalId: input.signalId ?? null,
      moveId: input.moveId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      evidence: input.evidence ?? [],
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createOperationalRisk(record);
    await this.emit("transformation.risk.identified", actor, saved.clientId, at, { id: saved.id, severity: saved.severity });
    return saved;
  }

  async transitionOperationalRisk(actor: Actor, id: string, to: OperationalRisk["status"], reason?: string): Promise<OperationalRisk> {
    const current = await this.require("OperationalRisk", await this.repo.getOperationalRisk(id), id);
    return this.guarded(actor, CAP.risks, "operationalRisk", current, to, (t) => this.repo.setOperationalRiskStatus(id, t), "transformation.risk.status_changed", reason);
  }

  /* ---- Knowledge assets -------------------------------------------------- */

  async storeKnowledgeAsset(actor: Actor, input: NewKnowledgeAsset): Promise<KnowledgeAsset> {
    assertCapability(actor, CAP.knowledge);
    const at = this.clock();
    const record = knowledgeAssetSchema.parse({
      id: this.ids("kna"),
      clientId: input.clientId,
      title: input.title,
      kind: input.kind,
      body: input.body,
      status: "draft",
      sourceRef: input.sourceRef ?? null,
      createdBy: actor.userId,
      createdAt: at,
    });
    const saved = await this.repo.createKnowledgeAsset(record);
    await this.emit("transformation.knowledge.stored", actor, saved.clientId, at, { id: saved.id, kind: saved.kind });
    return saved;
  }

  async transitionKnowledgeAsset(actor: Actor, id: string, to: KnowledgeAsset["status"], reason?: string): Promise<KnowledgeAsset> {
    const current = await this.require("KnowledgeAsset", await this.repo.getKnowledgeAsset(id), id);
    // clientId may be null (platform-level); events tolerate a null clientId.
    return this.guarded(actor, CAP.knowledge, "knowledgeAsset", { status: current.status, clientId: current.clientId }, to, (t) => this.repo.setKnowledgeAssetStatus(id, t), "transformation.knowledge.status_changed", reason);
  }

  /* ---- Snapshots --------------------------------------------------------- */

  async recordBusinessHealth(actor: Actor, input: NewBusinessHealth): Promise<BusinessHealthRecord> {
    assertCapability(actor, CAP.health);
    const at = this.clock();
    const record = businessHealthRecordSchema.parse({
      id: this.ids("bhs"),
      clientId: input.clientId,
      dimensions: input.dimensions,
      score: input.score,
      basis: input.basis ?? null,
      capturedAt: input.capturedAt ?? at,
      createdAt: at,
    });
    const saved = await this.repo.recordBusinessHealth(record);
    await this.emit("transformation.business_health.recorded", actor, saved.clientId, at, { id: saved.id, score: saved.score });
    return saved;
  }

  async recordTransformationIndex(actor: Actor, input: NewTransformationIndex): Promise<TransformationIndexRecord> {
    assertCapability(actor, CAP.index);
    const at = this.clock();
    const record = transformationIndexRecordSchema.parse({
      id: this.ids("tix"),
      clientId: input.clientId,
      value: input.value,
      delta: input.delta ?? null,
      basis: input.basis ?? null,
      at: input.at ?? at,
      createdAt: at,
    });
    const saved = await this.repo.recordTransformationIndex(record);
    await this.emit("transformation.transformation_index.recorded", actor, saved.clientId, at, { id: saved.id, value: saved.value });
    return saved;
  }

  /** Client-readable progress: internal roles see any client; client roles see only their own. */
  async getLatestBusinessHealth(actor: Actor, clientId: string): Promise<BusinessHealthRecord | null> {
    this.assertProgressRead(actor, clientId);
    return this.repo.latestBusinessHealth(clientId);
  }

  async getLatestTransformationIndex(actor: Actor, clientId: string): Promise<TransformationIndexRecord | null> {
    this.assertProgressRead(actor, clientId);
    return this.repo.latestTransformationIndex(clientId);
  }

  /**
   * Read-authorization for Transformation Progress. Internal roles read any
   * client's progress (`transformation.read`); a client role reads ONLY its own
   * (`own.transformation.read` + client-scope). RLS enforces the same at the DB.
   */
  private assertProgressRead(actor: Actor, clientId: string): void {
    if (isClientRole(actor.role)) {
      assertCapability(actor, "own.transformation.read");
      assertOwnClient(actor, clientId);
    } else {
      assertCapability(actor, CAP.read);
    }
  }

  /* ---- internal helpers -------------------------------------------------- */

  private require<T>(entity: string, value: T | null, id: string): T {
    if (value === null || value === undefined) throw new NotFoundError(entity, id);
    return value;
  }

  private async requireGrantedApprovalForMove(approvalId: string, moveId: string, clientId: string): Promise<Approval> {
    const approval = await this.repo.getApproval(approvalId);
    if (
      !approval ||
      approval.subjectType !== "move" ||
      approval.subjectId !== moveId ||
      approval.clientId !== clientId ||
      approval.decision !== "granted"
    ) {
      throw new ApprovalRequiredError(moveId);
    }
    return approval;
  }

  /** Shared guarded-transition path: capability → guard → persist → audit → event. */
  private async guarded<T extends { status: string; id: string }>(
    actor: Actor,
    capability: string,
    machine: Parameters<typeof assertTransition>[0],
    current: { status: string; clientId: string | null },
    to: string,
    setter: (to: string) => Promise<T>,
    eventName: TransformationEventName,
    reason?: string,
  ): Promise<T> {
    assertCapability(actor, capability);
    assertTransition(machine, current.status, to);
    const at = this.clock();
    const updated = await setter(to);
    await this.repo.appendTransition(
      transition({ machine, entityId: updated.id, from: current.status, to, actorId: actor.userId, reason: reason ?? null }, () => at),
    );
    await this.emit(eventName, actor, current.clientId, at, { from: current.status, to });
    return updated;
  }

  private async emit(
    name: TransformationEventName,
    actor: Actor,
    clientId: string | null,
    at: string,
    props?: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    await emitTransformation(this.events, name, { actorId: actor.userId, clientId, at, props });
  }
}

/** Factory — mirrors the repository/service construction style used elsewhere. */
export function createTransformationService(deps: TransformationServiceDeps): TransformationService {
  return new TransformationService(deps);
}
