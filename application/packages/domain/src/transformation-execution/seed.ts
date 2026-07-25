/* =============================================================================
 * Transformation Execution — SEEDING PROJECTION (Phase D · Sprint D1) — PURE.
 *
 * The one bridge from the certified Phase C runtime into Phase D. It projects a
 * certified `proposal` (ProposalIntelligenceSnapshot) into a Transformation
 * Workspace + one Initiative per proposal item + the seed Activity entries. It is
 * a PURE, content-addressed function: same proposal + same id strategy → identical
 * seed and identical `seedChecksum`. It reads no io, calls no provider, mutates no
 * Phase C artifact, and recomputes nothing — priority / effort / impact / evidence
 * are carried verbatim so lineage back to the scan is preserved.
 *
 * When `proposal.status === "unavailable"` the projection yields an empty workspace
 * shell (zero initiatives) — it never fabricates work.
 * ========================================================================== */

import {
  type ProposalIntelligenceSnapshot,
  type Initiative,
  type TransformationActivity,
  type TransformationWorkspace,
  type TransformationWorkspaceSeed,
  transformationWorkspaceSeedSchema,
} from "@brightloop/schema";
import { hashContent } from "../scan-engine/evidence/hash.js";

export interface SeedTransformationInput {
  scanRunId: string;
  clientId: string | null;
  proposal: ProposalIntelligenceSnapshot;
  /** The Phase C artifact ids this workspace traces to (immutable lineage). */
  proposalArtifactId: string | null;
  reportArtifactId: string | null;
  /** A human-readable workspace title (defaults to a deterministic label). */
  title?: string;
  now: string;
  /** Deterministic id factory. Same inputs → same ids → same seed. */
  idFor: (prefix: string, index: number) => string;
}

/**
 * Project a certified proposal into a deterministic Transformation Workspace seed.
 * Pure — the `seedChecksum` is content-addressed (excludes generated ids + clock),
 * so the application layer can look up `(scanRunId, seedChecksum)` for idempotency.
 */
export function seedTransformationWorkspace(input: SeedTransformationInput): TransformationWorkspaceSeed {
  const { scanRunId, clientId, proposal, proposalArtifactId, reportArtifactId, now, idFor } = input;
  const title = (input.title ?? `Transformation — ${scanRunId}`).slice(0, 200);

  const workspaceId = idFor("txw", 0);
  const items = proposal.status === "available" ? proposal.proposals : [];

  // Map each proposal item id → its new initiative id (for dependency rewiring).
  const initiativeIdByItem = new Map<string, string>();
  items.forEach((item, index) => initiativeIdByItem.set(item.id, idFor("init", index)));

  const initiatives: Initiative[] = items.map((item) => ({
    id: initiativeIdByItem.get(item.id)!,
    workspaceId,
    clientId,
    sourceProposalItemId: item.id,
    title: item.title.slice(0, 200),
    objective: item.recommendedSolution.slice(0, 2000),
    priority: item.priority,
    effort: item.estimatedEffort,
    businessImpact: item.businessImpact,
    // Rewire proposal-item dependencies to initiative ids; drop any unknown ref.
    dependencies: [...new Set(item.dependencies.map((d) => initiativeIdByItem.get(d)).filter((x): x is string => x !== undefined))].sort(),
    supportingEvidenceIds: [...new Set(item.supportingEvidenceIds)].sort(),
    proposalArtifactId: proposalArtifactId ?? "",
    executionStatus: "seeded",
    version: 1,
    createdAt: now,
  }));

  // Content-addressed checksum: canonical content EXCLUDING generated ids + clock,
  // so identical proposals hash identically regardless of id strategy or time.
  const seedChecksum = hashContent({
    scanRunId,
    clientId,
    title,
    objectives: [] as string[],
    formulaVersion: "tx-workspace-1.0",
    items: initiatives.map((i) => ({
      sourceProposalItemId: i.sourceProposalItemId,
      title: i.title,
      objective: i.objective,
      priority: i.priority,
      effort: i.effort,
      businessImpact: i.businessImpact,
      // dependencies expressed by their SOURCE proposal-item ids (id-independent)
      dependencies: initiatives
        .filter((d) => i.dependencies.includes(d.id))
        .map((d) => d.sourceProposalItemId)
        .sort(),
      supportingEvidenceIds: i.supportingEvidenceIds,
    })),
  });

  const workspace: TransformationWorkspace = {
    id: workspaceId,
    clientId,
    scanRunId,
    reportArtifactId,
    proposalArtifactId,
    title,
    objectives: [],
    status: "seeded",
    seedChecksum,
    version: 1,
    createdAt: now,
  };

  // Append-only seed activities: one workspace_created + one initiative_seeded each.
  // commandIds are content-addressed (seedChecksum-derived) so re-seeding is idempotent.
  const activities: TransformationActivity[] = [
    {
      id: idFor("act", 0),
      workspaceId,
      clientId,
      type: "workspace_created",
      subjectType: "workspace",
      subjectId: workspaceId,
      summary: `Workspace seeded from scan ${scanRunId} with ${initiatives.length} initiative(s).`,
      commandId: `${seedChecksum}:workspace`,
      at: now,
    },
    ...initiatives.map((initiative, index) => ({
      id: idFor("act", index + 1),
      workspaceId,
      clientId,
      type: "initiative_seeded" as const,
      subjectType: "initiative" as const,
      subjectId: initiative.id,
      summary: `Initiative "${initiative.title}" seeded (${initiative.priority}/${initiative.effort}).`.slice(0, 400),
      commandId: `${seedChecksum}:initiative:${initiative.sourceProposalItemId}`,
      at: now,
    })),
  ];

  return transformationWorkspaceSeedSchema.parse({ workspace, initiatives, activities, seedChecksum });
}
