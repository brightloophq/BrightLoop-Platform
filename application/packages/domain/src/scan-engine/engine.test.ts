import { describe, it, expect } from "vitest";
import {
  ENGINE_VERBS,
  ENGINE_LAWS,
  engineLayerSchema,
  engineStageSchema,
  evidenceSourceSchema,
  EVIDENCE_SOURCE_DEFAULT_STATE,
  reasoningStageSchema,
  indexDimensionSchema,
  INDEX_DIMENSION_WEIGHTS,
  recommendationTierSchema,
  proposalPartSchema,
  monitoringChannelSchema,
  competitorSignalSchema,
  confidenceFactorSchema,
  engineMoveSchema,
  businessHealthIndexSchema,
  evidenceSignalSchema,
  engineConfidenceSchema,
  type EngineMove,
  type DimensionScore,
  type EngineConfidence,
} from "@brightloop/schema";
import {
  ENGINE_PIPELINE,
  ENGINE_STAGE_KIND,
  ENGINE_STAGE_LAYER,
  nextEngineStage,
  canTransition,
  isEngineTerminal,
  isArtifactStage,
  backoffDelayMs,
  shouldRetry,
  DEFAULT_STAGE_POLICY,
} from "./orchestration/index.js";
import { REASONING_STRATEGY, nextReasoningStage, canAdvanceReasoning, isReasoningComplete, computeConfidence } from "./reasoning/index.js";
import { computeIndex, indexWeightsSumTo100 } from "./graph/index.js";
import { sortMoves, groupByTier, isCriticalRisk } from "./recommendation/index.js";
import { defaultStateForSource, isUnavailableByDefault, classifySignal } from "./evidence/index.js";
import { unbackedMoveIds, PROPOSAL_PARTS } from "./proposal/index.js";
import { classifyChange, diffDimension, MONITORING_CHANNELS } from "./monitoring/index.js";
import { orderProviders, type ProviderCandidate, type RoutingCriteria } from "./provider-router.js";

const full: EngineConfidence = computeConfidence({ coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1 });
const move = (over: Partial<EngineMove> = {}): EngineMove =>
  engineMoveSchema.parse({ id: "mv_1", scanId: "s1", tier: "quick_win", title: "t", evidenceIds: ["ev_1"], reason: "r", impact: 50, difficulty: 20, confidence: full, ...over });
const dim = (dimension: DimensionScore["dimension"], score: number): DimensionScore =>
  ({ dimension, score, confidence: full, evidenceIds: [] });

/* ---- canonical constant counts (PDF 27) ----------------------------------- */
describe("canonical vocabulary counts (PDF 27)", () => {
  it("6 verbs · 7 laws · 8 layers · 13 stages", () => {
    expect(ENGINE_VERBS).toHaveLength(6);
    expect(ENGINE_LAWS).toHaveLength(7);
    expect(engineLayerSchema.options).toHaveLength(8);
    expect(engineStageSchema.options).toHaveLength(13);
  });
  it("19 sources · 6 reasoning stages · 10 dimensions · 4 tiers · 6 proposal parts · 6 monitoring channels · 8 competitor signals · 5 confidence factors", () => {
    expect(evidenceSourceSchema.options).toHaveLength(19);
    expect(reasoningStageSchema.options).toHaveLength(6);
    expect(indexDimensionSchema.options).toHaveLength(10);
    expect(recommendationTierSchema.options).toHaveLength(4);
    expect(proposalPartSchema.options).toHaveLength(6);
    expect(monitoringChannelSchema.options).toHaveLength(6);
    expect(competitorSignalSchema.options).toHaveLength(8);
    expect(confidenceFactorSchema.options).toHaveLength(5);
  });
});

