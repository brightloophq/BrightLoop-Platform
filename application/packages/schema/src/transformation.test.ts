import { describe, it, expect } from "vitest";
import { can, isTerminal, nextStates, MACHINES } from "./machines.js";
import {
  signalSchema,
  signalCreateInputSchema,
  insightSchema,
  insightCreateInputSchema,
  recommendationSchema,
  approvalSchema,
  moveSchema,
  executionRecordSchema,
  measurementSchema,
  learningSchema,
  businessHealthRecordSchema,
  transformationIndexRecordSchema,
  operationalRiskSchema,
  knowledgeAssetSchema,
  aiProvenanceSchema,
  TRANSFORMATION_ENTITY_SCHEMAS,
} from "./transformation.js";

const NOW = "2026-07-17T00:00:00.000Z";

describe("transformation state machines", () => {
  it("signal: detected → validated → prioritized → archived, nothing skipped", () => {
    expect(can("signal", "detected", "validated")).toBe(true);
    expect(can("signal", "validated", "prioritized")).toBe(true);
    expect(can("signal", "detected", "prioritized")).toBe(false); // must validate first
    expect(isTerminal("signal", "archived")).toBe(true);
  });

  it("move: cannot skip approval or execution", () => {
    expect(can("move", "draft", "recommended")).toBe(true);
    expect(can("move", "approved", "executing")).toBe(true);
    expect(can("move", "draft", "executing")).toBe(false); // no execute without approval
    expect(can("move", "recommended", "executing")).toBe(false);
    expect(can("move", "executing", "measured")).toBe(false); // must complete then measure
    expect(nextStates("move", "completed")).toEqual(["measured"]);
  });

  it("approval: a decision is terminal and cannot be re-decided", () => {
    expect(can("approval", "pending", "granted")).toBe(true);
    expect(can("approval", "pending", "denied")).toBe(true);
    expect(isTerminal("approval", "granted")).toBe(true);
    expect(isTerminal("approval", "denied")).toBe(true);
    expect(can("approval", "granted", "denied")).toBe(false);
  });

  it("operationalRisk: treatment paths are explicit", () => {
    expect(can("operationalRisk", "identified", "assessed")).toBe(true);
    expect(can("operationalRisk", "assessed", "mitigating")).toBe(true);
    expect(can("operationalRisk", "mitigating", "mitigated")).toBe(true);
    expect(can("operationalRisk", "identified", "mitigated")).toBe(false); // must assess first
  });

  it("executionRecord: failure is retryable, success is terminal", () => {
    expect(can("executionRecord", "running", "failed")).toBe(true);
    expect(can("executionRecord", "failed", "running")).toBe(true); // retry
    expect(isTerminal("executionRecord", "succeeded")).toBe(true);
  });

  it("registers all eight new machines", () => {
    for (const m of [
      "signal",
      "insight",
      "recommendation",
      "approval",
      "move",
      "executionRecord",
      "operationalRisk",
      "knowledgeAsset",
    ] as const) {
      expect(MACHINES[m]).toBeDefined();
    }
  });
});

