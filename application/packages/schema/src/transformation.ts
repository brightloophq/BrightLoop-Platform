/* =============================================================================
 * Transformation-domain contracts (Sprint 1 — Auxion Product Bible Ch 09).
 *
 * The canonical Zod contracts + inferred types for the transformation cycle:
 *   Signal → Insight → Recommendation → Approval → Move → Execution →
 *   Measurement → Learning, plus Business Health, Transformation Index,
 *   Operational Risk, and Knowledge Asset.
 *
 * Conventions (shared with entities.ts — do not diverge):
 *   - `id`         : prefixed text id (idSchema), app-generated. No DB ids invented here.
 *   - tenant       : `clientId` is the tenant ownership boundary. Required on every
 *                    transformation entity EXCEPT Knowledge Assets, which the Product
 *                    Bible (Ch 13/18) permits to be platform-level (clientId = null).
 *   - status       : machine-backed via statusEnum(...) — single source of truth in MACHINES.
 *   - timestamps   : ISO-8601 strings (timestampSchema); `createdAt` on every entity.
 *   - actor        : `createdBy` (nullable idSchema) for attribution, per repo convention.
 *
 * This file is contracts only — no services, repositories, migrations, or I/O.
 * ========================================================================== */

import { z } from "zod";
import { idSchema, timestampSchema, statusEnum } from "./entities.js";

/* ---- shared transformation primitives ------------------------------------- */

