/* =============================================================================
 * Decision brief (Sprint 9 §11 · AIS-001 §14 Human Collaboration) — PURE.
 *
 * The review-ready, DATA-ONLY decision record: what to do, why, in what order,
 * what is blocked, what the alternatives look like, and what a human must approve
 * before anything proceeds. No UI, no PDF, no proposal copy — the surface layer
 * reads this contract later.
 * ========================================================================== */

import {
  FORMULA_VERSION,
  RECOMMENDATION_SCHEMA_VERSION,
  decisionBriefSchema,
  type DecisionBrief,
  type DecisionWeights,
  type DependencyAnalysis,
  type ExpectedValue,
  type RankingResult,
  type EngineRecommendation,
  type Scenario,
  type UncertaintyAssessment,
} from "@brightloop/schema";
import { DEFAULT_WEIGHTS } from "./priority.js";

export interface BuildBriefInput {
  id: string;
  scanId: string;
  pipelineRunId?: string | null;
  recommendations: readonly EngineRecommendation[];
  ranking: RankingResult;
  dependencies: DependencyAnalysis;
  scenarios?: readonly Scenario[];
  expectedValues?: ReadonlyMap<string, ExpectedValue>;
  uncertainties?: ReadonlyMap<string, UncertaintyAssessment>;
  weights?: DecisionWeights;
  topN?: number;
  now: string;
}

/** Assemble the decision brief from already-scored, already-ranked inputs. Pure. */
export function buildDecisionBrief(input: BuildBriefInput): DecisionBrief {
  const byId = new Map(input.recommendations.map((r) => [r.id, r]));
  const topN = input.topN ?? 5;
  const ordered = input.ranking.ranked.filter((r) => !r.blocked);
  const rec = (id: string) => byId.get(id);

  const highestPriority = ordered.slice(0, topN).map((r) => r.recommendationId);
  const criticalRisks = ordered.filter((r) => rec(r.recommendationId)?.tier === "critical_risk").map((r) => r.recommendationId);
  const quickWins = ordered.filter((r) => rec(r.recommendationId)?.tier === "quick_win").map((r) => r.recommendationId);
  const strategicInitiatives = ordered.filter((r) => rec(r.recommendationId)?.tier === "strategic_win").map((r) => r.recommendationId);
  const blockedItems = [...input.ranking.blocked].sort();

  // ---- expected-value summary (financial only when genuinely available)
  const evs = [...(input.expectedValues?.values() ?? [])];
  const totalConfidenceAdjustedValue = evs.reduce((acc, e) => acc + e.confidenceAdjustedExpectedValue, 0);
  const itemsWithoutFinancialData = evs.filter((e) => !e.financialAvailable).map((e) => e.recommendationId).sort();

  // ---- confidence summary
  const confidences = input.recommendations.map((r) => r.confidence.value);
  const mean = confidences.length === 0 ? 0 : Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  const lowest = confidences.length === 0 ? 0 : Math.min(...confidences);
  const lowConfidenceIds = input.recommendations.filter((r) => r.confidence.value < 50).map((r) => r.id).sort();

  // ---- evidence gaps + limitations, aggregated honestly
  const evidenceGaps = [
    ...new Set(
      [...(input.uncertainties?.values() ?? [])]
        .filter((u) => u.flags.includes("missing_evidence") || u.flags.includes("stale_evidence") || u.flags.includes("inferred_only"))
        .map((u) => `${u.recommendationId}: ${u.flags.join(", ")}`),
    ),
  ].sort();

  const limitations = [...new Set(input.recommendations.flatMap((r) => r.limitations))].sort();
  if (itemsWithoutFinancialData.length > 0) limitations.push("Financial expected value unavailable for one or more items; ROI is not estimated.");
  if (!input.dependencies.acyclic) limitations.push("A dependency cycle prevented a complete execution order.");

  // ---- every recommendation is human-gated (AIS-001 §14)
  const requiredHumanApprovals = input.recommendations.filter((r) => r.reviewRequired).map((r) => r.id).sort();

  const summary =
    `${ordered.length} actionable recommendation(s), ${blockedItems.length} blocked. ` +
    `${criticalRisks.length} critical risk(s), ${quickWins.length} quick win(s), ${strategicInitiatives.length} strategic initiative(s). ` +
    `Mean confidence ${mean}. All items require human approval before execution.`;

  return decisionBriefSchema.parse({
    id: input.id,
    scanId: input.scanId,
    pipelineRunId: input.pipelineRunId ?? null,
    generatedAt: input.now,
    executiveDecisionSummary: summary,
    highestPriority,
    criticalRisks,
    quickWins,
    strategicInitiatives,
    blockedItems,
    dependencySequence: input.dependencies.order,
    scenarioComparison: [...(input.scenarios ?? [])],
    expectedValueSummary: {
      totalConfidenceAdjustedValue,
      financialAvailable: evs.length > 0 && evs.every((e) => e.financialAvailable),
      itemsWithoutFinancialData,
    },
    confidenceSummary: { mean, lowest, lowConfidenceIds },
    evidenceGaps,
    limitations,
    requiredHumanApprovals,
    provenance: { scanId: input.scanId, pipelineRunId: input.pipelineRunId ?? null, recommendationCount: input.recommendations.length },
    modelVersions: { schemaVersion: RECOMMENDATION_SCHEMA_VERSION, formulaVersion: FORMULA_VERSION, weights: input.weights ?? DEFAULT_WEIGHTS },
  });
}
