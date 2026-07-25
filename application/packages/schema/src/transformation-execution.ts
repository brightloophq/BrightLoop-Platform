/* =============================================================================
 * Transformation Execution — CONTRACTS (Phase D · Sprint D1).
 *
 * The bounded context that begins AFTER Phase C Report Assembly: a certified
 * `proposal` (ProposalIntelligenceSnapshot) becomes an executable Transformation
 * Workspace with deterministically seeded Initiatives and an append-only Activity
 * log. Distinct from the product transformation-cycle contracts — these are the
 * NEW `transformation_workspace` / `transformation_initiative` /
 * `transformation_activity` shapes; nothing here touches the certified runtime.
 *
 * D1 SCOPE: only workspace creation + initiative seeding. No workflow engine, no
 * tasks/reviews/timeline/KPIs — those are D2+. Execution has not begun; status is
 * the simple terminal-of-seed `seeded`.
 * ========================================================================== */

import { z } from "zod";
import { proposalPrioritySchema, proposalEffortSchema, proposalImpactSchema } from "./proposal-intelligence.js";

export const TRANSFORMATION_WORKSPACE_FORMULA_VERSION = "tx-workspace-1.0";

/** D1 workspace status: a freshly seeded workspace. Lifecycle arrives in D2+. */
export const transformationWorkspaceStatusSchema = z.enum(["seeded"]);
export type TransformationWorkspaceStatus = z.infer<typeof transformationWorkspaceStatusSchema>;

/** D1 initiative execution status: seeded, not yet executing. Lifecycle in D2+. */
export const initiativeExecutionStatusSchema = z.enum(["seeded"]);
export type InitiativeExecutionStatus = z.infer<typeof initiativeExecutionStatusSchema>;

/** The only activity types D1 records — workspace creation + initiative seeding. */
export const transformationActivityTypeSchema = z.enum(["workspace_created", "initiative_seeded"]);
export type TransformationActivityType = z.infer<typeof transformationActivityTypeSchema>;

export const activitySubjectTypeSchema = z.enum(["workspace", "initiative"]);
export type ActivitySubjectType = z.infer<typeof activitySubjectTypeSchema>;

/**
 * An Initiative — a unit of executable work, seeded 1:1 from a proposal item.
 * Priority / effort / businessImpact / supportingEvidenceIds are CARRIED verbatim
 * from the proposal (traceability preserved); Phase D never recomputes them.
 */
export const initiativeSchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  /** The proposal item this initiative was seeded from (lineage). */
  sourceProposalItemId: z.string(),
  title: z.string().min(1).max(200),
  objective: z.string().max(2000).nullable().default(null),
  priority: proposalPrioritySchema,
  effort: proposalEffortSchema,
  businessImpact: proposalImpactSchema,
  /** Initiative ids that must land first (mapped from proposal-item dependencies). */
  dependencies: z.array(z.string()).default([]),
  supportingEvidenceIds: z.array(z.string().max(200)).default([]),
  /** The Phase C proposal artifact this initiative traces to. */
  proposalArtifactId: z.string(),
  executionStatus: initiativeExecutionStatusSchema,
  createdAt: z.string(),
});
export type Initiative = z.infer<typeof initiativeSchema>;

/**
 * A Transformation Workspace — the engagement container seeded from a certified
 * scan. `scanRunId` + the artifact ids + `seedChecksum` are immutable lineage.
 */
export const transformationWorkspaceSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(),
  /** The certified scan run this workspace was seeded from (immutable). */
  scanRunId: z.string(),
  reportArtifactId: z.string().nullable(),
  proposalArtifactId: z.string().nullable(),
  title: z.string().min(1).max(200),
  objectives: z.array(z.string().max(300)).default([]),
  status: transformationWorkspaceStatusSchema,
  /** Content-addressed digest of the seed — the idempotency identity. */
  seedChecksum: z.string(),
  /** Optimistic-concurrency version (D1 writes are seed-once; carried for D2+). */
  version: z.number().int().positive().default(1),
  createdAt: z.string(),
});
export type TransformationWorkspace = z.infer<typeof transformationWorkspaceSchema>;

/** One append-only activity/audit record. Never edited or deleted. */
export const transformationActivitySchema = z.object({
  id: z.string(),
  workspaceId: z.string(),
  clientId: z.string().nullable(),
  type: transformationActivityTypeSchema,
  subjectType: activitySubjectTypeSchema,
  subjectId: z.string(),
  summary: z.string().max(400),
  /** Idempotency key — re-applying the same command is a no-op. */
  commandId: z.string(),
  at: z.string(),
});
export type TransformationActivity = z.infer<typeof transformationActivitySchema>;

/** The deterministic output of the seeding projection (pure, content-addressed). */
export const transformationWorkspaceSeedSchema = z.object({
  workspace: transformationWorkspaceSchema,
  initiatives: z.array(initiativeSchema).default([]),
  activities: z.array(transformationActivitySchema).default([]),
  seedChecksum: z.string(),
});
export type TransformationWorkspaceSeed = z.infer<typeof transformationWorkspaceSeedSchema>;
