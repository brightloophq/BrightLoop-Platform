/* =============================================================================
 * Transformation Execution — DTO boundary (Phase D · Sprint D1).
 *
 * The ONLY shapes that cross outward to the web layer. Deterministic projections
 * of the domain aggregates — no repository rows, no internal fields, no Phase C
 * envelopes. Mirrors the C1 `toScanDTO` boundary discipline.
 * ========================================================================== */

import type { Initiative, TransformationActivity, TransformationWorkspace } from "@brightloop/schema";

export interface InitiativeDTO {
  id: string;
  title: string;
  objective: string | null;
  priority: Initiative["priority"];
  effort: Initiative["effort"];
  businessImpact: Initiative["businessImpact"];
  dependencies: string[];
  supportingEvidenceIds: string[];
  executionStatus: Initiative["executionStatus"];
  /** Optimistic-concurrency version (D2). */
  version: number;
  sourceProposalItemId: string;
}

export interface WorkspaceSummaryDTO {
  id: string;
  clientId: string | null;
  scanRunId: string;
  reportArtifactId: string | null;
  proposalArtifactId: string | null;
  title: string;
  status: TransformationWorkspace["status"];
  seedChecksum: string;
  initiativeCount: number;
  createdAt: string;
}

export interface ProgressDTO {
  total: number;
  byPriority: { critical: number; high: number; medium: number; low: number };
  byStatus: { seeded: number };
}

export interface ActivitySummaryDTO {
  id: string;
  type: TransformationActivity["type"];
  subjectType: TransformationActivity["subjectType"];
  subjectId: string;
  summary: string;
  at: string;
}

export interface WorkspaceDetailDTO {
  workspace: WorkspaceSummaryDTO;
  initiatives: InitiativeDTO[];
  progress: ProgressDTO;
  activities: ActivitySummaryDTO[];
}

export function toInitiativeDTO(i: Initiative): InitiativeDTO {
  return {
    id: i.id,
    title: i.title,
    objective: i.objective,
    priority: i.priority,
    effort: i.effort,
    businessImpact: i.businessImpact,
    dependencies: i.dependencies,
    supportingEvidenceIds: i.supportingEvidenceIds,
    executionStatus: i.executionStatus,
    version: i.version,
    sourceProposalItemId: i.sourceProposalItemId,
  };
}

/** Per-initiative read model: current state/version + its transition history. */
export interface InitiativeDetailDTO {
  initiative: InitiativeDTO;
  /** The append-only activity for this initiative, oldest first. */
  history: ActivitySummaryDTO[];
}

export function toWorkspaceSummaryDTO(w: TransformationWorkspace, initiativeCount: number): WorkspaceSummaryDTO {
  return {
    id: w.id,
    clientId: w.clientId,
    scanRunId: w.scanRunId,
    reportArtifactId: w.reportArtifactId,
    proposalArtifactId: w.proposalArtifactId,
    title: w.title,
    status: w.status,
    seedChecksum: w.seedChecksum,
    initiativeCount,
    createdAt: w.createdAt,
  };
}

export function toProgressDTO(initiatives: readonly Initiative[]): ProgressDTO {
  const byPriority = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of initiatives) byPriority[i.priority] += 1;
  return { total: initiatives.length, byPriority, byStatus: { seeded: initiatives.length } };
}

export function toActivitySummaryDTO(a: TransformationActivity): ActivitySummaryDTO {
  return { id: a.id, type: a.type, subjectType: a.subjectType, subjectId: a.subjectId, summary: a.summary, at: a.at };
}

export function toWorkspaceDetailDTO(w: TransformationWorkspace, initiatives: readonly Initiative[], activities: readonly TransformationActivity[]): WorkspaceDetailDTO {
  return {
    workspace: toWorkspaceSummaryDTO(w, initiatives.length),
    initiatives: initiatives.map(toInitiativeDTO),
    progress: toProgressDTO(initiatives),
    activities: activities.map(toActivitySummaryDTO),
  };
}
