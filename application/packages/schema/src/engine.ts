/* =============================================================================
 * Business Intelligence Engine — CANONICAL MODEL (PDF 27).
 *
 * The typed constants + data contracts for the engine architecture. This is the
 * source of truth for the engine's SHAPES; the domain layer
 * (@brightloop/domain/scan-engine/*) owns the ports, state machines, and pure
 * logic that operate over them. Sprint 1 is the SKELETON — no provider, LLM,
 * crawler, queue, or persistence is implemented.
 *
 * Follows PDFs 00–26 (PDF 26 governs scan behaviour); contradicts none. The four
 * evidence states are shared with the PDF-26 surface model (`evidenceBasis`).
 * ========================================================================== */

import { z } from "zod";
import { domainKeySchema } from "./domains.js";
import { evidenceBasisSchema, type EvidenceBasis } from "./scan-engine.js";

/* ---- 01 · six verbs · 02 · seven laws (reference constants) ---------------- */
export const ENGINE_VERBS = ["observe", "understand", "reason", "recommend", "transform", "continuously_improve"] as const;
export type EngineVerb = (typeof ENGINE_VERBS)[number];

export const ENGINE_LAWS = [
  "evidence_before_reasoning", // no conclusion before its evidence is collected, classified, timestamped
  "never_hallucinate", // report only what evidence supports; absence stated plainly
  "cite_everything", // every recommendation references the exact evidence trace
  "scores_explain_themselves", // every score exposes inputs, weighting, coverage
  "confidence_is_mandatory", // every conclusion carries a computed confidence
  "impact_is_explicit", // every recommendation states impact, difficulty, cost, ROI
  "human_in_control", // operator can inspect, override, approve before a client sees it
] as const;
export type EngineLaw = (typeof ENGINE_LAWS)[number];

/* ---- 04 · eight composable layers ----------------------------------------- */
export const engineLayerSchema = z.enum([
  "discovery", // L1
  "crawler", // L2
  "evidence", // L3
  "graph", // L4 — business graph
  "reasoning", // L5
  "recommendation", // L6
  "proposal", // L7
  "monitoring", // L8
]);
export type EngineLayer = z.infer<typeof engineLayerSchema>;

/* ---- 03 · thirteen-stage pipeline ----------------------------------------- */
export const engineStageSchema = z.enum([
  "website_url", // 00 — input artifact
  "discovery",
  "crawler",
  "evidence_collection",
  "normalization",
  "business_profile", // artifact
  "competitor_discovery",
  "competitor_evidence",
  "ai_reasoning",
  "intelligence_graph", // artifact
  "recommendations", // artifact
  "proposal", // artifact
  "monitoring",
]);
export type EngineStage = z.infer<typeof engineStageSchema>;

/** Amber nodes are produced knowledge artifacts; neutral nodes transform them. */
export const stageKindSchema = z.enum(["artifact", "process"]);
export type StageKind = z.infer<typeof stageKindSchema>;

/* ---- 05 · nineteen sources · four states ---------------------------------- */
/** The four evidence states (shared with the PDF-26 surface model). */
export const evidenceStateSchema = evidenceBasisSchema;
export type EvidenceState = EvidenceBasis;

export const evidenceSourceSchema = z.enum([
  "website",
  "pages",
  "seo",
  "performance",
  "accessibility",
  "security",
  "brand",
  "forms",
  "analytics",
  "social_media",
  "google_business",
  "reviews",
  "competitors",
  "industry_benchmarks",
  "public_apis",
  "manual_input",
  "client_documents",
  "existing_crm",
  "historical_scans",
]);
export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;

/** Canonical default state per source (PDF 27 §05). A source may be reclassified
 *  at collection time (e.g. a granted Analytics property becomes `observed`). */
export const EVIDENCE_SOURCE_DEFAULT_STATE: Record<EvidenceSource, EvidenceState> = {
  website: "observed",
  pages: "observed",
  seo: "observed",
  performance: "observed",
  accessibility: "observed",
  security: "observed",
  brand: "inferred",
  forms: "observed",
  analytics: "unavailable",
  social_media: "observed",
  google_business: "observed",
  reviews: "observed",
  competitors: "estimated",
  industry_benchmarks: "estimated",
  public_apis: "observed",
  manual_input: "observed",
  client_documents: "unavailable",
  existing_crm: "unavailable",
  historical_scans: "observed",
};

