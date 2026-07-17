import { describe, it, expect } from "vitest";
import type { Recommendation, Signal, Approval, Move, ExecutionRecord } from "@brightloop/schema";
import {
  signalRow, toSignal,
  recommendationRow, toRecommendation,
  approvalRow, toApproval,
  moveRow, toMove,
  executionRow, toExecutionRecord,
} from "./mappers.js";

const NOW = "2026-07-17T00:00:00.000Z";

describe("transformation mappers — domain ⇄ row round-trip", () => {
  it("signal survives domain → row → domain", () => {
    const s: Signal = {
      id: "sig_1", clientId: "cli_A", title: "slip", detail: null, status: "detected",
      sourceRef: "metric:x", evidence: [{ kind: "metric", ref: "x", label: "X" }],
      createdBy: "usr_1", createdAt: NOW,
    };
    expect(toSignal(signalRow(s))).toEqual(s);
  });

  it("recommendation with NO AI provenance round-trips to null (human-authored)", () => {
    const r: Recommendation = {
      id: "rec_1", clientId: "cli_A", insightId: "ins_1", summary: "s", rationale: "r",
      expectedOutcome: null, status: "proposed", evidence: [], confidence: null,
      aiProvenance: null, createdBy: "usr_1", createdAt: NOW,
    };
    const back = toRecommendation(recommendationRow(r));
    expect(back.aiProvenance).toBeNull();
    expect(back).toMatchObject({ id: "rec_1", summary: "s", rationale: "r" });
  });

  it("recommendation AI provenance survives the ai_* column split", () => {
    const r: Recommendation = {
      id: "rec_2", clientId: "cli_A", insightId: "ins_1", summary: "s", rationale: "r",
      expectedOutcome: null, status: "proposed", evidence: [], confidence: 0.5,
      aiProvenance: { modelId: "m", promptVersion: "v1", generatedAt: NOW, confidence: 0.72 },
      createdBy: "usr_1", createdAt: NOW,
    };
    const back = toRecommendation(recommendationRow(r));
    expect(back.aiProvenance?.modelId).toBe("m");
    expect(back.aiProvenance?.promptVersion).toBe("v1");
    expect(back.aiProvenance?.confidence).toBe(0.72);
  });

  it("approval, move, and execution record round-trip", () => {
    const a: Approval = {
      id: "apr_1", clientId: "cli_A", subjectType: "move", subjectId: "mov_1", decision: "granted",
      approverUserId: "usr_1", reason: "ok", requestedAt: NOW, decidedAt: NOW, createdBy: "usr_1", createdAt: NOW,
    };
    expect(toApproval(approvalRow(a))).toEqual(a);

    const mv: Move = {
      id: "mov_1", clientId: "cli_A", title: "t", intent: "i", expectedOutcome: null, status: "approved",
      recommendationId: null, approvalId: "apr_1", createdBy: "usr_1", createdAt: NOW,
    };
    expect(toMove(moveRow(mv))).toEqual(mv);

    const ex: ExecutionRecord = {
      id: "exe_1", clientId: "cli_A", moveId: "mov_1", status: "queued", idempotencyKey: "k1",
      attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdBy: "usr_1", createdAt: NOW,
    };
    expect(toExecutionRecord(executionRow(ex))).toEqual(ex);
  });
});
