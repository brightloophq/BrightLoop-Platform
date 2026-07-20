/* =============================================================================
 * Recommendation Mathematics & Decision Science — CONTRACTS (AIS-003 · PDF 27 §11).
 *
 * The canonical recommendation entity and the deterministic decision models that
 * rank it: normalized scoring factors, risk-adjusted expected value, the AIS-003
 * priority formula, an explicit dependency DAG, portfolio selection, scenarios,
 * sensitivity, and the review-ready DecisionBrief. Shapes only — the mathematics
 * is pure domain code (@brightloop/domain/scan-engine/decision-science/*).
 *
 * INVARIANTS: no recommendation without linked findings + evidence; confidence may
 * only ever LOWER priority; missing data is declared, never invented; no pricing,
 * no fabricated ROI, no proposal copy, no hidden chain-of-thought.
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema, evidenceStateSchema, recommendationTierSchema } from "./engine.js";
import { evidenceConfidenceSchema, provenanceSchema } from "./evidence.js";
import { contradictionStatusSchema } from "./reasoning.js";

export const RECOMMENDATION_SCHEMA_VERSION = "1.0";
/** Bump when any scoring/priority formula changes — every score records this. */
export const FORMULA_VERSION = "ais-003-1.0";

/* ---- 1 · canonical recommendation ----------------------------------------- */
export const timeHorizonSchema = z.enum(["days", "weeks", "quarter", "quarter_plus"]);
export type TimeHorizon = z.infer<typeof timeHorizonSchema>;

export const reviewCycleSchema = z.enum(["weekly", "monthly", "quarterly", "on_rescan"]);
export type ReviewCycle = z.infer<typeof reviewCycleSchema>;

export const successMetricSchema = z.object({
  key: z.string().max(120),
  description: z.string().max(500),
  dimension: indexDimensionSchema.nullable().default(null),
});
export type SuccessMetric = z.infer<typeof successMetricSchema>;

export const engineRecommendationSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  title: z.string().max(200),
  problemStatement: z.string().max(2000),
  proposedAction: z.string().max(2000),
  /** A recommendation may not exist without a finding and evidence behind it. */
  findingIds: z.array(z.string()).min(1),
  evidenceIds: z.array(z.string()).min(1),
  graphNodeIds: z.array(z.string()).default([]),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  tier: recommendationTierSchema,
  impact: z.number().int().min(0).max(100),
  effort: z.number().int().min(0).max(100),
  urgency: z.number().int().min(0).max(100),
  strategicAlignment: z.number().int().min(0).max(100),
  confidence: evidenceConfidenceSchema,
  implementationRisk: z.number().int().min(0).max(100),
  probabilityOfSuccess: z.number().min(0).max(1),
  timeHorizon: timeHorizonSchema,
  dependencies: z.array(z.string()).default([]), // recommendation ids
  constraints: z.array(z.string()).default([]),
  expectedOutcomes: z.array(z.string()).default([]),
  successMetrics: z.array(successMetricSchema).default([]),
  reviewCycle: reviewCycleSchema.default("on_rescan"),
  ownerRole: z.string().max(120).nullable().default(null), // assigned at proposal time
  evidenceState: evidenceStateSchema,
  limitations: z.array(z.string()).default([]),
  contradictionStatus: contradictionStatusSchema.default("none"),
  provenance: provenanceSchema,
  reviewRequired: z.boolean().default(true),
});
export type EngineRecommendation = z.infer<typeof engineRecommendationSchema>;

/* ---- 2 · scoring factors --------------------------------------------------- */
export const scoringFactorKeySchema = z.enum([
  "business_impact",
  "financial_impact",
  "urgency",
  "strategic_alignment",
  "confidence",
  "evidence_quality",
  "probability_of_success",
  "implementation_effort",
  "implementation_risk",
  "dependency_burden",
  "time_to_value",
  "reversibility",
]);
export type ScoringFactorKey = z.infer<typeof scoringFactorKeySchema>;

/** How a factor handled absent inputs — never silently invented. */
export const missingDataTreatmentSchema = z.enum([
  "observed", // computed from real inputs
  "policy_default", // an explicit, documented default was applied
  "unavailable", // no value could be produced; factor excluded from the score
  "penalized", // absence itself lowered the value, by policy
]);
export type MissingDataTreatment = z.infer<typeof missingDataTreatmentSchema>;

export const scoringFactorSchema = z.object({
  key: scoringFactorKeySchema,
  /** Normalized 0–100. Null only when treatment is "unavailable". */
  value: z.number().min(0).max(100).nullable(),
  sourceInputs: z.array(z.string()).default([]), // what the value was derived from
  formulaVersion: z.string(),
  limitations: z.array(z.string()).default([]),
  missingDataTreatment: missingDataTreatmentSchema,
});
export type ScoringFactor = z.infer<typeof scoringFactorSchema>;