/** A single classified, provenance-carrying signal (Evidence Engine output). */
export const evidenceSignalSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  source: evidenceSourceSchema,
  state: evidenceStateSchema,
  dimension: domainKeySchema.nullable().default(null), // optional link to an operating domain
  observedAt: z.string(), // timestamp — mandatory (Law: evidence_before_reasoning)
  reliability: z.number().min(0).max(1), // source trustworthiness weight
  freshnessDays: z.number().nonnegative().nullable().default(null), // age of the observation
  sourceUrl: z.string().max(2048).nullable().default(null), // provenance
  providerId: z.string().nullable().default(null),
  value: z.record(z.string(), z.unknown()).default({}), // the normalized signal
  note: z.string().max(500).nullable().default(null),
});
export type EvidenceSignal = z.infer<typeof evidenceSignalSchema>;

/* ---- L1/L2 · discovery + crawl contracts (PDF 27 §04) --------------------- */
export const crawlSurfaceSchema = z.object({
  scanId: z.string(),
  rootUrl: z.string().max(2048),
  routes: z.array(z.string().max(2048)).default([]),
  sitemapUrl: z.string().max(2048).nullable().default(null),
  connectedProperties: z.array(z.string()).default([]), // analytics, GBP, social handles …
  identifiers: z.record(z.string(), z.string()).default({}), // technology / public ids
  /** The boundary: hosts the crawler is permitted to fetch. Enforced downstream. */
  allowedHosts: z.array(z.string()).default([]),
});
export type CrawlSurface = z.infer<typeof crawlSurfaceSchema>;

export const crawlBudgetSchema = z.object({
  maxPages: z.number().int().positive().default(50),
  maxBytes: z.number().int().positive().default(50_000_000),
  perHostRatePerMin: z.number().int().positive().default(30),
  render: z.boolean().default(false),
});
export type CrawlBudget = z.infer<typeof crawlBudgetSchema>;

/** A single fetched artifact — RAW, untrusted, provenance-carrying. */
export const rawCaptureSchema = z.object({
  scanId: z.string(),
  url: z.string().max(2048),
  status: z.number().int(),
  contentType: z.string().nullable().default(null),
  fetchedAt: z.string(),
  bytes: z.number().int().nonnegative(),
  contentRef: z.string().nullable().default(null), // sanitized ref; raw HTML never fed to a model unsanitized
});
export type RawCapture = z.infer<typeof rawCaptureSchema>;

/* ---- 06 · provider selection criteria (router) ---------------------------- */
export const providerSelectionCriteriaSchema = z.enum([
  "task",
  "latency",
  "cost",
  "reasoning_quality",
  "context_size",
  "availability",
  "fallback",
]);
export type ProviderSelectionCriteria = z.infer<typeof providerSelectionCriteriaSchema>;

/* ---- 07 · six reasoning stages -------------------------------------------- */
export const reasoningStageSchema = z.enum([
  "planner",
  "research",
  "evidence_validation",
  "recommendation",
  "executive_summary",
  "proposal_writing",
]);
export type ReasoningStage = z.infer<typeof reasoningStageSchema>;

/* ---- 08 · confidence model (six factors) ---------------------------------- */
export const confidenceFactorSchema = z.enum(["coverage", "reliability", "freshness", "agreement", "completeness"]);
export type ConfidenceFactor = z.infer<typeof confidenceFactorSchema>;

/** The five 0–1 inputs; the composite (0–100) is COMPUTED from them, never asserted. */
export const confidenceInputsSchema = z.object({
  coverage: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  agreement: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
});
export type ConfidenceInputs = z.infer<typeof confidenceInputsSchema>;

export const engineConfidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  inputs: confidenceInputsSchema,
});
export type EngineConfidence = z.infer<typeof engineConfidenceSchema>;

/* ---- 09 · Business Health Index (ten weighted dimensions) ----------------- */
export const indexDimensionSchema = z.enum([
  "sales",
  "marketing",
  "operations",
  "customer_experience",
  "digital_presence",
  "automation",
  "growth",
  "brand",
  "risk",
  "opportunity",
]);
export type IndexDimension = z.infer<typeof indexDimensionSchema>;

