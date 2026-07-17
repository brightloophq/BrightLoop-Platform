/* =============================================================================
 * Sprint 1C — Transformation schema verification (CONTRACT LAYER).
 *
 * These are the parts of the Sprint 1C checklist that are verifiable in pure TS,
 * without a database:
 *   - Item 8  : invalid lifecycle status values are rejected (all machine entities)
 *   - Item 11 : AI metadata is optional for human-created records
 *   - Item 7  : approval is a first-class actor+decision record (contract shape)
 *   - Item 9  : required relationship identifiers are enforced (contract shape)
 *
 * The database-level items (1–6, 10, 12, and the RLS/FK/CHECK enforcement of 7 & 9)
 * are covered by the pgTAP suite in `supabase/tests/transformation_rls_test.sql`,
 * which runs against a real Postgres via `supabase test db` (the live-DB harness).
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import type { ZodTypeAny } from "zod";
import { MACHINES } from "./machines.js";
import {
  signalSchema,
  insightSchema,
  recommendationSchema,
  approvalSchema,
  moveSchema,
  executionRecordSchema,
  operationalRiskSchema,
  knowledgeAssetSchema,
  TRANSFORMATION_ENTITY_SCHEMAS,
} from "./transformation.js";

const NOW = "2026-07-17T00:00:00.000Z";

/** Minimal valid fixtures for each machine-backed entity (status field named per contract). */
type Fixture = {
  schema: ZodTypeAny;
  base: Record<string, unknown>;
  statusField: string;
  machine: keyof typeof MACHINES;
};
const fixtures = {
  signal: {
    schema: signalSchema,
    statusField: "status",
    machine: "signal",
    base: { id: "sig_1", clientId: "cli_1", title: "t", detail: null, status: "detected", sourceRef: null, createdBy: null, createdAt: NOW },
  },
  insight: {
    schema: insightSchema,
    statusField: "status",
    machine: "insight",
    base: { id: "ins_1", clientId: "cli_1", signalId: "sig_1", summary: "s", detail: null, status: "generated", confidence: null, createdBy: null, createdAt: NOW },
  },
  recommendation: {
    schema: recommendationSchema,
    statusField: "status",
    machine: "recommendation",
    base: { id: "rec_1", clientId: "cli_1", insightId: "ins_1", summary: "s", rationale: "r", expectedOutcome: null, status: "proposed", confidence: null, createdBy: null, createdAt: NOW },
  },
  approval: {
    schema: approvalSchema,
    statusField: "decision",
    machine: "approval",
    base: { id: "apr_1", clientId: "cli_1", subjectType: "move", subjectId: "mov_1", decision: "pending", approverUserId: null, reason: null, requestedAt: NOW, decidedAt: null, createdBy: null, createdAt: NOW },
  },
  move: {
    schema: moveSchema,
    statusField: "status",
    machine: "move",
    base: { id: "mov_1", clientId: "cli_1", title: "t", intent: "i", expectedOutcome: null, status: "draft", recommendationId: null, approvalId: null, createdBy: null, createdAt: NOW },
  },
  executionRecord: {
    schema: executionRecordSchema,
    statusField: "status",
    machine: "executionRecord",
    base: { id: "exe_1", clientId: "cli_1", moveId: "mov_1", status: "queued", idempotencyKey: null, attempts: 0, lastError: null, startedAt: null, finishedAt: null, createdBy: null, createdAt: NOW },
  },
  operationalRisk: {
    schema: operationalRiskSchema,
    statusField: "status",
    machine: "operationalRisk",
    base: { id: "rsk_1", clientId: "cli_1", title: "t", detail: null, status: "identified", severity: "high", likelihood: "possible", signalId: null, moveId: null, ownerUserId: null, createdBy: null, createdAt: NOW },
  },
  knowledgeAsset: {
    schema: knowledgeAssetSchema,
    statusField: "status",
    machine: "knowledgeAsset",
    base: { id: "kna_1", clientId: "cli_1", title: "t", kind: "playbook", body: "b", status: "draft", sourceRef: null, createdBy: null, createdAt: NOW },
  },
} satisfies Record<string, Fixture>;

