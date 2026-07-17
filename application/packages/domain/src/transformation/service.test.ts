import { describe, it, expect, beforeEach } from "vitest";
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
import type { Actor } from "../capabilities.js";
import type { TransitionRecord } from "../guard.js";
import { InMemoryEventSink } from "../events.js";
import {
  AuthorizationError,
  TransitionError,
  ClientScopeError,
  ApprovalRequiredError,
  NotFoundError,
} from "../errors.js";
import type { TransformationRepository } from "./repository.js";
import { createTransformationService, type IdGen } from "./service.js";

/* ---- an in-memory repository implementing the port (test double) ---------- */

class InMemoryRepo implements TransformationRepository {
  signals = new Map<string, Signal>();
  insights = new Map<string, Insight>();
  recommendations = new Map<string, Recommendation>();
  approvals = new Map<string, Approval>();
  moves = new Map<string, Move>();
  executions = new Map<string, ExecutionRecord>();
  measurements = new Map<string, Measurement>();
  learnings = new Map<string, Learning>();
  risks = new Map<string, OperationalRisk>();
  knowledge = new Map<string, KnowledgeAsset>();
  health: BusinessHealthRecord[] = [];
  indices: TransformationIndexRecord[] = [];
  transitions: TransitionRecord[] = [];

  createSignal(r: Signal) { this.signals.set(r.id, r); return Promise.resolve(r); }
  getSignal(id: string) { return Promise.resolve(this.signals.get(id) ?? null); }
  setSignalStatus(id: string, status: Signal["status"]) { const s = { ...this.signals.get(id)!, status }; this.signals.set(id, s); return Promise.resolve(s); }

  createInsight(r: Insight) { this.insights.set(r.id, r); return Promise.resolve(r); }
  getInsight(id: string) { return Promise.resolve(this.insights.get(id) ?? null); }
  setInsightStatus(id: string, status: Insight["status"]) { const s = { ...this.insights.get(id)!, status }; this.insights.set(id, s); return Promise.resolve(s); }

  createRecommendation(r: Recommendation) { this.recommendations.set(r.id, r); return Promise.resolve(r); }
  getRecommendation(id: string) { return Promise.resolve(this.recommendations.get(id) ?? null); }
  setRecommendationStatus(id: string, status: Recommendation["status"]) { const s = { ...this.recommendations.get(id)!, status }; this.recommendations.set(id, s); return Promise.resolve(s); }

  createApproval(r: Approval) { this.approvals.set(r.id, r); return Promise.resolve(r); }
  getApproval(id: string) { return Promise.resolve(this.approvals.get(id) ?? null); }
  decideApproval(id: string, decision: "granted" | "denied", approverUserId: string, decidedAt: string, reason: string | null) {
    const a = { ...this.approvals.get(id)!, decision, approverUserId, decidedAt, reason };
    this.approvals.set(id, a); return Promise.resolve(a);
  }

  createMove(r: Move) { this.moves.set(r.id, r); return Promise.resolve(r); }
  getMove(id: string) { return Promise.resolve(this.moves.get(id) ?? null); }
  setMoveStatus(id: string, status: Move["status"], approvalId?: string | null) {
    const cur = this.moves.get(id)!;
    const mv = { ...cur, status, ...(approvalId !== undefined ? { approvalId } : {}) };
    this.moves.set(id, mv); return Promise.resolve(mv);
  }

  createExecutionRecord(r: ExecutionRecord) { this.executions.set(r.id, r); return Promise.resolve(r); }
  getExecutionRecord(id: string) { return Promise.resolve(this.executions.get(id) ?? null); }
  findExecutionByIdempotencyKey(key: string) {
    for (const e of this.executions.values()) if (e.idempotencyKey === key) return Promise.resolve(e);
    return Promise.resolve(null);
  }
  setExecutionStatus(id: string, status: ExecutionRecord["status"], patch: Partial<ExecutionRecord>) {
    const ex = { ...this.executions.get(id)!, status, ...patch };
    this.executions.set(id, ex); return Promise.resolve(ex);
  }

  createMeasurement(r: Measurement) { this.measurements.set(r.id, r); return Promise.resolve(r); }
  createLearning(r: Learning) { this.learnings.set(r.id, r); return Promise.resolve(r); }