export const factorSetSchema = z.object({
  recommendationId: z.string(),
  factors: z.array(scoringFactorSchema),
  formulaVersion: z.string(),
});
export type FactorSet = z.infer<typeof factorSetSchema>;

/* ---- 3 · expected value (AIS-003 §04) ------------------------------------- */
export const costRangeSchema = z.object({ low: z.number().nonnegative(), high: z.number().nonnegative() });
export type CostRange = z.infer<typeof costRangeSchema>;

export const expectedValueSchema = z.object({
  recommendationId: z.string(),
  /** Non-financial benefit in normalized Index-movement terms (always available). */
  expectedBenefit: z.number(),
  probabilityOfSuccess: z.number().min(0).max(1),
  downsideExposure: z.number(), // expected loss on failure
  implementationRisk: z.number().min(0).max(100),
  /** EV = p·I − (1−p)·L, then scaled by confidence. */
  confidenceAdjustedExpectedValue: z.number(),
  /** EV discounted for the time horizon. */
  timeAdjustedValue: z.number(),
  /** Financial model — null + `financialAvailable:false` when inputs are absent. */
  financialAvailable: z.boolean(),
  expectedCostRange: costRangeSchema.nullable().default(null),
  financialExpectedValue: z.number().nullable().default(null),
  /** Risk-adjusted ROI band; null whenever cost is unavailable. NEVER fabricated. */
  roiRange: z.object({ low: z.number(), high: z.number() }).nullable().default(null),
  formulaVersion: z.string(),
  limitations: z.array(z.string()).default([]),
});
export type ExpectedValue = z.infer<typeof expectedValueSchema>;

/* ---- 4 · priority score ---------------------------------------------------- */
export const factorContributionSchema = z.object({
  key: scoringFactorKeySchema,
  weight: z.number(),
  normalizedValue: z.number(), // 0–1
  contribution: z.number(), // weight × normalizedValue
});
export type FactorContribution = z.infer<typeof factorContributionSchema>;

export const penaltySchema = z.object({
  key: z.string(),
  amount: z.number(), // multiplicative factor applied (≤ 1) or subtractive, per `kind`
  kind: z.enum(["multiplier", "divisor", "subtractive"]),
  reason: z.string(),
});
export type Penalty = z.infer<typeof penaltySchema>;

/** Structured ranking rationale — inspectable metadata, NOT chain-of-thought. */
export const priorityRationaleSchema = z.object({
  dominantFactors: z.array(scoringFactorKeySchema).default([]),
  limitingFactors: z.array(scoringFactorKeySchema).default([]),
  criticalRiskOverride: z.boolean().default(false),
  confidenceScaled: z.boolean().default(true),
});
export type PriorityRationale = z.infer<typeof priorityRationaleSchema>;

export const priorityScoreSchema = z.object({
  recommendationId: z.string(),
  /** Normalized 0–100 (monotonic squash of `raw`; ordering is identical). */
  total: z.number().min(0).max(100),
  /** The raw AIS-003 π = C·(Σw·x)·U/(E+ε). Unbounded. */
  raw: z.number(),
  weightedValue: z.number(), // Σ w·x before confidence/urgency/effort
  contributions: z.array(factorContributionSchema).default([]),
  penalties: z.array(penaltySchema).default([]),
  warnings: z.array(z.string()).default([]),
  formulaVersion: z.string(),
  rationale: priorityRationaleSchema,
});
export type PriorityScore = z.infer<typeof priorityScoreSchema>;

/** The decision weights (AIS-003 §01: explicit, versioned, auditable; sum to 1). */
export const decisionWeightsSchema = z.object({
  impact: z.number().min(0).max(1),
  opportunity: z.number().min(0).max(1),
  riskReduction: z.number().min(0).max(1),
  strategicAlignment: z.number().min(0).max(1),
});
export type DecisionWeights = z.infer<typeof decisionWeightsSchema>;

/* ---- 5 · uncertainty ------------------------------------------------------- */
export const uncertaintyFlagSchema = z.enum([
  "missing_evidence",
  "unavailable_financial_data",
  "contradictory_evidence",
  "low_confidence_estimate",
  "stale_evidence",
  "inferred_only",
  "unresolved_dependency",
]);
export type UncertaintyFlag = z.infer<typeof uncertaintyFlagSchema>;

