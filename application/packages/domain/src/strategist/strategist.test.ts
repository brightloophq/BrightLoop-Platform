/* =============================================================================
 * AI Strategist domain tests (Phase E · Sprint E3).
 *
 * Session lifecycle, priority + confidence scoring, roadmap generation,
 * clarification questions, and structured-strategy validation — all pure.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { CONFIDENCE_THRESHOLD, calculateConfidence, calculatePriority, levelToScore } from "./scoring.js";
import { buildRecommendation, buildSession, canTransitionStrategy } from "./session.js";
import { buildRoadmap, generateClarifications, validateStrategy } from "./roadmap.js";
import type { StrategyRecommendation } from "@brightloop/schema";

const T0 = "2026-07-27T00:00:00.000Z";

describe("session lifecycle", () => {
  it("enforces the state machine", () => {
    expect(canTransitionStrategy("draft", "analyzing")).toBe(true);
    expect(canTransitionStrategy("analyzing", "completed")).toBe(true);
    expect(canTransitionStrategy("failed", "analyzing")).toBe(true);
    expect(canTransitionStrategy("completed", "analyzing")).toBe(false);
    expect(canTransitionStrategy("archived", "analyzing")).toBe(false);
  });
  it("builds a draft session", () => {
    const s = buildSession({ id: "ss_1", workspaceId: "w", clientId: "c", title: "Growth strategy", goal: "grow", requestedByUserId: "u", now: T0 });
    expect(s.status).toBe("draft");
    expect(s.confidence).toBe(0);
  });
});

describe("priority scoring", () => {
  it("weights factors and inverts effort", () => {
    const high = calculatePriority({ businessImpact: 100, implementationEffort: 0, urgency: 100, riskReduction: 100, customerValue: 100, strategicAlignment: 100, automationPotential: 100 });
    expect(high).toBe(100);
    const lowEffortPenalty = calculatePriority({ businessImpact: 50, implementationEffort: 100, urgency: 50, riskReduction: 50, customerValue: 50, strategicAlignment: 50, automationPotential: 50 });
    const highEffortEase = calculatePriority({ businessImpact: 50, implementationEffort: 0, urgency: 50, riskReduction: 50, customerValue: 50, strategicAlignment: 50, automationPotential: 50 });
    expect(highEffortEase).toBeGreaterThan(lowEffortPenalty); // less effort → higher priority
    expect(levelToScore("high")).toBe(90);
  });
});

describe("confidence scoring", () => {
  it("never fabricates certainty when there is no evidence", () => {
    const none = calculateConfidence({ requestedDimensions: ["sales", "marketing"], coveredDimensions: [], evidenceCount: 0 });
    expect(none.value).toBeLessThanOrEqual(30);
    expect(none.missingInformation.sort()).toEqual(["marketing", "sales"]);
  });
  it("rises with coverage + evidence", () => {
    const good = calculateConfidence({ requestedDimensions: ["sales", "marketing"], coveredDimensions: ["sales", "marketing"], evidenceCount: 6 });
    expect(good.value).toBeGreaterThan(CONFIDENCE_THRESHOLD);
    expect(good.missingInformation).toEqual([]);
  });
});

describe("roadmap + clarifications + validation", () => {
  const rec = (id: string, priority: number): StrategyRecommendation => buildRecommendation({ id, sessionId: "ss", workspaceId: "w", clientId: "c", title: `Rec ${id}`, priority, confidence: 70, order: 0, now: T0 });
  it("splits prioritized recommendations across 3 phases (highest first)", () => {
    const roadmap = buildRoadmap([rec("a", 30), rec("b", 90), rec("c", 60), rec("d", 10), rec("e", 80), rec("f", 50)]);
    expect(roadmap.length).toBe(3);
    expect(roadmap[0]!.initiatives[0]).toBe("Rec b"); // 90 is highest
    expect(roadmap[0]!.phase).toBe(1);
  });
  it("generates clarification questions for missing dimensions", () => {
    const qs = generateClarifications(["sales", "technology"]);
    expect(qs.length).toBe(2);
    expect(qs[0]!.question).toMatch(/CRM/);
    expect(qs[0]!.dimension).toBe("sales");
  });
  it("validates completeness + citation coverage", () => {
    const ok = validateStrategy({ executiveSummary: "S", findingCount: 2, recommendations: [{ priority: 80, confidence: 70 }], citedRecommendationIds: new Set(["r1"]), recommendationIds: ["r1"], allowModelGenerated: false });
    expect(ok.ok).toBe(true);
    const bad = validateStrategy({ executiveSummary: "", findingCount: 0, recommendations: [{ priority: 150, confidence: 70 }], citedRecommendationIds: new Set(), recommendationIds: ["r1"], allowModelGenerated: false });
    expect(bad.ok).toBe(false);
    expect(bad.issues.length).toBeGreaterThan(1);
    const modelGen = validateStrategy({ executiveSummary: "S", findingCount: 1, recommendations: [{ priority: 80, confidence: 70 }], citedRecommendationIds: new Set(), recommendationIds: ["r1"], allowModelGenerated: true });
    expect(modelGen.ok).toBe(true); // uncited allowed when explicitly model-generated
  });
});
