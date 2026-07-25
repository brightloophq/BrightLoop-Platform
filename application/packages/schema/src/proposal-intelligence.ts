/* =============================================================================
 * Proposal Intelligence — RUNTIME SNAPSHOT CONTRACT (Phase C · Sprint C9).
 *
 * The deterministic output the Proposal Intelligence runtime step emits into the
 * `proposal` runtime artifact. It converts evidence-backed recommendation
 * candidates into STRUCTURED proposal objects — never marketing copy, never
 * narrative, never AI-generated prose. It is DISTINCT from the rich Sprint-11
 * `proposal*` builder (workstreams / phases / investment): this is the runtime
 * read that participates in the pipeline and always exists — carrying an explicit
 * UNAVAILABLE status when evidence is insufficient, so the runtime continues.
 *
 * ██ HARD RULES ██
 *   • Every proposal references the evidence ids that support it. No invented
 *     work, no unsupported features, no internet, no provider dependency.
 *   • Confidence is CEILED by the minimum backing-evidence confidence and only
 *     ever pulled DOWN (conflicting findings reduce it). It is never inflated.
 *   • Priority and effort derive from evidence-backed signals, not opinion.
 * ========================================================================== */

import { z } from "zod";
import { confidenceBandSchema } from "./evidence.js";

export const PROPOSAL_INTELLIGENCE_FORMULA_VERSION = "pi-runtime-1.0";

/** Available = at least one evidence-backed proposal; else Unavailable. */
export const proposalIntelligenceStatusSchema = z.enum(["available", "unavailable"]);
export type ProposalIntelligenceStatus = z.infer<typeof proposalIntelligenceStatusSchema>;

/** The ONLY reason a snapshot is unavailable — not enough evidence to propose. */
export const proposalIntelligenceReasonSchema = z.enum(["insufficient_evidence"]);
export type ProposalIntelligenceReason = z.infer<typeof proposalIntelligenceReasonSchema>;

/** Evidence-derived priority. Critical → Low. */
export const proposalPrioritySchema = z.enum(["critical", "high", "medium", "low"]);
export type ProposalPriority = z.infer<typeof proposalPrioritySchema>;

/** Deterministic effort band. `unknown` when effort cannot be estimated. */
export const proposalEffortSchema = z.enum(["small", "medium", "large", "unknown"]);
export type ProposalEffort = z.infer<typeof proposalEffortSchema>;

/** Coarse business-impact band, copied from the recommendation signal. */
export const proposalImpactSchema = z.enum(["low", "moderate", "high"]);
export type ProposalImpact = z.infer<typeof proposalImpactSchema>;

/** Per-item status: `blocked` when it has unmet prerequisites, else `ready`. */
export const proposalItemStatusSchema = z.enum(["ready", "blocked"]);
export type ProposalItemStatus = z.infer<typeof proposalItemStatusSchema>;

export const proposalConfidenceSchema = z.object({
  value: z.number().int().min(0).max(100),
  band: confidenceBandSchema,
});
export type ProposalConfidence = z.infer<typeof proposalConfidenceSchema>;

/** One structured proposal item — a solution recommendation, never prose. */
export const proposalItemSchema = z.object({
  id: z.string(),
  title: z.string().min(1).max(200),
  problem: z.string().max(2000),
  recommendedSolution: z.string().max(2000),
  businessImpact: proposalImpactSchema,
  priority: proposalPrioritySchema,
  estimatedEffort: proposalEffortSchema,
  /** Proposal ids that must land first (deterministic prerequisite ordering). */
  dependencies: z.array(z.string()).default([]),
  /** Evidence-linked caveats/risks — bounded strings, never generated prose. */
  risks: z.array(z.string().max(300)).default([]),
  confidence: proposalConfidenceSchema,
  supportingEvidenceIds: z.array(z.string().max(200)).min(1),
  reviewRequired: z.boolean(),
  status: proposalItemStatusSchema,
});
export type ProposalItem = z.infer<typeof proposalItemSchema>;

/** Priority-bucket counts for the report surface. */
export const proposalCountsSchema = z.object({
  critical: z.number().int().nonnegative(),
  high: z.number().int().nonnegative(),
  medium: z.number().int().nonnegative(),
  low: z.number().int().nonnegative(),
});
export type ProposalCounts = z.infer<typeof proposalCountsSchema>;

/** The deterministic runtime snapshot persisted inside the `proposal` artifact. */
export const proposalIntelligenceSnapshotSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  status: proposalIntelligenceStatusSchema,
  reason: proposalIntelligenceReasonSchema.nullable().default(null),
  proposals: z.array(proposalItemSchema).default([]),
  counts: proposalCountsSchema,
  /** Count of proposals whose category had conflicting findings (confidence cut). */
  conflicts: z.number().int().nonnegative().default(0),
  confidence: proposalConfidenceSchema,
  evidenceIds: z.array(z.string().max(200)).default([]),
  sourceArtifacts: z.array(z.string()).default([]),
  summary: z.string().max(400),
  reviewRequired: z.boolean(),
  checksum: z.string(),
  generatedAt: z.string(),
  formulaVersion: z.string(),
});
export type ProposalIntelligenceSnapshot = z.infer<typeof proposalIntelligenceSnapshotSchema>;