export const uncertaintyAssessmentSchema = z.object({
  recommendationId: z.string(),
  flags: z.array(uncertaintyFlagSchema).default([]),
  /** Multiplicative confidence penalty in (0,1] — may only reduce, never raise. */
  confidencePenalty: z.number().min(0).max(1),
  reviewRequired: z.boolean(),
  /** An inferred-only recommendation may not auto-escalate to critical. */
  blockedFromCritical: z.boolean(),
  notes: z.array(z.string()).default([]),
});
export type UncertaintyAssessment = z.infer<typeof uncertaintyAssessmentSchema>;

/* ---- 6 · dependency graph -------------------------------------------------- */
export const dependencyKindSchema = z.enum([
  "requires",
  "blocks",
  "enables",
  "conflicts_with",
  "duplicates",
  "substitutes",
  "sequences_before",
  "sequences_after",
]);
export type DependencyKind = z.infer<typeof dependencyKindSchema>;

export const dependencyEdgeSchema = z.object({
  from: z.string(), // recommendation id
  to: z.string(),
  kind: dependencyKindSchema,
  note: z.string().nullable().default(null),
});
export type DependencyEdge = z.infer<typeof dependencyEdgeSchema>;

export const dependencyIssueSchema = z.object({
  kind: z.enum(["cycle", "unknown_reference", "conflict", "duplicate", "self_reference"]),
  recommendationIds: z.array(z.string()),
  detail: z.string(),
});
export type DependencyIssue = z.infer<typeof dependencyIssueSchema>;

export const dependencyAnalysisSchema = z.object({
  edges: z.array(dependencyEdgeSchema).default([]),
  /** Prerequisite-first topological order; empty when a cycle blocks ordering. */
  order: z.array(z.string()).default([]),
  blocked: z.array(z.string()).default([]), // unmet prerequisites
  issues: z.array(dependencyIssueSchema).default([]),
  acyclic: z.boolean(),
});
export type DependencyAnalysis = z.infer<typeof dependencyAnalysisSchema>;

/* ---- 7 · ranking ----------------------------------------------------------- */
export const rankedRecommendationSchema = z.object({
  recommendationId: z.string(),
  rank: z.number().int().positive(),
  priority: priorityScoreSchema,
  expectedValue: expectedValueSchema.nullable().default(null),
  blocked: z.boolean().default(false),
  /** Why this item sits above the next one — structured, not prose reasoning. */
  comparisonToNext: z.string().nullable().default(null),
});
export type RankedRecommendation = z.infer<typeof rankedRecommendationSchema>;

export const rankingResultSchema = z.object({
  ranked: z.array(rankedRecommendationSchema).default([]),
  blocked: z.array(z.string()).default([]),
  rejected: z.array(z.object({ recommendationId: z.string(), reason: z.string() })).default([]),
  metadata: z.object({
    formulaVersion: z.string(),
    weights: decisionWeightsSchema,
    consideredCount: z.number().int().nonnegative(),
    orderedBy: z.array(z.string()).default([]),
  }),
});
export type RankingResult = z.infer<typeof rankingResultSchema>;

/* ---- 8 · portfolio --------------------------------------------------------- */
export const riskToleranceSchema = z.enum(["low", "moderate", "high"]);
export type RiskTolerance = z.infer<typeof riskToleranceSchema>;

export const portfolioConstraintsSchema = z.object({
  /** Abstract budget units — NOT service pricing (pricing is out of scope). */
  budgetCeiling: z.number().nonnegative().nullable().default(null),
  capacityCeiling: z.number().nonnegative().nullable().default(null), // aggregate effort units
  timeHorizon: timeHorizonSchema.nullable().default(null),
  riskTolerance: riskToleranceSchema.default("moderate"),
  requiredDomains: z.array(indexDimensionSchema).default([]),
  excludedRecommendationIds: z.array(z.string()).default([]),
});
export type PortfolioConstraints = z.infer<typeof portfolioConstraintsSchema>;

export const portfolioSchema = z.object({
  id: z.string(),
  selected: z.array(z.string()).default([]),
  deferred: z.array(z.string()).default([]),
  blocked: z.array(z.string()).default([]),
  projectedImpact: z.number(),
  aggregateEffort: z.number(),
  aggregateRisk: z.number(),
  domainCoverage: z.array(indexDimensionSchema).default([]),
  dependencyOrder: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  constraints: portfolioConstraintsSchema,
  formulaVersion: z.string(),
});
export type Portfolio = z.infer<typeof portfolioSchema>;

/* ---- 9 · scenarios --------------------------------------------------------- */
export const scenarioKindSchema = z.enum([
  "minimum_viable_intervention",
  "quick_wins",
  "balanced_transformation",
  "growth_acceleration",
  "risk_reduction",
  "strategic_transformation",
]);
export type ScenarioKind = z.infer<typeof scenarioKindSchema>;

