/* =============================================================================
 * Competitor Intelligence Framework — CONTRACTS (AIS-005 · PDF 27 §10 · PDF 26).
 *
 * How Auxion discovers a REAL competitive set, scores it, compares it dimension by
 * dimension, and turns gaps into evidence-backed threats and opportunities.
 *
 * TWO INVIOLABLE RULES (AIS-005 §06), encoded in these shapes:
 *   1 · NEVER fabricate a competitor — a rival that fails the evidence threshold is
 *       rejected or marked `unavailable`, never invented.
 *   2 · NEVER fabricate a benchmark — every figure traces to an observed or
 *       defensibly-estimated source, carried with its state and confidence.
 * An unavailable value is NEVER back-filled from the client, an average, or zero.
 *
 * Shapes only — the deterministic logic is pure domain code
 * (@brightloop/domain/scan-engine/competitor-intelligence/*). Provider-neutral and
 * offline: no live search, no scraping, no HTTP, no AI.
 *
 * NOTE ON NAMES: `EngineCompetitorCandidate` / `EngineCompetitorBenchmark` extend
 * (and do not replace) the minimal PDF-26 `CompetitorCandidate` / `CompetitorBenchmark`
 * in scan-engine.ts — same `Engine*` convention as `EngineEvidenceItem`/`EngineMove`.
 * ========================================================================== */

import { z } from "zod";
import { indexDimensionSchema, evidenceStateSchema } from "./engine.js";
import { evidenceConfidenceSchema, provenanceSchema, freshnessSchema, confidenceBandSchema } from "./evidence.js";

export const COMPETITOR_SCHEMA_VERSION = "1.0";
/** Bump when any similarity/normalization/position formula changes. */
export const COMPETITOR_FORMULA_VERSION = "ais-005-1.0";

/* ---- 1 · competitor candidate --------------------------------------------- */
export const competitorStatusSchema = z.enum(["discovered", "validated", "rejected", "excluded", "ambiguous", "unavailable"]);
export type CompetitorStatus = z.infer<typeof competitorStatusSchema>;

export const pricePositionSchema = z.enum(["budget", "mid_market", "premium", "luxury", "unknown"]);
export type PricePosition = z.infer<typeof pricePositionSchema>;

export const businessModelSchema = z.enum(["b2b", "b2c", "b2b2c", "marketplace", "saas", "services", "retail", "other", "unknown"]);
export type BusinessModel = z.infer<typeof businessModelSchema>;

export const engineCompetitorCandidateSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  businessName: z.string().max(300),
  primaryDomain: z.string().max(300),
  normalizedDomain: z.string().max(300), // lowercased, www/protocol stripped — the dedupe key
  industry: z.string().max(200).nullable().default(null),
  subIndustry: z.string().max(200).nullable().default(null),
  geography: z.array(z.string().max(120)).default([]),
  customerSegment: z.array(z.string().max(120)).default([]),
  businessModel: businessModelSchema.default("unknown"),
  productsServices: z.array(z.string().max(200)).default([]),
  pricePosition: pricePositionSchema.default("unknown"),
  observedChannels: z.array(z.string().max(120)).default([]),
  /** A VALIDATED competitor must carry evidence — enforced in the domain layer. */
  evidenceIds: z.array(z.string()).default([]),
  evidenceState: evidenceStateSchema,
  confidence: evidenceConfidenceSchema,
  provenance: provenanceSchema,
  discoveredAt: z.string(),
  status: competitorStatusSchema.default("discovered"),
  exclusionReasons: z.array(z.string()).default([]),
  manualReviewRequired: z.boolean().default(false),
});
export type EngineCompetitorCandidate = z.infer<typeof engineCompetitorCandidateSchema>;

/* ---- 2 · discovery input (contracts only; discovery is NOT executed) ------- */
export const competitorDiscoveryInputSchema = z.object({
  scanId: z.string(),
  clientId: z.string().nullable(),
  businessProfile: z.record(z.string(), z.unknown()).default({}),
  industryTaxonomy: z.array(z.string().max(200)).default([]),
  geographicScope: z.array(z.string().max(120)).default([]),
  customerSegment: z.array(z.string().max(120)).default([]),
  productServiceOverlap: z.array(z.string().max(200)).default([]),
  searchTerms: z.array(z.string().max(200)).default([]),
  knownCompetitorDomains: z.array(z.string().max(300)).default([]),
  excludedDomains: z.array(z.string().max(300)).default([]),
  maxCandidates: z.number().int().positive().default(50),
  freshnessPolicyDays: z.number().int().positive().default(90),
  minimumEvidenceCount: z.number().int().nonnegative().default(1),
});
export type CompetitorDiscoveryInput = z.infer<typeof competitorDiscoveryInputSchema>;