  createOperationalRisk(r: OperationalRisk) { this.risks.set(r.id, r); return Promise.resolve(r); }
  getOperationalRisk(id: string) { return Promise.resolve(this.risks.get(id) ?? null); }
  setOperationalRiskStatus(id: string, status: OperationalRisk["status"]) { const s = { ...this.risks.get(id)!, status }; this.risks.set(id, s); return Promise.resolve(s); }

  createKnowledgeAsset(r: KnowledgeAsset) { this.knowledge.set(r.id, r); return Promise.resolve(r); }
  getKnowledgeAsset(id: string) { return Promise.resolve(this.knowledge.get(id) ?? null); }
  setKnowledgeAssetStatus(id: string, status: KnowledgeAsset["status"]) { const s = { ...this.knowledge.get(id)!, status }; this.knowledge.set(id, s); return Promise.resolve(s); }

  recordBusinessHealth(r: BusinessHealthRecord) { this.health.push(r); return Promise.resolve(r); }
  latestBusinessHealth(clientId: string) {
    const rows = this.health.filter((h) => h.clientId === clientId).sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
    return Promise.resolve(rows[0] ?? null);
  }
  recordTransformationIndex(r: TransformationIndexRecord) { this.indices.push(r); return Promise.resolve(r); }
  latestTransformationIndex(clientId: string) {
    const rows = this.indices.filter((t) => t.clientId === clientId).sort((a, b) => b.at.localeCompare(a.at));
    return Promise.resolve(rows[0] ?? null);
  }

  appendTransition(r: TransitionRecord) { this.transitions.push(r); return Promise.resolve(); }
}

/* ---- fixtures ------------------------------------------------------------- */

const owner: Actor = { userId: "usr_owner", role: "owner", clientId: null };
const strategist: Actor = { userId: "usr_admin", role: "admin", clientId: null };
const operator: Actor = { userId: "usr_ops", role: "team_member", clientId: null };
const clientA: Actor = { userId: "usr_a", role: "client_admin", clientId: "cli_A" };
const clientB: Actor = { userId: "usr_b", role: "client_admin", clientId: "cli_B" };

let n = 0;
const ids: IdGen = (prefix) => `${prefix}_${++n}`;
const clock = () => "2026-07-17T00:00:00.000Z";

let repo: InMemoryRepo;
let events: InMemoryEventSink;
function svc() {
  return createTransformationService({ repo, events, clock, ids });
}

beforeEach(() => {
  repo = new InMemoryRepo();
  events = new InMemoryEventSink();
  n = 0;
});

/* ========================================================================== */