describe("transformation contracts — validation", () => {
  it("accepts a valid signal and rejects an invalid lifecycle value", () => {
    const base = {
      id: "sig_1",
      clientId: "cli_1",
      title: "Delivery time slipping",
      detail: null,
      status: "detected",
      sourceRef: "metric:avg_delivery_days",
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(signalSchema.safeParse(base).success).toBe(true);
    // evidence defaults to [] when omitted
    expect(signalSchema.parse(base).evidence).toEqual([]);
    // an invalid status must be rejected
    expect(signalSchema.safeParse({ ...base, status: "banana" }).success).toBe(false);
  });

  it("requires the tenant boundary (clientId) on transformation entities", () => {
    const noClient = {
      id: "sig_1",
      title: "x",
      detail: null,
      status: "detected",
      sourceRef: null,
      createdBy: null,
      createdAt: NOW,
    };
    expect(signalSchema.safeParse(noClient).success).toBe(false);
  });

  it("rejects invalid move lifecycle values", () => {
    const move = {
      id: "mov_1",
      clientId: "cli_1",
      title: "Add intake triage",
      intent: "Cut delivery time",
      expectedOutcome: null,
      status: "executing",
      recommendationId: null,
      approvalId: "apr_1",
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(moveSchema.safeParse(move).success).toBe(true);
    expect(moveSchema.safeParse({ ...move, status: "shipping" }).success).toBe(false);
  });

  it("treats Approval as a first-class record (decision enum, not a boolean)", () => {
    const approval = {
      id: "apr_1",
      clientId: "cli_1",
      subjectType: "move",
      subjectId: "mov_1",
      decision: "granted",
      approverUserId: "usr_1",
      reason: "Evidence supports the move",
      requestedAt: NOW,
      decidedAt: NOW,
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(approvalSchema.safeParse(approval).success).toBe(true);
    // a boolean is not a valid decision
    expect(approvalSchema.safeParse({ ...approval, decision: true }).success).toBe(false);
    // an unknown subject type is rejected
    expect(approvalSchema.safeParse({ ...approval, subjectType: "invoice" }).success).toBe(false);
  });

  it("makes AI provenance representable without making AI mandatory", () => {
    const human = {
      id: "rec_1",
      clientId: "cli_1",
      insightId: "ins_1",
      summary: "Add a triage step",
      rationale: "Intake is the bottleneck",
      expectedOutcome: null,
      status: "proposed",
      confidence: null,
      createdBy: "usr_1",
      createdAt: NOW,
    };
    // valid with no provenance (defaults to null)
    const parsed = recommendationSchema.parse(human);
    expect(parsed.aiProvenance).toBeNull();

    // valid with full provenance
    const withAi = {
      ...human,
      aiProvenance: {
        modelId: "model-x",
        promptVersion: "reco@1",
        generatedAt: NOW,
        confidence: 0.72,
      },
    };
    expect(recommendationSchema.safeParse(withAi).success).toBe(true);
    // provenance requires modelId + promptVersion when present
    expect(aiProvenanceSchema.safeParse({ generatedAt: NOW }).success).toBe(false);
    // confidence is bounded 0..1
    expect(
      aiProvenanceSchema.safeParse({
        modelId: "m",
        promptVersion: "v",
        generatedAt: NOW,
        confidence: 1.5,
      }).success,
    ).toBe(false);
  });

  it("supports evidence and source references", () => {
    const insight = {
      id: "ins_1",
      clientId: "cli_1",
      signalId: "sig_1",
      summary: "Intake bottleneck",
      detail: null,
      status: "generated",
      evidence: [
        { kind: "metric", ref: "avg_delivery_days", label: "Delivery time" },
        { kind: "conversation", ref: "msg_9" },
      ],
      confidence: 0.6,
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(insightSchema.safeParse(insight).success).toBe(true);
    // an unknown evidence kind is rejected
    expect(
      insightSchema.safeParse({
        ...insight,
        evidence: [{ kind: "vibes", ref: "x" }],
      }).success,
    ).toBe(false);
  });

  it("allows a Knowledge Asset to be platform-level (clientId = null)", () => {
    const shared = {
      id: "kna_1",
      clientId: null,
      title: "Intake triage playbook",
      kind: "playbook",
      body: "…",
      status: "published",
      sourceRef: null,
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(knowledgeAssetSchema.safeParse(shared).success).toBe(true);
    expect(knowledgeAssetSchema.safeParse({ ...shared, kind: "meme" }).success).toBe(false);
  });

  it("validates the append-only record entities (no lifecycle status)", () => {
    expect(
      measurementSchema.safeParse({
        id: "mea_1",
        clientId: "cli_1",
        moveId: "mov_1",
        metricKey: "avg_delivery_days",
        target: 5,
        observed: 6,
        delta: -1,
        unit: "days",
        measuredAt: NOW,
        createdBy: null,
        createdAt: NOW,
      }).success,
    ).toBe(true);

    expect(
      businessHealthRecordSchema.safeParse({
        id: "bhs_1",
        clientId: "cli_1",
        dimensions: { brand: 60, operations: 45 },
        score: 52.5,
        basis: null,
        capturedAt: NOW,
        createdAt: NOW,
      }).success,
    ).toBe(true);

    // score is bounded 0..100
    expect(
      businessHealthRecordSchema.safeParse({
        id: "bhs_2",
        clientId: "cli_1",
        dimensions: {},
        score: 140,
        basis: null,
        capturedAt: NOW,
        createdAt: NOW,
      }).success,
    ).toBe(false);

    expect(
      transformationIndexRecordSchema.safeParse({
        id: "tix_1",
        clientId: "cli_1",
        value: 12,
        delta: 3,
        basis: null,
        at: NOW,
        createdAt: NOW,
      }).success,
    ).toBe(true);

    expect(
      learningSchema.safeParse({
        id: "lrn_1",
        clientId: "cli_1",
        summary: "Triage cut time",
        detail: null,
        moveId: "mov_1",
        measurementId: "mea_1",
        capturedAt: NOW,
        createdBy: null,
        createdAt: NOW,
      }).success,
    ).toBe(true);
  });

  it("validates an execution record and an operational risk", () => {
    expect(
      executionRecordSchema.safeParse({
        id: "exe_1",
        clientId: "cli_1",
        moveId: "mov_1",
        status: "queued",
        attempts: 0,
        lastError: null,
        startedAt: null,
        finishedAt: null,
        createdBy: null,
        createdAt: NOW,
      }).success,
    ).toBe(true);

    const risk = {
      id: "rsk_1",
      clientId: "cli_1",
      title: "Single-vendor dependency",
      detail: null,
      status: "identified",
      severity: "high",
      likelihood: "possible",
      signalId: null,
      moveId: null,
      ownerUserId: "usr_1",
      createdBy: "usr_1",
      createdAt: NOW,
    };
    expect(operationalRiskSchema.safeParse(risk).success).toBe(true);
    expect(operationalRiskSchema.safeParse({ ...risk, severity: "apocalyptic" }).success).toBe(
      false,
    );
  });

  it("exposes all twelve entities in the registry", () => {
    expect(Object.keys(TRANSFORMATION_ENTITY_SCHEMAS).length).toBe(12);
  });

  describe("signalCreateInputSchema", () => {
    it("accepts a minimal valid input and normalizes blanks to null", () => {
      const parsed = signalCreateInputSchema.safeParse({ clientId: "cli_A", title: "  Delivery slipped  " });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.title).toBe("Delivery slipped"); // trimmed
        expect(parsed.data.detail).toBeNull();
        expect(parsed.data.sourceRef).toBeNull();
      }
    });
    it("requires an organization and a title", () => {
      expect(signalCreateInputSchema.safeParse({ clientId: "", title: "x" }).success).toBe(false);
      expect(signalCreateInputSchema.safeParse({ clientId: "cli_A", title: "   " }).success).toBe(false);
    });
    it("rejects an invalid evidence item", () => {
      const r = signalCreateInputSchema.safeParse({
        clientId: "cli_A",
        title: "ok",
        evidence: [{ kind: "not-a-kind", ref: "x" }],
      });
      expect(r.success).toBe(false);
    });
    it("accepts a valid evidence item", () => {
      const r = signalCreateInputSchema.safeParse({
        clientId: "cli_A",
        title: "ok",
        evidence: [{ kind: "metric", ref: "cycle_time", label: "Cycle time" }],
      });
      expect(r.success).toBe(true);
    });
  });

  describe("insightCreateInputSchema", () => {
    it("accepts a minimal valid input and normalizes blanks to null", () => {
      const parsed = insightCreateInputSchema.safeParse({
        clientId: "cli_A",
        signalId: "sig_1",
        summary: "  Delivery cost is structural  ",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.summary).toBe("Delivery cost is structural"); // trimmed
        expect(parsed.data.detail).toBeNull();
      }
    });
    it("requires a signal, an organization and a summary", () => {
      expect(insightCreateInputSchema.safeParse({ clientId: "cli_A", signalId: "", summary: "x" }).success).toBe(false);
      expect(insightCreateInputSchema.safeParse({ clientId: "", signalId: "sig_1", summary: "x" }).success).toBe(false);
      expect(insightCreateInputSchema.safeParse({ clientId: "cli_A", signalId: "sig_1", summary: "  " }).success).toBe(false);
    });
    it("bounds confidence to 0..1", () => {
      expect(insightCreateInputSchema.safeParse({ clientId: "cli_A", signalId: "sig_1", summary: "ok", confidence: 0.7 }).success).toBe(true);
      expect(insightCreateInputSchema.safeParse({ clientId: "cli_A", signalId: "sig_1", summary: "ok", confidence: 1.5 }).success).toBe(false);
      expect(insightCreateInputSchema.safeParse({ clientId: "cli_A", signalId: "sig_1", summary: "ok", confidence: null }).success).toBe(true);
    });
    it("rejects an invalid evidence item", () => {
      const r = insightCreateInputSchema.safeParse({
        clientId: "cli_A",
        signalId: "sig_1",
        summary: "ok",
        evidence: [{ kind: "not-a-kind", ref: "x" }],
      });
      expect(r.success).toBe(false);
    });
  });
});