/* ---- 3 + 15 · identity validation & false-positive prevention ------------- */
export const identityIssueKindSchema = z.enum([
  "exact_domain_duplicate",
  "same_company_alias",
  "parent_subsidiary",
  "franchise_variant",
  "marketplace_not_competitor",
  "directory_listing",
  "supplier_not_competitor",
  "irrelevant_category",
  "inactive_business",
  "missing_evidence",
  "ambiguous_identity",
  "regional_mismatch",
  "non_commercial_entity",
  "similar_name_unrelated",
]);
export type IdentityIssueKind = z.infer<typeof identityIssueKindSchema>;

/** What an issue does to the candidate. `ambiguous` NEVER silently becomes a competitor. */
export const identityDispositionSchema = z.enum(["reject", "exclude", "ambiguous", "flag_only"]);
export type IdentityDisposition = z.infer<typeof identityDispositionSchema>;

export const identityFindingSchema = z.object({
  kind: identityIssueKindSchema,
  disposition: identityDispositionSchema,
  detail: z.string().max(1000),
  relatedCandidateIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
});
export type IdentityFinding = z.infer<typeof identityFindingSchema>;

export const identityValidationSchema = z.object({
  candidateId: z.string(),
  status: competitorStatusSchema,
  findings: z.array(identityFindingSchema).default([]),
  manualReviewRequired: z.boolean().default(false),
  formulaVersion: z.string(),
});
export type IdentityValidation = z.infer<typeof identityValidationSchema>;

/* ---- 4 · similarity ------------------------------------------------------- */
export const similarityFactorKeySchema = z.enum([
  "industry_similarity",
  "product_service_overlap",
  "geography_relevance",
  "customer_segment_overlap",
  "business_model_similarity",
  "price_position_similarity",
  "channel_overlap",
  "market_scale_similarity",
  "digital_presence_comparability",
  "data_availability",
]);
export type SimilarityFactorKey = z.infer<typeof similarityFactorKeySchema>;

/** Missing data lowers confidence — it never becomes an invented match. */
export const missingBasisSchema = z.enum(["observed", "policy_default", "unavailable", "penalized"]);
export type MissingBasis = z.infer<typeof missingBasisSchema>;

export const similarityFactorSchema = z.object({
  key: similarityFactorKeySchema,
  /** 0–100. Null only when `missingDataTreatment` is `unavailable`. */
  score: z.number().min(0).max(100).nullable(),
  sourceInputs: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  limitations: z.array(z.string()).default([]),
  missingDataTreatment: missingBasisSchema,
  formulaVersion: z.string(),
});
export type SimilarityFactor = z.infer<typeof similarityFactorSchema>;

export const similarityScoreSchema = z.object({
  candidateId: z.string(),
  /** Sim(c) = Σ wk·simk — 0–100, weights redistributed over available factors. */
  aggregate: z.number().min(0).max(100),
  /** Rank(c) = Sim(c) × C(c) — similarity scaled by evidence confidence (AIS-005 §03). */
  confidenceScaled: z.number().min(0).max(100),
  factors: z.array(similarityFactorSchema).default([]),
  unavailableFactors: z.array(similarityFactorKeySchema).default([]),
  warnings: z.array(z.string()).default([]),
  formulaVersion: z.string(),
});
export type SimilarityScore = z.infer<typeof similarityScoreSchema>;

/* ---- 5 · ranking ---------------------------------------------------------- */
export const competitionDirectnessSchema = z.enum(["direct", "partial", "adjacent", "unknown"]);
export type CompetitionDirectness = z.infer<typeof competitionDirectnessSchema>;

export const rankedCompetitorSchema = z.object({
  candidateId: z.string(),
  rank: z.number().int().positive(),
  directness: competitionDirectnessSchema,
  similarity: similarityScoreSchema,
  comparisonToNext: z.string().nullable().default(null),
});
export type RankedCompetitor = z.infer<typeof rankedCompetitorSchema>;

