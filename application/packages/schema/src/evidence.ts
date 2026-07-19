/* =============================================================================
 * Evidence Engine — CANONICAL CONTRACTS (PDF 27 §03/§05/§08).
 *
 * The processed, provenance- and confidence-carrying evidence model the whole
 * engine reasons over. Extends the Sprint-1 raw `evidenceSignal` (which stays):
 * a normalized `EngineEvidenceItem` adds freshness, reliability, a full provenance
 * trace, a computed confidence, a content hash, affected Index dimensions,
 * citations, and visibility. Shapes only — the deterministic logic is pure
 * domain code (@brightloop/domain/scan-engine/evidence/*).
 * ========================================================================== */

import { z } from "zod";
import { evidenceStateSchema, evidenceSourceSchema, indexDimensionSchema, engineStageSchema } from "./engine.js";

/* ---- bands + enums -------------------------------------------------------- */
export const freshnessBandSchema = z.enum(["fresh", "recent", "stale", "expired"]);
export type FreshnessBand = z.infer<typeof freshnessBandSchema>;

export const confidenceBandSchema = z.enum(["very_low", "low", "moderate", "high", "very_high"]);
export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;

/** Who may see an item: internal operator only → committed client → public report. */
export const evidenceVisibilitySchema = z.enum(["internal", "client", "public"]);
export type EvidenceVisibility = z.infer<typeof evidenceVisibilitySchema>;

/** How a signal was collected (the "how" of provenance). */
export const collectionMethodSchema = z.enum(["crawl", "manual", "api", "historical", "computed", "imported"]);
export type CollectionMethod = z.infer<typeof collectionMethodSchema>;

export const conflictTypeSchema = z.enum(["conflict", "duplicate", "superseded", "missing"]);
export type ConflictType = z.infer<typeof conflictTypeSchema>;

export const validationErrorCodeSchema = z.enum([
  "missing_required_field",
  "invalid_combination",
  "duplicate_id",
  "future_timestamp",
  "unsupported_state",
  "unknown_source",
  "invalid_reliability",
]);
export type ValidationErrorCode = z.infer<typeof validationErrorCodeSchema>;

/* ---- provenance (no hidden reasoning — an inspectable trace) --------------- */
export const provenanceSchema = z.object({
  origin: z.string().max(2048), // WHERE it came from (url / source identifier)
  collectedAt: z.string(), // WHEN it was collected
  method: collectionMethodSchema, // HOW it was collected
  transformed: z.boolean().default(false), // WHETHER it was transformed
  transformations: z.array(z.string()).default([]), // ordered transform-step ids (not free text reasoning)
  stage: engineStageSchema, // WHICH engine stage produced it
  providerId: z.string().nullable().default(null), // WHICH provider (optional)
});
export type Provenance = z.infer<typeof provenanceSchema>;

/* ---- freshness ------------------------------------------------------------ */
export const freshnessSchema = z.object({
  ageDays: z.number().nonnegative().nullable(), // null when the timestamp is unknown
  band: freshnessBandSchema,
  score: z.number().min(0).max(1), // decayed freshness weight
});
export type Freshness = z.infer<typeof freshnessSchema>;

/* ---- confidence (six factors; band + inputs — no natural language) -------- */
export const evidenceConfidenceInputsSchema = z.object({
  coverage: z.number().min(0).max(1),
  reliability: z.number().min(0).max(1),
  freshness: z.number().min(0).max(1),
  agreement: z.number().min(0).max(1),
  completeness: z.number().min(0).max(1),
  provenanceQuality: z.number().min(0).max(1),
});
export type EvidenceConfidenceInputs = z.infer<typeof evidenceConfidenceInputsSchema>;

export const evidenceConfidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  band: confidenceBandSchema,
  inputs: evidenceConfidenceInputsSchema,
});
export type EvidenceConfidence = z.infer<typeof evidenceConfidenceSchema>;

/* ---- the canonical evidence item ------------------------------------------ */
export const engineEvidenceItemSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  source: evidenceSourceSchema,
  state: evidenceStateSchema, // Observed / Estimated / Inferred / Unavailable
  timestamp: z.string(), // when the fact was observed
  freshness: freshnessSchema,
  reliability: z.number().min(0).max(1),
  provenance: provenanceSchema,
  confidence: evidenceConfidenceSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  hash: z.string(), // content checksum (deterministic)
  affectedDomains: z.array(indexDimensionSchema).default([]), // Index dimensions this touches
  citations: z.array(z.string()).default([]), // source urls / evidence refs
  visibility: evidenceVisibilitySchema.default("internal"),
  value: z.record(z.string(), z.unknown()).default({}), // the normalized observation payload
});
export type EngineEvidenceItem = z.infer<typeof engineEvidenceItemSchema>;

/* ---- bundle + summaries --------------------------------------------------- */
export const evidenceBundleSchema = z.object({
  scanId: z.string(),
  items: z.array(engineEvidenceItemSchema).default([]),
});
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;

export const coverageSummarySchema = z.object({
  overall: z.number().min(0).max(1),
  covered: z.array(indexDimensionSchema),
  missing: z.array(indexDimensionSchema),
  byDimension: z.record(z.string(), z.number()), // dimension → coverage 0..1
});
export type CoverageSummary = z.infer<typeof coverageSummarySchema>;

export const evidenceConflictSchema = z.object({
  type: conflictTypeSchema,
  itemIds: z.array(z.string()),
  dimension: indexDimensionSchema.nullable().default(null),
  subjectKey: z.string().nullable().default(null),
  detail: z.string(),
});
export type EvidenceConflict = z.infer<typeof evidenceConflictSchema>;

export const validationErrorSchema = z.object({
  code: validationErrorCodeSchema,
  itemId: z.string().nullable().default(null),
  detail: z.string(),
});
export type ValidationError = z.infer<typeof validationErrorSchema>;