/** Fixed weights, sum to 100 (PDF 27 §09). Risk is scored inversely upstream. */
export const INDEX_DIMENSION_WEIGHTS: Record<IndexDimension, number> = {
  sales: 14,
  marketing: 12,
  operations: 12,
  customer_experience: 12,
  digital_presence: 12,
  automation: 10,
  growth: 10,
  brand: 8,
  risk: 5,
  opportunity: 5,
};

export const dimensionScoreSchema = z.object({
  dimension: indexDimensionSchema,
  score: z.number().min(0).max(100), // higher is better; risk already inverted at scoring
  confidence: engineConfidenceSchema,
  evidenceIds: z.array(z.string()).default([]),
});
export type DimensionScore = z.infer<typeof dimensionScoreSchema>;

export const businessHealthIndexSchema = z.object({
  value: z.number().int().min(0).max(100),
  coverage: z.number().min(0).max(1), // share of weight actually scored
  dimensions: z.array(dimensionScoreSchema),
  confidence: engineConfidenceSchema,
  computedAt: z.string(),
});
export type BusinessHealthIndex = z.infer<typeof businessHealthIndexSchema>;

/* ---- 10 · competitor intelligence (eight signals) ------------------------- */
export const competitorSignalSchema = z.enum([
  "discovery",
  "ranking",
  "comparison",
  "gap_analysis",
  "opportunity_matrix",
  "market_position",
  "risk",
  "differentiators",
]);
export type CompetitorSignal = z.infer<typeof competitorSignalSchema>;

/* ---- 11 · recommendation framework (four tiers · seven attributes) -------- */
export const recommendationTierSchema = z.enum(["critical_risk", "strategic_win", "medium_win", "quick_win"]);
export type RecommendationTier = z.infer<typeof recommendationTierSchema>;

export const engineMoveSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  domainKey: domainKeySchema.nullable().default(null),
  tier: recommendationTierSchema,
  title: z.string().max(200),
  // seven mandatory attributes (PDF 27 §11)
  evidenceIds: z.array(z.string()).min(1), // Evidence — a move must cite evidence (Law: cite_everything)
  reason: z.string().max(2000), // Reason
  impact: z.number().int().min(0).max(100), // Impact
  difficulty: z.number().int().min(0).max(100), // Difficulty
  estimatedRoi: z.number().nullable().default(null), // Estimated ROI
  estimatedCost: z.number().nonnegative().nullable().default(null), // Estimated Cost
  confidence: engineConfidenceSchema, // Confidence
});
export type EngineMove = z.infer<typeof engineMoveSchema>;

/* ---- 12 · proposal generator (six parts) ---------------------------------- */
export const proposalPartSchema = z.enum([
  "timeline",
  "pricing",
  "deliverables",
  "implementation_plan",
  "expected_roi",
  "milestones",
]);
export type ProposalPart = z.infer<typeof proposalPartSchema>;

/* ---- 13 · continuous monitoring (six channels) ---------------------------- */
export const monitoringChannelSchema = z.enum([
  "scheduled_scans",
  "change_detection",
  "trend_analysis",
  "alerts",
  "weekly_summaries",
  "monthly_reports",
]);
export type MonitoringChannel = z.infer<typeof monitoringChannelSchema>;

/* ---- 14–18 · reference constants (concerns / levers / controls / principles) */
export const BACKGROUND_CONCERNS = ["queue", "workers", "retry", "timeout", "caching", "rate_limiting", "provider_fallback", "parallel_execution"] as const;
export const COST_LEVERS = ["llm_budgeting", "caching", "token_optimization", "partial_rescans", "api_budgeting", "reuse", "incremental_scanning"] as const;
export const SECURITY_CONTROLS = ["tenant_isolation", "evidence_ownership", "encryption", "secrets", "prompt_protection", "provider_isolation", "audit_logs"] as const;
export const FUTURE_MODULES = ["email", "sales", "crm", "financial", "hr", "supply_chain", "document", "meeting"] as const;
export const ENGINEERING_PRINCIPLES = ["no_vendor_lock_in", "provider_agnostic", "evidence_driven", "composable", "independently_testable", "explainable", "observable", "measurable"] as const;