export const competitorRankingSchema = z.object({
  selected: z.array(rankedCompetitorSchema).default([]),
  rejected: z.array(z.object({ candidateId: z.string(), reason: z.string() })).default([]),
  ambiguous: z.array(z.string()).default([]),
  excluded: z.array(z.string()).default([]),
  metadata: z.object({
    consideredCount: z.number().int().nonnegative(),
    maxSelected: z.number().int().positive(),
    orderedBy: z.array(z.string()).default([]),
    formulaVersion: z.string(),
  }),
});
export type CompetitorRanking = z.infer<typeof competitorRankingSchema>;

/* ---- 6 · benchmark dimensions --------------------------------------------- */
export const benchmarkDimensionSchema = z.enum([
  "website_performance",
  "mobile_experience",
  "seo_visibility",
  "content_activity",
  "reviews_reputation",
  "conversion_experience",
  "trust_signals",
  "social_presence",
  "response_options",
  "automation_maturity",
  "technology_indicators",
  "pricing_position",
  "accessibility",
  "security_posture",
  "brand_consistency",
]);
export type BenchmarkDimension = z.infer<typeof benchmarkDimensionSchema>;

export const engineCompetitorBenchmarkSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  dimension: benchmarkDimensionSchema,
  /** The client/subject business. */
  subjectBusinessId: z.string(),
  /** null = the client's own value; otherwise the competitor being measured. */
  competitorId: z.string().nullable().default(null),
  /** Raw value. Null when `available` is false — NEVER back-filled. */
  value: z.number().nullable().default(null),
  normalizedScore: z.number().min(0).max(100).nullable().default(null),
  unit: z.string().max(60).nullable().default(null),
  evidenceIds: z.array(z.string()).default([]),
  evidenceState: evidenceStateSchema,
  confidence: evidenceConfidenceSchema,
  freshness: freshnessSchema.nullable().default(null),
  provenance: provenanceSchema,
  available: z.boolean(),
  /** For `estimated` values: how the estimate was produced (required by §7). */
  estimationBasis: z.string().max(500).nullable().default(null),
  limitations: z.array(z.string()).default([]),
  formulaVersion: z.string(),
});
export type EngineCompetitorBenchmark = z.infer<typeof engineCompetitorBenchmarkSchema>;

/* ---- 8 · normalization ---------------------------------------------------- */
export const metricDirectionSchema = z.enum(["higher_is_better", "lower_is_better", "categorical", "ordinal", "binary"]);
export type MetricDirection = z.infer<typeof metricDirectionSchema>;

export const outlierPolicySchema = z.enum(["none", "clamp_min_max", "winsorize"]);
export type OutlierPolicy = z.infer<typeof outlierPolicySchema>;

export const normalizationPolicySchema = z.object({
  direction: metricDirectionSchema,
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  /** Ordered categories/ordinals, best-last for higher-is-better. */
  ordinalScale: z.array(z.string()).default([]),
  outlierPolicy: outlierPolicySchema.default("none"),
  /** Winsorization tail fraction, e.g. 0.05 trims the top+bottom 5%. */
  winsorFraction: z.number().min(0).max(0.5).default(0.05),
  formulaVersion: z.string(),
});
export type NormalizationPolicy = z.infer<typeof normalizationPolicySchema>;

