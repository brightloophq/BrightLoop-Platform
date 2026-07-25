/* =============================================================================
 * Competitor Intelligence — RUNTIME SNAPSHOT CONTRACT (Phase C · Sprint C8).
 *
 * The deterministic output the Competitor Intelligence runtime step emits into
 * the `competitor_snapshot` runtime artifact. It is DISTINCT from the rich
 * Sprint-10 `competitorSnapshotSchema` (candidates / benchmarks / gaps): this is
 * the evidence-only runtime read that participates in the pipeline and always
 * exists — carrying an explicit UNAVAILABLE status when no verified competitor
 * evidence is present, so the runtime continues safely.
 *
 * ██ HARD RULES ██
 *   • Every statement references the evidence ids that support it. No unsupported
 *     facts, no inferred company names, no internet/crawl/scrape, no AI-generated
 *     competitors — the runtime step reads ONLY verified competitor evidence.
 *   • Confidence is CEILED by the minimum backing-evidence confidence and is only
 *     ever pulled DOWN (conflicts reduce it). It is never inflated.
 * ========================================================================== */

import { z } from "zod";
import { confidenceBandSchema } from "./evidence.js";

export const COMPETITOR_INTELLIGENCE_FORMULA_VERSION = "ci-runtime-1.0";

/** Available = at least one verified competitor evidence item; else Unavailable. */
export const competitorIntelligenceStatusSchema = z.enum(["available", "unavailable"]);
export type CompetitorIntelligenceStatus = z.infer<typeof competitorIntelligenceStatusSchema>;

/** The ONLY reason a snapshot is unavailable — no verified competitor evidence. */
export const competitorIntelligenceReasonSchema = z.enum(["no_competitor_evidence"]);
export type CompetitorIntelligenceReason = z.infer<typeof competitorIntelligenceReasonSchema>;

/** A deterministic, coarse market-position read. `undetermined` when unstated. */
export const competitorMarketPositionSchema = z.enum(["leader", "challenger", "follower", "niche", "undetermined"]);
export type CompetitorMarketPosition = z.infer<typeof competitorMarketPositionSchema>;

/**
 * One derived statement in a snapshot bucket. `statement` is a bounded normalized
 * string (no prose dump can pass); `evidenceIds` are the KNOWN bundle ids that
 * support it (always ≥1 — a statement with no surviving known evidence is dropped
 * upstream). `competitor` / `dimension` are copied verbatim from evidence, never
 * inferred.
 */
export const competitorStatementSchema = z.object({
  statement: z.string().min(1).max(300),
  competitor: z.string().max(200).nullable().default(null),
  dimension: z.string().max(120).nullable().default(null),
  evidenceIds: z.array(z.string().max(200)).min(1).max(50),
});
export type CompetitorStatement = z.infer<typeof competitorStatementSchema>;

/** A ranked competitor identity (name copied from evidence, never inferred). */
export const competitorRankEntrySchema = z.object({
  name: z.string().min(1).max(200),
  rank: z.number().int().positive(),
  evidenceIds: z.array(z.string().max(200)).min(1).max(200),
});
export type CompetitorRankEntry = z.infer<typeof competitorRankEntrySchema>;

export const competitorIntelligenceConfidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  band: confidenceBandSchema,
});
export type CompetitorIntelligenceConfidence = z.infer<typeof competitorIntelligenceConfidenceSchema>;

/** The deterministic runtime snapshot persisted inside `competitor_snapshot`. */
export const competitorIntelligenceSnapshotSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  status: competitorIntelligenceStatusSchema,
  /** Set only when status is `unavailable`. */
  reason: competitorIntelligenceReasonSchema.nullable().default(null),
  marketPosition: competitorMarketPositionSchema.default("undetermined"),
  /** Distinct competitors, deterministically ranked (evidence count → name). */
  competitors: z.array(competitorRankEntrySchema).default([]),
  differentiators: z.array(competitorStatementSchema).default([]),
  strengths: z.array(competitorStatementSchema).default([]),
  weaknesses: z.array(competitorStatementSchema).default([]),
  opportunities: z.array(competitorStatementSchema).default([]),
  threats: z.array(competitorStatementSchema).default([]),
  /** Count of same-competitor+dimension positive/negative contradictions found. */
  conflicts: z.number().int().nonnegative().default(0),
  /** Cited evidence ids that were NOT present in the bundle (rejected, never used). */
  rejectedEvidenceIds: z.array(z.string().max(200)).default([]),
  confidence: competitorIntelligenceConfidenceSchema,
  /** Every KNOWN evidence id that contributed to this snapshot (sorted, unique). */
  evidenceIds: z.array(z.string().max(200)).default([]),
  /** Upstream runtime artifact(s) this snapshot was derived from. */
  sourceArtifacts: z.array(z.string()).default([]),
  /** A bounded, templated, count-only summary — never generated prose. */
  summary: z.string().max(400),
  reviewRequired: z.boolean(),
  checksum: z.string(),
  generatedAt: z.string(),
  formulaVersion: z.string(),
});
export type CompetitorIntelligenceSnapshot = z.infer<typeof competitorIntelligenceSnapshotSchema>;