describe("lifecycle transitions (valid + invalid)", () => {
  it("advances a signal along legal transitions and rejects illegal ones", async () => {
    const s = await svc().createSignal(operator, { clientId: "cli_A", title: "slip" });
    expect(s.status).toBe("detected");
    const v = await svc().transitionSignal(operator, s.id, "validated");
    expect(v.status).toBe("validated");
    // detected → prioritized (skipping validated) is illegal from the start
    const s2 = await svc().createSignal(operator, { clientId: "cli_A", title: "x" });
    await expect(svc().transitionSignal(operator, s2.id, "prioritized")).rejects.toBeInstanceOf(TransitionError);
  });

  it("records an audit transition row for every status change", async () => {
    const s = await svc().createSignal(operator, { clientId: "cli_A", title: "x" });
    await svc().transitionSignal(operator, s.id, "validated", "triaged");
    expect(repo.transitions).toHaveLength(1);
    expect(repo.transitions[0]).toMatchObject({ machine: "signal", from: "detected", to: "validated", actorId: "usr_ops", reason: "triaged" });
  });

  it("throws NotFound for a missing entity", async () => {
    await expect(svc().transitionSignal(operator, "sig_missing", "validated")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("authorization — unauthorized access denial", () => {
  it("a client role cannot create internal transformation records", async () => {
    await expect(svc().createSignal(clientA, { clientId: "cli_A", title: "x" })).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("an operator (team_member) cannot grant approvals — only a Strategist can", async () => {
    const move = await svc().createMove(operator, { clientId: "cli_A", title: "m", intent: "i" });
    const { approval } = await svc().submitMoveForApproval(operator, move.id);
    await expect(
      svc().decideApproval(operator, { approvalId: approval.id, decision: "granted" }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    // a Strategist (admin) can
    const granted = await svc().decideApproval(strategist, { approvalId: approval.id, decision: "granted" });
    expect(granted.decision).toBe("granted");
  });
});

describe("tenant isolation — cross-tenant denial", () => {
  it("a client cannot read another org's business health; can read its own", async () => {
    await svc().recordBusinessHealth(owner, { clientId: "cli_A", dimensions: { ops: 50 }, score: 50 });
    await svc().recordBusinessHealth(owner, { clientId: "cli_B", dimensions: { ops: 60 }, score: 60 });
    // client A reading B → denied
    await expect(svc().getLatestBusinessHealth(clientA, "cli_B")).rejects.toBeInstanceOf(ClientScopeError);
    // client A reading own → ok
    const own = await svc().getLatestBusinessHealth(clientA, "cli_A");
    expect(own?.score).toBe(50);
    // internal owner reads any client
    expect((await svc().getLatestBusinessHealth(owner, "cli_B"))?.score).toBe(60);
  });

  it("client B cannot read client A's transformation index", async () => {
    await svc().recordTransformationIndex(owner, { clientId: "cli_A", value: 12 });
    await expect(svc().getLatestTransformationIndex(clientB, "cli_A")).rejects.toBeInstanceOf(ClientScopeError);
  });
});

describe("approval gate — a Move cannot execute without a granted human approval", () => {
  async function moveReadyForApproval() {
    const move = await svc().createMove(operator, { clientId: "cli_A", title: "triage", intent: "cut time" });
    const { approval } = await svc().submitMoveForApproval(operator, move.id);
    return { moveId: move.id, approvalId: approval.id };
  }

  it("execute is blocked with no approval linked", async () => {
    const move = await svc().createMove(operator, { clientId: "cli_A", title: "m", intent: "i" });
    await expect(svc().executeMove(operator, move.id)).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it("execute is blocked when the approval is denied", async () => {
    const { moveId, approvalId } = await moveReadyForApproval();
    await svc().decideApproval(strategist, { approvalId, decision: "denied" });
    await expect(svc().approveMove(operator, moveId, approvalId)).rejects.toBeInstanceOf(ApprovalRequiredError);
  });

  it("execute succeeds only after a granted approval is linked, and traverses the full cycle", async () => {
    const { moveId, approvalId } = await moveReadyForApproval();
    await svc().decideApproval(strategist, { approvalId, decision: "granted" });
    const approved = await svc().approveMove(operator, moveId, approvalId);
    expect(approved.status).toBe("approved");
    expect(approved.approvalId).toBe(approvalId);
    const executing = await svc().executeMove(operator, moveId);
    expect(executing.status).toBe("executing");
    expect((await svc().completeMove(operator, moveId)).status).toBe("completed");
    expect((await svc().markMoveMeasured(operator, moveId)).status).toBe("measured");
  });

  it("cannot link an approval belonging to a different move", async () => {
    const { approvalId } = await moveReadyForApproval();
    await svc().decideApproval(strategist, { approvalId, decision: "granted" });
    const other = await svc().createMove(operator, { clientId: "cli_A", title: "other", intent: "x" });
    await expect(svc().approveMove(operator, other.id, approvalId)).rejects.toBeInstanceOf(ApprovalRequiredError);
  });
});

describe("actor attribution — records name their acting human", () => {
  it("createdBy is the acting user, not client-supplied", async () => {
    const s = await svc().createSignal(operator, { clientId: "cli_A", title: "x" });
    expect(s.createdBy).toBe("usr_ops");
  });

  it("an approval is attributed to the approver and cannot be forged for another actor", async () => {
    const move = await svc().createMove(operator, { clientId: "cli_A", title: "m", intent: "i" });
    const { approval } = await svc().submitMoveForApproval(operator, move.id);
    const decided = await svc().decideApproval(strategist, { approvalId: approval.id, decision: "granted" });
    expect(decided.approverUserId).toBe("usr_admin"); // = the acting Strategist, always
    expect(decided.decidedAt).toBe("2026-07-17T00:00:00.000Z");
  });
});

describe("idempotency — duplicate execution is safe", () => {
  it("the same idempotency key returns the same run and creates no duplicate", async () => {
    const a = await svc().startExecution(operator, { clientId: "cli_A", moveId: "mov_x", idempotencyKey: "k1" });
    const b = await svc().startExecution(operator, { clientId: "cli_A", moveId: "mov_x", idempotencyKey: "k1" });
    expect(b.id).toBe(a.id);
    expect(repo.executions.size).toBe(1);
  });

  it("no key means no idempotency (two distinct runs)", async () => {
    await svc().startExecution(operator, { clientId: "cli_A", moveId: "mov_x" });
    await svc().startExecution(operator, { clientId: "cli_A", moveId: "mov_x" });
    expect(repo.executions.size).toBe(2);
  });

  it("execution records follow their lifecycle (queued → running → failed → running)", async () => {
    const e = await svc().startExecution(operator, { clientId: "cli_A", moveId: "mov_x", idempotencyKey: "k9" });
    await svc().transitionExecution(operator, e.id, "running", { startedAt: clock() });
    const failed = await svc().transitionExecution(operator, e.id, "failed", { lastError: "boom", attempts: 1 });
    expect(failed.status).toBe("failed");
    expect(failed.attempts).toBe(1);
    await expect(svc().transitionExecution(operator, e.id, "succeeded")).rejects.toBeInstanceOf(TransitionError); // must retry via running
  });
});

describe("audit / analytics event emission", () => {
  it("emits a material event for each lifecycle change", async () => {
    const s = await svc().createSignal(operator, { clientId: "cli_A", title: "x" });
    await svc().transitionSignal(operator, s.id, "validated");
    expect(events.named("transformation.signal.detected")).toHaveLength(1);
    expect(events.named("transformation.signal.status_changed")).toHaveLength(1);
    const e = events.named("transformation.signal.detected")[0];
    expect(e).toMatchObject({ actorId: "usr_ops", clientId: "cli_A", source: "server" });
  });

  it("emits approval.requested and approval.decided", async () => {
    const move = await svc().createMove(operator, { clientId: "cli_A", title: "m", intent: "i" });
    const { approval } = await svc().submitMoveForApproval(operator, move.id);
    await svc().decideApproval(strategist, { approvalId: approval.id, decision: "granted" });
    expect(events.named("transformation.approval.requested")).toHaveLength(1);
    expect(events.named("transformation.approval.decided")).toHaveLength(1);
  });
});

describe("repository behavior", () => {
  it("persists and reads back through the port", async () => {
    const risk = await svc().createOperationalRisk(operator, {
      clientId: "cli_A", title: "single-vendor", severity: "high", likelihood: "possible",
    });
    expect(await repo.getOperationalRisk(risk.id)).toMatchObject({ id: risk.id, status: "identified" });
    const mitigated = await svc().transitionOperationalRisk(operator, risk.id, "assessed");
    expect(mitigated.status).toBe("assessed");
  });

  it("captures learnings and measurements (append-only)", async () => {
    const meas = await svc().recordMeasurement(operator, { clientId: "cli_A", moveId: "mov_1", metricKey: "days", observed: 6, target: 5, delta: -1 });
    expect(repo.measurements.get(meas.id)?.observed).toBe(6);
    const learning = await svc().captureLearning(operator, { clientId: "cli_A", summary: "triage helped", moveId: "mov_1", measurementId: meas.id });
    expect(repo.learnings.get(learning.id)?.summary).toBe("triage helped");
  });

  it("stores a platform-level knowledge asset (clientId null)", async () => {
    const asset = await svc().storeKnowledgeAsset(operator, { clientId: null, title: "playbook", kind: "playbook", body: "..." });
    expect(asset.clientId).toBeNull();
    expect(asset.status).toBe("draft");
  });
});

describe("human-created records without AI metadata", () => {
  it("a recommendation is valid and AI-free by default", async () => {
    const insight = await svc().createInsight(operator, { clientId: "cli_A", signalId: "sig_1", summary: "bottleneck" });
    const rec = await svc().createRecommendation(operator, {
      clientId: "cli_A", insightId: insight.id, summary: "add triage", rationale: "intake is the bottleneck",
    });
    expect(rec.aiProvenance).toBeNull();
    // the emitted event records it as not AI-assisted
    expect(events.named("transformation.recommendation.created")[0]?.payload["aiAssisted"]).toBe(false);
  });

  it("AI provenance is representable when present (still human-approved downstream)", async () => {
    const insight = await svc().createInsight(operator, { clientId: "cli_A", signalId: "sig_1", summary: "b" });
    const rec = await svc().createRecommendation(operator, {
      clientId: "cli_A", insightId: insight.id, summary: "s", rationale: "r",
      aiProvenance: { modelId: "m", promptVersion: "v1", generatedAt: clock(), confidence: 0.7 },
    });
    expect(rec.aiProvenance?.modelId).toBe("m");
  });
});