describe("1C·item 8 — invalid lifecycle status is rejected (every machine entity)", () => {
  for (const [name, { schema, base, statusField, machine }] of Object.entries(fixtures)) {
    it(`${name}: accepts each declared state, rejects an undeclared one`, () => {
      // every declared state parses
      for (const state of MACHINES[machine].states) {
        expect(schema.safeParse({ ...base, [statusField]: state }).success).toBe(true);
      }
      // an undeclared state is rejected
      expect(schema.safeParse({ ...base, [statusField]: "___not_a_state___" }).success).toBe(false);
    });
  }
});

describe("1C·item 11 — AI metadata is optional for human-created records", () => {
  const human = fixtures.recommendation.base;

  it("a human recommendation is valid with no AI provenance (defaults to null)", () => {
    const parsed = recommendationSchema.parse(human);
    expect(parsed.aiProvenance).toBeNull();
  });

  it("AI provenance is accepted when present and validated (model + prompt required, confidence 0..1)", () => {
    expect(
      recommendationSchema.safeParse({
        ...human,
        aiProvenance: { modelId: "m", promptVersion: "v1", generatedAt: NOW, confidence: 0.5 },
      }).success,
    ).toBe(true);
    // missing modelId/promptVersion → invalid
    expect(
      recommendationSchema.safeParse({ ...human, aiProvenance: { generatedAt: NOW } }).success,
    ).toBe(false);
    // out-of-range confidence → invalid
    expect(
      recommendationSchema.safeParse({
        ...human,
        aiProvenance: { modelId: "m", promptVersion: "v1", generatedAt: NOW, confidence: 2 },
      }).success,
    ).toBe(false);
  });
});

describe("1C·item 7 — approval is a first-class actor + decision record (contract shape)", () => {
  const base = fixtures.approval.base;

  it("decision is an enum, never a boolean", () => {
    expect(approvalSchema.safeParse({ ...base, decision: "granted", approverUserId: "usr_1", decidedAt: NOW }).success).toBe(true);
    expect(approvalSchema.safeParse({ ...base, decision: true }).success).toBe(false);
  });

  it("carries an approver identity and a decision timestamp field", () => {
    const decided = approvalSchema.parse({ ...base, decision: "granted", approverUserId: "usr_7", decidedAt: NOW });
    expect(decided.approverUserId).toBe("usr_7");
    expect(decided.decidedAt).toBe(NOW);
    // NOTE: the invariant "a *decided* approval must name approver + time" is enforced by the
    // DB CHECK `approvals_decided_complete` (see pgTAP). The contract permits the shape.
  });

  it("subject is bounded (only transformation subjects can be approved)", () => {
    expect(approvalSchema.safeParse({ ...base, subjectType: "operational_risk" }).success).toBe(true);
    expect(approvalSchema.safeParse({ ...base, subjectType: "invoice" }).success).toBe(false);
  });
});

describe("1C·item 9 — required relationship identifiers are enforced (contract shape)", () => {
  it("insight requires signalId; recommendation requires insightId; execution requires moveId", () => {
    const { signalId: _s, ...insightNoSignal } = fixtures.insight.base as Record<string, unknown>;
    expect(insightSchema.safeParse(insightNoSignal).success).toBe(false);

    const { insightId: _i, ...recoNoInsight } = fixtures.recommendation.base as Record<string, unknown>;
    expect(recommendationSchema.safeParse(recoNoInsight).success).toBe(false);

    const { moveId: _m, ...exeNoMove } = fixtures.executionRecord.base as Record<string, unknown>;
    expect(executionRecordSchema.safeParse(exeNoMove).success).toBe(false);
  });

  it("move relationships are optional where the Product Bible allows (direct moves)", () => {
    // recommendationId + approvalId may be null (a move can be created directly / not yet approved)
    expect(moveSchema.safeParse(fixtures.move.base).success).toBe(true);
  });

  it("all twelve transformation entities are registered", () => {
    expect(Object.keys(TRANSFORMATION_ENTITY_SCHEMAS)).toHaveLength(12);
  });
});