export const scenarioSchema = z.object({
  kind: scenarioKindSchema,
  selected: z.array(z.string()).default([]),
  rationale: z.object({
    filter: z.string(), // the deterministic selection rule applied
    weights: decisionWeightsSchema,
    constraints: portfolioConstraintsSchema.nullable().default(null),
  }),
  totalImpact: z.number(),
  totalEffort: z.number(),
  totalRisk: z.number(),
  expectedTimeToValue: timeHorizonSchema.nullable().default(null),
  unresolvedDependencies: z.array(z.string()).default([]),
  evidenceConfidence: z.number().min(0).max(100).nullable().default(null),
  limitations: z.array(z.string()).default([]),
});
export type Scenario = z.infer<typeof scenarioSchema>;

/* ---- 10 · sensitivity ------------------------------------------------------ */
export const sensitivityEntrySchema = z.object({
  recommendationId: z.string(),
  baselineRank: z.number().int().positive(),
  minRank: z.number().int().positive(),
  maxRank: z.number().int().positive(),
  rankSpread: z.number().int().nonnegative(),
  stable: z.boolean(),
});
export type SensitivityEntry = z.infer<typeof sensitivityEntrySchema>;

export const sensitivityAnalysisSchema = z.object({
  delta: z.number(), // the ± perturbation applied to each weight
  /** Share of items whose rank never moved, 0–1. */
  rankingStability: z.number().min(0).max(1),
  entries: z.array(sensitivityEntrySchema).default([]),
  mostSensitive: z.array(z.string()).default([]),
  stableAcrossScenarios: z.array(z.string()).default([]),
  thresholdCrossings: z.array(z.object({ recommendationId: z.string(), detail: z.string() })).default([]),
  warnings: z.array(z.string()).default([]),
  formulaVersion: z.string(),
});
export type SensitivityAnalysis = z.infer<typeof sensitivityAnalysisSchema>;

/* ---- 11 · decision brief (data only) --------------------------------------- */
export const decisionBriefSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  pipelineRunId: z.string().nullable().default(null),
  generatedAt: z.string(),
  executiveDecisionSummary: z.string().max(4000),
  highestPriority: z.array(z.string()).default([]),
  criticalRisks: z.array(z.string()).default([]),
  quickWins: z.array(z.string()).default([]),
  strategicInitiatives: z.array(z.string()).default([]),
  blockedItems: z.array(z.string()).default([]),
  dependencySequence: z.array(z.string()).default([]),
  scenarioComparison: z.array(scenarioSchema).default([]),
  expectedValueSummary: z.object({
    totalConfidenceAdjustedValue: z.number(),
    financialAvailable: z.boolean(),
    itemsWithoutFinancialData: z.array(z.string()).default([]),
  }),
  confidenceSummary: z.object({ mean: z.number().min(0).max(100), lowest: z.number().min(0).max(100), lowConfidenceIds: z.array(z.string()).default([]) }),
  evidenceGaps: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  requiredHumanApprovals: z.array(z.string()).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
  modelVersions: z.object({ schemaVersion: z.string(), formulaVersion: z.string(), weights: decisionWeightsSchema }),
});
export type DecisionBrief = z.infer<typeof decisionBriefSchema>;

/* ---- 13 · events ----------------------------------------------------------- */
export const recommendationEventTypeSchema = z.enum([
  "recommendation.created",
  "recommendation.scored",
  "recommendation.blocked",
  "recommendation.rank_changed",
  "recommendation.portfolio_created",
  "recommendation.scenario_created",
  "recommendation.review_required",
  "recommendation.decision_brief_created",
]);
export type RecommendationEventType = z.infer<typeof recommendationEventTypeSchema>;

export const recommendationEventSchema = z.object({
  type: recommendationEventTypeSchema,
  recommendationId: z.string().nullable().default(null),
  scanId: z.string(),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type RecommendationEvent = z.infer<typeof recommendationEventSchema>;

/* ---- 12 · decision-science stage output (pipeline integration) ------------- */
export const decisionScienceResultSchema = z.object({
  scanId: z.string(),
  pipelineRunId: z.string().nullable().default(null),
  recommendations: z.array(engineRecommendationSchema).default([]),
  factorSets: z.array(factorSetSchema).default([]),
  priorities: z.array(priorityScoreSchema).default([]),
  expectedValues: z.array(expectedValueSchema).default([]),
  dependencies: dependencyAnalysisSchema,
  ranking: rankingResultSchema,
  portfolio: portfolioSchema.nullable().default(null),
  scenarios: z.array(scenarioSchema).default([]),
  sensitivity: sensitivityAnalysisSchema.nullable().default(null),
  decisionBrief: decisionBriefSchema.nullable().default(null),
  events: z.array(recommendationEventSchema).default([]),
});
export type DecisionScienceResult = z.infer<typeof decisionScienceResultSchema>;