export const populationStatsSchema = z.object({
  count: z.number().int().nonnegative(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  median: z.number().nullable(),
  mean: z.number().nullable(),
  stdDev: z.number().nullable(),
});
export type PopulationStats = z.infer<typeof populationStatsSchema>;

/* ---- 9 · competitive gaps -------------------------------------------------- */
export const gapTypeSchema = z.enum(["deficit", "parity", "advantage", "unknown"]);
export type GapType = z.infer<typeof gapTypeSchema>;

export const gapSeveritySchema = z.enum(["none", "low", "moderate", "high", "critical"]);
export type GapSeverity = z.infer<typeof gapSeveritySchema>;

export const opportunityTypeSchema = z.enum(["quick_close", "structural", "differentiation", "defensive", "none"]);
export type OpportunityType = z.infer<typeof opportunityTypeSchema>;

export const competitiveGapSchema = z.object({
  id: z.string(),
  dimension: benchmarkDimensionSchema,
  /** All null when the gap is `unknown` — unavailable never becomes zero. */
  currentScore: z.number().min(0).max(100).nullable().default(null),
  competitorMedian: z.number().min(0).max(100).nullable().default(null),
  leaderScore: z.number().min(0).max(100).nullable().default(null),
  absoluteGap: z.number().nullable().default(null),
  relativeGap: z.number().nullable().default(null), // fraction of the median
  type: gapTypeSchema,
  severity: gapSeveritySchema,
  affectedDomains: z.array(indexDimensionSchema).default([]),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  limitations: z.array(z.string()).default([]),
  opportunityType: opportunityTypeSchema.default("none"),
  reviewRequired: z.boolean().default(false),
  formulaVersion: z.string(),
});
export type CompetitiveGap = z.infer<typeof competitiveGapSchema>;

/* ---- 10 · market position -------------------------------------------------- */
export const marketPositionSchema = z.object({
  scanId: z.string(),
  /** Lead = Σ wk·percentilek(client | set). Null when coverage is insufficient. */
  overallPercentile: z.number().min(0).max(100).nullable().default(null),
  dimensionPercentiles: z.record(z.string(), z.number()).default({}),
  strongestDimensions: z.array(benchmarkDimensionSchema).default([]),
  weakestDimensions: z.array(benchmarkDimensionSchema).default([]),
  parityDimensions: z.array(benchmarkDimensionSchema).default([]),
  defensibleAdvantages: z.array(benchmarkDimensionSchema).default([]),
  materialDeficits: z.array(benchmarkDimensionSchema).default([]),
  confidence: z.number().min(0).max(100),
  /** Share of dimensions actually evidenced, 0–1 (AIS-005 §05 coverage reporting). */
  evidenceCoverage: z.number().min(0).max(1),
  competitorSetQuality: z.number().min(0).max(100),
  unavailableDimensions: z.array(benchmarkDimensionSchema).default([]),
  /** True only when coverage + set quality clear policy — gates "market leader" claims. */
  supportsMarketClaims: z.boolean(),
  limitations: z.array(z.string()).default([]),
  provenance: z.record(z.string(), z.unknown()).default({}),
  formulaVersion: z.string(),
});
export type MarketPosition = z.infer<typeof marketPositionSchema>;

/* ---- 11 · opportunities & threats ------------------------------------------ */
export const competitiveOutputKindSchema = z.enum([
  "opportunity",
  "threat",
  "differentiation",
  "parity_gap",
  "defensible_strength",
  "evidence_gap",
  "monitoring_candidate",
]);
export type CompetitiveOutputKind = z.infer<typeof competitiveOutputKindSchema>;

export const competitiveOutputSchema = z.object({
  id: z.string(),
  kind: competitiveOutputKindSchema,
  dimension: benchmarkDimensionSchema.nullable().default(null),
  title: z.string().max(200),
  detail: z.string().max(2000),
  benchmarkIds: z.array(z.string()).default([]),
  gapIds: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  competitorIds: z.array(z.string()).default([]),
  graphNodeIds: z.array(z.string()).default([]),
  affectedDomains: z.array(indexDimensionSchema).default([]),
  confidence: z.number().min(0).max(100),
  severity: gapSeveritySchema.default("none"),
  limitations: z.array(z.string()).default([]),
  reviewRequired: z.boolean().default(true),
});
export type CompetitiveOutput = z.infer<typeof competitiveOutputSchema>;

/* ---- 13 · decision-science inputs ------------------------------------------ */
export const competitorDecisionFactorKeySchema = z.enum([
  "market_gap_severity",
  "benchmark_confidence",
  "differentiation_potential",
  "threat_urgency",
  "evidence_coverage",
  "competitor_set_quality",
]);
export type CompetitorDecisionFactorKey = z.infer<typeof competitorDecisionFactorKeySchema>;

/** An explicit, versioned adjustment offered TO decision science — never applied over it. */
export const competitorDecisionInputSchema = z.object({
  scanId: z.string(),
  dimension: benchmarkDimensionSchema.nullable().default(null),
  gapIds: z.array(z.string()).default([]),
  competitorIds: z.array(z.string()).default([]),
  factors: z.array(z.object({
    key: competitorDecisionFactorKeySchema,
    value: z.number().min(0).max(100),
    sourceInputs: z.array(z.string()).default([]),
    limitations: z.array(z.string()).default([]),
  })).default([]),
  supportingContext: z.string().max(2000),
  evidenceIds: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100),
  formulaVersion: z.string(),
});
export type CompetitorDecisionInput = z.infer<typeof competitorDecisionInputSchema>;

/* ---- 14 · competitor-set confidence ---------------------------------------- */
export const setConfidenceFactorKeySchema = z.enum([
  "candidate_count",
  "validated_share",
  "evidence_coverage",
  "evidence_freshness",
  "geographic_relevance",
  "industry_similarity",
  "data_availability",
  "ambiguity_rate",
  "unavailable_rate",
]);
export type SetConfidenceFactorKey = z.infer<typeof setConfidenceFactorKeySchema>;

