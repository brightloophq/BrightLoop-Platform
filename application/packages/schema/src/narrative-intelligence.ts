/* =============================================================================
 * Narrative Engine — RUNTIME SNAPSHOT CONTRACT (Phase C · Sprint C10).
 *
 * The deterministic PRESENTATION layer. It transforms already-computed
 * intelligence (Prospect / Competitor / Proposal / findings) into structured
 * client-facing narrative sections. It is DISTINCT from the Sprint-12 narrative
 * builder: this is the runtime read that participates in the pipeline and always
 * exists — carrying an explicit UNAVAILABLE status when there is not enough
 * intelligence, so the runtime continues.
 *
 * ██ HARD RULES ██
 *   • Narrative is PRESENTATION, never reasoning. It may summarize / reorder /
 *     group / compress / highlight / reference — it may NOT invent, speculate,
 *     predict, recommend, or change any finding, priority, or confidence.
 *   • Every block is traceable: it carries the evidence ids and source artifacts
 *     it was derived from, plus a confidence CARRIED from those sources — the
 *     narrative never computes confidence itself.
 *   • Deterministic sentence templates only. Same inputs → identical narrative.
 * ========================================================================== */

import { z } from "zod";
import { confidenceBandSchema } from "./evidence.js";

export const NARRATIVE_INTELLIGENCE_FORMULA_VERSION = "narrative-runtime-1.0";

/** Available = enough intelligence to present; else Unavailable. */
export const narrativeSnapshotStatusSchema = z.enum(["available", "unavailable"]);
export type NarrativeSnapshotStatus = z.infer<typeof narrativeSnapshotStatusSchema>;

/** The ONLY reason a narrative is unavailable — not enough intelligence to present. */
export const narrativeReasonSchema = z.enum(["insufficient_intelligence"]);
export type NarrativeReason = z.infer<typeof narrativeReasonSchema>;

/** Stable section keys — a fixed, ordered presentation spine. */
export const narrativeSectionKeySchema = z.enum([
  "executive_summary",
  "current_state",
  "key_opportunities",
  "competitive_position",
  "recommended_priorities",
  "implementation_considerations",
  "evidence_summary",
  "review_notes",
]);
export type NarrativeSectionKey = z.infer<typeof narrativeSectionKeySchema>;

export const narrativeConfidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  band: confidenceBandSchema,
});
export type NarrativeConfidence = z.infer<typeof narrativeConfidenceSchema>;

/** One narrative block — deterministic prose with full traceability. */
export const narrativeBlockSchema = z.object({
  id: z.string(),
  key: narrativeSectionKeySchema,
  heading: z.string().min(1).max(120),
  /** Deterministic, template-generated paragraphs — never creative writing. */
  paragraphs: z.array(z.string().max(1200)).default([]),
  /** The evidence this block presents (traceability, not new evidence). */
  supportingEvidenceIds: z.array(z.string().max(200)).default([]),
  /** The runtime artifacts this block was derived from. */
  supportingArtifacts: z.array(z.string()).default([]),
  /** Confidence CARRIED from the source artifact — never computed here. */
  confidence: narrativeConfidenceSchema,
  reviewRequired: z.boolean(),
});
export type NarrativeBlock = z.infer<typeof narrativeBlockSchema>;

/** The deterministic runtime snapshot persisted inside the `narrative` artifact. */
export const narrativeSnapshotSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  status: narrativeSnapshotStatusSchema,
  reason: narrativeReasonSchema.nullable().default(null),
  sections: z.array(narrativeBlockSchema).default([]),
  /** Carried from the presented sources (the floor) — never freshly computed. */
  confidence: narrativeConfidenceSchema,
  evidenceIds: z.array(z.string().max(200)).default([]),
  sourceArtifacts: z.array(z.string()).default([]),
  summary: z.string().max(400),
  reviewRequired: z.boolean(),
  checksum: z.string(),
  generatedAt: z.string(),
  formulaVersion: z.string(),
});
export type NarrativeSnapshot = z.infer<typeof narrativeSnapshotSchema>;