/* ---- 13-stage pipeline state machine -------------------------------------- */
describe("engine pipeline (13-stage state machine)", () => {
  it("starts at website_url, ends at monitoring, in canonical order", () => {
    expect(ENGINE_PIPELINE).toHaveLength(13);
    expect(ENGINE_PIPELINE[0]).toBe("website_url");
    expect(ENGINE_PIPELINE.at(-1)).toBe("monitoring");
  });
  it("advances one stage at a time and only legal transitions pass", () => {
    expect(nextEngineStage("website_url")).toBe("discovery");
    expect(nextEngineStage("ai_reasoning")).toBe("intelligence_graph");
    expect(nextEngineStage("monitoring")).toBeNull();
    expect(canTransition("crawler", "evidence_collection")).toBe(true);
    expect(canTransition("crawler", "proposal")).toBe(false); // no stage skipping
    expect(isEngineTerminal("monitoring")).toBe(true);
  });
  it("every stage has a kind, and every non-input stage maps to one of the 8 layers", () => {
    for (const s of ENGINE_PIPELINE) {
      expect(ENGINE_STAGE_KIND[s]).toBeDefined();
      if (s !== "website_url") expect(engineLayerSchema.options).toContain(ENGINE_STAGE_LAYER[s]);
    }
    expect(isArtifactStage("business_profile")).toBe(true);
    expect(isArtifactStage("crawler")).toBe(false);
  });
});

/* ---- 6-stage reasoning strategy ------------------------------------------- */
describe("reasoning strategy (6-stage machine)", () => {
  it("runs planner → … → proposal_writing", () => {
    expect(REASONING_STRATEGY[0]).toBe("planner");
    expect(REASONING_STRATEGY.at(-1)).toBe("proposal_writing");
    expect(nextReasoningStage("planner")).toBe("research");
    expect(nextReasoningStage("proposal_writing")).toBeNull();
    expect(canAdvanceReasoning("research", "evidence_validation")).toBe(true);
    expect(canAdvanceReasoning("research", "proposal_writing")).toBe(false);
    expect(isReasoningComplete("proposal_writing")).toBe(true);
  });
});

/* ---- confidence model (pure) ---------------------------------------------- */
describe("computeConfidence (geometric mean; any factor near zero caps)", () => {
  it("all factors 1 → 100; all 0 → 0", () => {
    expect(computeConfidence({ coverage: 1, reliability: 1, freshness: 1, agreement: 1, completeness: 1 }).value).toBe(100);
    expect(computeConfidence({ coverage: 0, reliability: 0, freshness: 0, agreement: 0, completeness: 0 }).value).toBe(0);
  });
  it("a single zero factor caps the composite at 0", () => {
    expect(computeConfidence({ coverage: 0, reliability: 1, freshness: 1, agreement: 1, completeness: 1 }).value).toBe(0);
  });
  it("is deterministic and bounded 0–100", () => {
    const c = computeConfidence({ coverage: 0.8, reliability: 0.9, freshness: 0.7, agreement: 0.6, completeness: 0.5 });
    expect(c).toEqual(computeConfidence({ coverage: 0.8, reliability: 0.9, freshness: 0.7, agreement: 0.6, completeness: 0.5 }));
    expect(c.value).toBeGreaterThanOrEqual(0);
    expect(c.value).toBeLessThanOrEqual(100);
    expect(engineConfidenceSchema.parse(c)).toEqual(c);
  });
});