/** A single piece of supporting evidence. `ref` points at the underlying source. */
export const evidenceItemSchema = z.object({
  kind: z.enum(["metric", "document", "observation", "conversation", "external"]),
  ref: z.string(), // opaque reference (e.g. a metric key, file id, message id, url)
  label: z.string().optional(),
  detail: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

/** An ordered set of evidence backing a signal, insight, or recommendation. */
export const evidenceSchema = z.array(evidenceItemSchema);

/** Calibrated confidence, 0..1. Used by AI provenance and predictions. */
export const confidenceSchema = z.number().min(0).max(1);

/**
 * AI provenance — representable on any AI-produced artifact WITHOUT making AI
 * mandatory. A human-authored recommendation simply carries `aiProvenance: null`.
 * When present, it makes an AI output attributable (Ch 10 / invariant: every
 * material AI output is attributable to a model, prompt version, and timestamp).
 */
export const aiProvenanceSchema = z.object({
  modelId: z.string(), // provider-independent model identifier
  promptVersion: z.string(), // versioned prompt/config that produced the output
  generatedAt: timestampSchema,
  params: z.record(z.string(), z.unknown()).optional(),
  confidence: confidenceSchema.nullable().optional(),
  generationId: idSchema.nullable().optional(), // link to a future ai_generations record
});
export type AiProvenance = z.infer<typeof aiProvenanceSchema>;

/** Risk severity and likelihood — bounded qualitative scales (Ch 09). */
export const riskSeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export const riskLikelihoodSchema = z.enum([
  "rare",
  "unlikely",
  "possible",
  "likely",
  "almost_certain",
]);

/** What an Approval can be about, within the transformation domain. */
export const approvalSubjectTypeSchema = z.enum(["move", "operational_risk", "recommendation"]);

/** Kinds of curated Knowledge Asset (Ch 13). */
export const knowledgeAssetKindSchema = z.enum([
  "playbook",
  "lesson",
  "best_practice",
  "policy",
  "reference",
]);

/* ---- 1. Signal ------------------------------------------------------------ */

export const signalSchema = z.object({
  id: idSchema,
  clientId: idSchema, // tenant boundary — a signal always belongs to a client
  title: z.string(),
  detail: z.string().nullable(),
  status: statusEnum("signal"),
  /** Where the signal came from (a metric, a measurement, monitoring, the Auxiliary). */
  sourceRef: z.string().nullable(),
  evidence: evidenceSchema.default([]),
  createdBy: idSchema.nullable(), // actor/system that detected it
  createdAt: timestampSchema,
});
export type Signal = z.infer<typeof signalSchema>;

/**
 * Human-facing input for CREATING a signal. The service owns id/status/createdBy/
 * createdAt, so those are absent here. This is the shared contract the create form
 * and the server action both validate against — one source of truth for the rules.
 */
export const signalCreateInputSchema = z.object({
  clientId: idSchema.min(1, "Select an organization"),
  title: z.string().trim().min(1, "Title is required").max(200, "Keep the title under 200 characters"),
  detail: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  sourceRef: z
    .string()
    .trim()
    .max(300, "Keep the source under 300 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  evidence: z.array(evidenceItemSchema).max(20, "Too many evidence items").optional(),
});
export type SignalCreateInput = z.infer<typeof signalCreateInputSchema>;

/* ---- 2. Insight ----------------------------------------------------------- */

export const insightSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  signalId: idSchema, // an insight interprets a signal
  summary: z.string(),
  detail: z.string().nullable(),
  status: statusEnum("insight"),
  evidence: evidenceSchema.default([]),
  confidence: confidenceSchema.nullable(),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Insight = z.infer<typeof insightSchema>;

/**
 * Human-facing input for CREATING an insight. The service owns id/status/
 * createdBy/createdAt; the tenant (`clientId`) is derived server-side from the
 * linked signal, never trusted from the client — an insight always inherits the
 * tenant of the signal it interprets. This is the shared contract the create form
 * and the server action both validate against (one source of truth for the rules).
 */
export const insightCreateInputSchema = z.object({
  clientId: idSchema.min(1, "Missing organization"),
  signalId: idSchema.min(1, "Select a signal"),
  summary: z
    .string()
    .trim()
    .min(1, "Summary is required")
    .max(200, "Keep the summary under 200 characters"),
  detail: z
    .string()
    .trim()
    .max(4000, "Keep the description under 4000 characters")
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
  confidence: confidenceSchema.nullable().optional(),
  evidence: z.array(evidenceItemSchema).max(20, "Too many evidence items").optional(),
});
export type InsightCreateInput = z.infer<typeof insightCreateInputSchema>;

/* ---- 3. Recommendation ---------------------------------------------------- */

export const recommendationSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  insightId: idSchema, // a recommendation proposes a move for an insight
  summary: z.string(),
  rationale: z.string(), // the "why" — always present (Ch 10: explain every recommendation)
  expectedOutcome: z.string().nullable(),
  status: statusEnum("recommendation"),
  evidence: evidenceSchema.default([]),
  confidence: confidenceSchema.nullable(),
  /** AI provenance is optional: null for a human-authored recommendation. */
  aiProvenance: aiProvenanceSchema.nullable().default(null),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Recommendation = z.infer<typeof recommendationSchema>;

/* ---- 4. Approval (first-class record, never a boolean) -------------------- */

export const approvalSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  /** Polymorphic subject — what is being authorized. */
  subjectType: approvalSubjectTypeSchema,
  subjectId: idSchema,
  /** The decision, as a guarded machine value (pending → granted/denied). */
  decision: statusEnum("approval"),
  /** The accountable human. Null while pending; set when decided. */
  approverUserId: idSchema.nullable(),
  reason: z.string().nullable(),
  requestedAt: timestampSchema,
  decidedAt: timestampSchema.nullable(),
  createdBy: idSchema.nullable(), // who requested the approval
  createdAt: timestampSchema,
});
export type Approval = z.infer<typeof approvalSchema>;

/* ---- 5. Move -------------------------------------------------------------- */

export const moveSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  title: z.string(),
  intent: z.string(), // the committed intent
  expectedOutcome: z.string().nullable(),
  status: statusEnum("move"),
  /** A move may be created directly (null) or from an accepted recommendation. */
  recommendationId: idSchema.nullable(),
  /** The granting approval. Null until approved; required (in the DB gate) to execute. */
  approvalId: idSchema.nullable(),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Move = z.infer<typeof moveSchema>;

/* ---- 6. Execution Record -------------------------------------------------- */

export const executionRecordSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  moveId: idSchema, // an execution carries out an approved move
  status: statusEnum("executionRecord"),
  /** Unique when present — makes retried/external execution idempotent (DB-enforced). */
  idempotencyKey: z.string().max(255).nullable().default(null),
  attempts: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable(),
  startedAt: timestampSchema.nullable(),
  finishedAt: timestampSchema.nullable(),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type ExecutionRecord = z.infer<typeof executionRecordSchema>;

/* ---- 7. Measurement (append-only fact; no lifecycle) ---------------------- */

export const measurementSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  moveId: idSchema, // measures a move's result against its promised outcome
  metricKey: z.string(),
  target: z.number().nullable(),
  observed: z.number(),
  delta: z.number().nullable(),
  unit: z.string().nullable(),
  measuredAt: timestampSchema,
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Measurement = z.infer<typeof measurementSchema>;

/* ---- 8. Learning (append-only record; no lifecycle) ----------------------- */

export const learningSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  summary: z.string(),
  detail: z.string().nullable(),
  /** A learning may derive from a measured move; both links are optional. */
  moveId: idSchema.nullable(),
  measurementId: idSchema.nullable(),
  capturedAt: timestampSchema,
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type Learning = z.infer<typeof learningSchema>;

/* ---- 9. Business Health Record (append-only snapshot) --------------------- */

export const businessHealthRecordSchema = z.object({
  id: idSchema,
  clientId: idSchema, // client-readable (own) — Transformation Progress
  /** Dimensional scores at a point in time. No single metric determines health (Ch 09). */
  dimensions: z.record(z.string(), z.number()),
  score: z.number().min(0).max(100),
  basis: z.string().nullable(),
  capturedAt: timestampSchema,
  createdAt: timestampSchema,
});
export type BusinessHealthRecord = z.infer<typeof businessHealthRecordSchema>;

/* ---- 10. Transformation Index Record (append-only series point) ----------- */

export const transformationIndexRecordSchema = z.object({
  id: idSchema,
  clientId: idSchema, // client-readable (own) — directional progress over time
  value: z.number(),
  delta: z.number().nullable(),
  basis: z.string().nullable(),
  at: timestampSchema,
  createdAt: timestampSchema,
});
export type TransformationIndexRecord = z.infer<typeof transformationIndexRecordSchema>;

/* ---- 11. Operational Risk ------------------------------------------------- */

export const operationalRiskSchema = z.object({
  id: idSchema,
  clientId: idSchema,
  title: z.string(),
  detail: z.string().nullable(),
  status: statusEnum("operationalRisk"),
  severity: riskSeveritySchema,
  likelihood: riskLikelihoodSchema,
  /** Optional links: a risk may be surfaced by a signal and associated with a move. */
  signalId: idSchema.nullable(),
  moveId: idSchema.nullable(),
  ownerUserId: idSchema.nullable(),
  evidence: evidenceSchema.default([]),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type OperationalRisk = z.infer<typeof operationalRiskSchema>;

/* ---- 12. Knowledge Asset -------------------------------------------------- */

export const knowledgeAssetSchema = z.object({
  id: idSchema,
  /** Nullable: a Knowledge Asset may be client-scoped OR platform-level/shared (Ch 13/18). */
  clientId: idSchema.nullable(),
  title: z.string(),
  kind: knowledgeAssetKindSchema,
  body: z.string(),
  status: statusEnum("knowledgeAsset"),
  /** Optional provenance of the lesson (a measured move, a conversation, etc.). */
  sourceRef: z.string().nullable(),
  createdBy: idSchema.nullable(),
  createdAt: timestampSchema,
});
export type KnowledgeAsset = z.infer<typeof knowledgeAssetSchema>;

/* ---- registry (parity with ENTITY_SCHEMAS) -------------------------------- */

/** Canonical transformation entity names → Zod schema. */
export const TRANSFORMATION_ENTITY_SCHEMAS = {
  Signal: signalSchema,
  Insight: insightSchema,
  Recommendation: recommendationSchema,
  Approval: approvalSchema,
  Move: moveSchema,
  ExecutionRecord: executionRecordSchema,
  Measurement: measurementSchema,
  Learning: learningSchema,
  BusinessHealthRecord: businessHealthRecordSchema,
  TransformationIndexRecord: transformationIndexRecordSchema,
  OperationalRisk: operationalRiskSchema,
  KnowledgeAsset: knowledgeAssetSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

export type TransformationEntityName = keyof typeof TRANSFORMATION_ENTITY_SCHEMAS;