export const competitorSetConfidenceSchema = z.object({
  score: z.number().min(0).max(100),
  band: confidenceBandSchema,
  contributions: z.array(z.object({ key: setConfidenceFactorKeySchema, weight: z.number(), value: z.number(), contribution: z.number() })).default([]),
  /** A low-quality set must not support strong market claims. */
  supportsMarketClaims: z.boolean(),
  limitations: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  formulaVersion: z.string(),
});
export type CompetitorSetConfidence = z.infer<typeof competitorSetConfidenceSchema>;

/* ---- 16 · snapshots & changesets ------------------------------------------- */
export const competitorSnapshotSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  selectedCompetitorIds: z.array(z.string()).default([]),
  rejectedCandidateIds: z.array(z.string()).default([]),
  benchmarkSummary: z.record(z.string(), z.number()).default({}), // dimension → client normalized score
  gapSummary: z.record(z.string(), gapTypeSchema).default({}), // dimension → gap type
  marketPosition: marketPositionSchema.nullable().default(null),
  setConfidence: competitorSetConfidenceSchema.nullable().default(null),
  checksum: z.string(),
  generatedAt: z.string(),
  sourceArtifactIds: z.array(z.string()).default([]),
  formulaVersions: z.record(z.string(), z.string()).default({}),
});
export type CompetitorSnapshot = z.infer<typeof competitorSnapshotSchema>;

export const competitorChangeKindSchema = z.enum([
  "competitor_added",
  "competitor_removed",
  "rank_changed",
  "benchmark_changed",
  "gap_widened",
  "gap_narrowed",
  "advantage_gained",
  "advantage_lost",
  "confidence_changed",
]);
export type CompetitorChangeKind = z.infer<typeof competitorChangeKindSchema>;

export const competitorChangeSchema = z.object({
  kind: competitorChangeKindSchema,
  subjectId: z.string().nullable().default(null), // competitor id or dimension
  dimension: benchmarkDimensionSchema.nullable().default(null),
  before: z.union([z.number(), z.string(), z.null()]).default(null),
  after: z.union([z.number(), z.string(), z.null()]).default(null),
  detail: z.string().max(500),
});
export type CompetitorChange = z.infer<typeof competitorChangeSchema>;

export const competitorChangesetSchema = z.object({
  fromSnapshotId: z.string(),
  toSnapshotId: z.string(),
  changes: z.array(competitorChangeSchema).default([]),
});
export type CompetitorChangeset = z.infer<typeof competitorChangesetSchema>;

/* ---- 17 · events ----------------------------------------------------------- */
export const competitorEventTypeSchema = z.enum([
  "competitor.candidate_discovered",
  "competitor.candidate_validated",
  "competitor.candidate_rejected",
  "competitor.set_ranked",
  "competitor.benchmark_created",
  "competitor.gap_detected",
  "competitor.market_position_created",
  "competitor.snapshot_created",
  "competitor.change_detected",
  "competitor.review_required",
]);
export type CompetitorEventType = z.infer<typeof competitorEventTypeSchema>;

export const competitorEventSchema = z.object({
  type: competitorEventTypeSchema,
  scanId: z.string(),
  candidateId: z.string().nullable().default(null),
  at: z.string(),
  detail: z.string().nullable().default(null),
});
export type CompetitorEvent = z.infer<typeof competitorEventSchema>;

/* ---- aggregate result ------------------------------------------------------ */
export const competitorIntelligenceResultSchema = z.object({
  scanId: z.string(),
  candidates: z.array(engineCompetitorCandidateSchema).default([]),
  validations: z.array(identityValidationSchema).default([]),
  ranking: competitorRankingSchema,
  benchmarks: z.array(engineCompetitorBenchmarkSchema).default([]),
  gaps: z.array(competitiveGapSchema).default([]),
  marketPosition: marketPositionSchema.nullable().default(null),
  outputs: z.array(competitiveOutputSchema).default([]),
  setConfidence: competitorSetConfidenceSchema.nullable().default(null),
  decisionInputs: z.array(competitorDecisionInputSchema).default([]),
  snapshot: competitorSnapshotSchema.nullable().default(null),
  events: z.array(competitorEventSchema).default([]),
});
export type CompetitorIntelligenceResult = z.infer<typeof competitorIntelligenceResultSchema>;