/* ---- Business Health Index (pure) ----------------------------------------- */
describe("computeIndex (10 weighted dimensions)", () => {
  it("weights sum to exactly 100", () => {
    expect(indexWeightsSumTo100()).toBe(true);
    expect(indexDimensionSchema.options.reduce((s, d) => s + INDEX_DIMENSION_WEIGHTS[d], 0)).toBe(100);
  });
  it("full coverage: weighted average across all ten dimensions", () => {
    const scores = indexDimensionSchema.options.map((d) => dim(d, 80));
    const idx = computeIndex(scores, "2026-07-19T00:00:00Z");
    expect(idx.value).toBe(80);
    expect(idx.coverage).toBe(1);
    expect(businessHealthIndexSchema.parse(idx)).toEqual(idx);
  });
  it("partial coverage: normalizes by covered weight and reports coverage", () => {
    const idx = computeIndex([dim("sales", 100)], "2026-07-19T00:00:00Z"); // sales weight 14
    expect(idx.value).toBe(100); // normalized by present weight
    expect(idx.coverage).toBeCloseTo(0.14, 5);
  });
  it("weights each dimension: sales(14)=100 + brand(8)=0 → 100*14/(14+8)=64", () => {
    const idx = computeIndex([dim("sales", 100), dim("brand", 0)], "2026-07-19T00:00:00Z");
    expect(idx.value).toBe(64);
  });
  it("ignores duplicate dimensions (first wins) and empty → 0", () => {
    const idx = computeIndex([dim("sales", 100), dim("sales", 0)], "t");
    expect(idx.value).toBe(100);
    expect(computeIndex([], "t").value).toBe(0);
  });
});

/* ---- recommendation tiering (pure) ---------------------------------------- */
describe("sortMoves (critical risks outrank optimization)", () => {
  it("critical risks come first regardless of impact/effort", () => {
    const quickHigh = move({ id: "a", tier: "quick_win", impact: 99, difficulty: 1 });
    const critLow = move({ id: "b", tier: "critical_risk", impact: 10, difficulty: 99 });
    expect(sortMoves([quickHigh, critLow])[0]!.id).toBe("b");
    expect(isCriticalRisk(critLow)).toBe(true);
  });
  it("within a group: higher impact, then lower difficulty, then id — deterministic", () => {
    const m1 = move({ id: "m1", tier: "medium_win", impact: 50, difficulty: 30 });
    const m2 = move({ id: "m2", tier: "medium_win", impact: 80, difficulty: 40 });
    const m3 = move({ id: "m3", tier: "medium_win", impact: 80, difficulty: 20 });
    const ordered = sortMoves([m1, m2, m3]).map((m) => m.id);
    expect(ordered).toEqual(["m3", "m2", "m1"]); // impact desc, then difficulty asc
    expect(sortMoves([m1, m2, m3])).toEqual(sortMoves([m3, m1, m2])); // order-independent
  });
  it("groupByTier buckets all four tiers", () => {
    const g = groupByTier([move({ tier: "critical_risk", evidenceIds: ["e"] }), move({ tier: "quick_win", evidenceIds: ["e"] })]);
    expect(g.critical_risk).toHaveLength(1);
    expect(g.quick_win).toHaveLength(1);
    expect(g.strategic_win).toHaveLength(0);
  });
});

/* ---- move contract (seven attributes; must cite evidence) ----------------- */
describe("engineMoveSchema (7 attributes, evidence mandatory)", () => {
  it("accepts a fully-attributed, evidence-linked move", () => {
    expect(() => move()).not.toThrow();
  });
  it("rejects a move with no evidence (Law: cite_everything)", () => {
    expect(() => move({ evidenceIds: [] })).toThrow();
  });
});

/* ---- evidence classification (pure, 19 sources) --------------------------- */
describe("evidence classification", () => {
  it("every one of the 19 sources has a canonical default state", () => {
    for (const s of evidenceSourceSchema.options) {
      expect(["observed", "estimated", "inferred", "unavailable"]).toContain(EVIDENCE_SOURCE_DEFAULT_STATE[s]);
      expect(defaultStateForSource(s)).toBe(EVIDENCE_SOURCE_DEFAULT_STATE[s]);
    }
  });
  it("canonical anchors: website=observed, brand=inferred, competitors=estimated, analytics=unavailable", () => {
    expect(defaultStateForSource("website")).toBe("observed");
    expect(defaultStateForSource("brand")).toBe("inferred");
    expect(defaultStateForSource("competitors")).toBe("estimated");
    expect(isUnavailableByDefault("analytics")).toBe(true);
    expect(isUnavailableByDefault("website")).toBe(false);
  });
  it("classifySignal defaults state from source and validates", () => {
    const sig = classifySignal({ id: "ev1", scanId: "s1", source: "brand", dimension: null, observedAt: "t", reliability: 0.5, freshnessDays: null, sourceUrl: null, providerId: null, value: {}, note: null });
    expect(sig.state).toBe("inferred"); // brand default
    expect(evidenceSignalSchema.parse(sig)).toEqual(sig);
  });
});

/* ---- background policy (pure) --------------------------------------------- */
describe("background retry/backoff policy", () => {
  it("exponential backoff, then null when attempts exhaust", () => {
    expect(backoffDelayMs(1)).toBe(1000);
    expect(backoffDelayMs(2)).toBe(2000);
    expect(backoffDelayMs(3)).toBe(4000);
    expect(backoffDelayMs(DEFAULT_STAGE_POLICY.maxAttempts + 1)).toBeNull();
    expect(shouldRetry(1)).toBe(true);
    expect(shouldRetry(DEFAULT_STAGE_POLICY.maxAttempts)).toBe(false);
  });
});

/* ---- provider router (pure, vendor-agnostic) ------------------------------ */
describe("orderProviders (runtime selection, no vendor names)", () => {
  const criteria: RoutingCriteria = { task: "reasoning", minContextTokens: 8000, budgetPerMTokens: 10, needsDeepReasoning: true, maxLatencyMs: 5000 };
  const cand = (over: Partial<ProviderCandidate>): ProviderCandidate =>
    ({ id: "p", healthy: true, rateLimitHeadroom: 0.5, costPerMTokens: 5, maxContextTokens: 100000, reasoningQuality: 0.8, typicalLatencyMs: 1000, ...over });
  it("filters unhealthy / over-budget / too-small-context / too-slow / rate-limited", () => {
    const out = orderProviders(
      [
        cand({ id: "ok" }),
        cand({ id: "down", healthy: false }),
        cand({ id: "pricey", costPerMTokens: 999 }),
        cand({ id: "tiny", maxContextTokens: 1000 }),
        cand({ id: "slow", typicalLatencyMs: 999999 }),
        cand({ id: "throttled", rateLimitHeadroom: 0 }),
      ],
      criteria,
    ).map((c) => c.id);
    expect(out).toEqual(["ok"]);
  });
  it("ranks by reasoning quality → cost → latency → id (deterministic fallback set)", () => {
    const out = orderProviders([cand({ id: "b", reasoningQuality: 0.7 }), cand({ id: "a", reasoningQuality: 0.9 })], criteria).map((c) => c.id);
    expect(out).toEqual(["a", "b"]);
  });
});

/* ---- monitoring change detection (pure) ----------------------------------- */
describe("monitoring change classification", () => {
  it("dead-band suppresses noise; direction is signed", () => {
    expect(classifyChange(50, 50)).toBe("unchanged");
    expect(classifyChange(50, 51)).toBe("unchanged"); // within default deadband 1
    expect(classifyChange(50, 60)).toBe("improved");
    expect(classifyChange(60, 50)).toBe("declined");
    expect(diffDimension("sales", 40, 55).delta).toBe(15);
    expect(MONITORING_CHANNELS).toHaveLength(6);
  });
});

/* ---- proposal guard (pure) ------------------------------------------------ */
describe("proposal only assembles evidence-linked moves", () => {
  it("flags unbacked moves; PROPOSAL_PARTS has six parts", () => {
    const good = move({ evidenceIds: ["e"] });
    // bypass the schema guard to simulate an upstream contract violation
    const bad = { ...good, id: "bad", evidenceIds: [] as string[] } as EngineMove;
    expect(unbackedMoveIds([good, bad])).toEqual(["bad"]);
    expect(PROPOSAL_PARTS).toHaveLength(6);
  });
});
