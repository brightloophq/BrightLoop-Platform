/* =============================================================================
 * Narrative artifact & versioning (Sprint 12 §16/§17) — PURE, DATA ONLY.
 *
 * Assembles the checksummed `NarrativeArtifact` and governs its versions.
 * Versions are IMMUTABLE: a revision produces a NEW artifact at n+1 and leaves the
 * prior untouched. A MATERIAL change — claims, citations, confidence, redactions,
 * sections, or source artifacts — invalidates any approval.
 *
 * No rendering of any kind.
 * ========================================================================== */

import {
  NARRATIVE_SCHEMA_VERSION,
  NARRATIVE_TEMPLATE_VERSION,
  narrativeArtifactSchema,
  narrativeRevisionSchema,
  type NarrativeArtifact,
  type NarrativeAudience,
  type NarrativeChangeKind,
  type NarrativeCitation,
  type NarrativeClaim,
  type NarrativeClaimRejection,
  type NarrativePurpose,
  type NarrativeRedaction,
  type NarrativeRevision,
  type NarrativeSection,
  type NarrativeSectionType,
  type NarrativeStatus,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { bandFor } from "./policy.js";

export interface BuildNarrativeArtifactInput {
  id: string;
  requestId: string;
  scanId: string;
  clientId: string | null;
  version?: number;
  audience: NarrativeAudience;
  purpose: NarrativePurpose;
  title: string;
  sections: readonly NarrativeSection[];
  claims?: readonly NarrativeClaim[];
  citations?: readonly NarrativeCitation[];
  rejectedClaims?: readonly NarrativeClaimRejection[];
  omittedSections?: readonly NarrativeSectionType[];
  redactions?: readonly NarrativeRedaction[];
  evidenceCoverage?: number;
  citationCoverage?: number;
  limitations?: string[];
  sourceArtifactIds?: string[];
  now: string;
}

/** The content the checksum covers — identity/version/status/time excluded. */
function checksumContent(input: BuildNarrativeArtifactInput) {
  return {
    requestId: input.requestId,
    scanId: input.scanId,
    audience: input.audience,
    purpose: input.purpose,
    sections: input.sections,
    claims: input.claims ?? [],
    citations: input.citations ?? [],
    redactions: input.redactions ?? [],
    omittedSections: input.omittedSections ?? [],
    limitations: input.limitations ?? [],
  };
}

/**
 * Assemble the narrative artifact. Status is derived: a rejected material claim or
 * an uncited section forces `validation_failed`; otherwise `review_required`
 * (a human always approves before anything reaches a client).
 */
export function buildNarrativeArtifact(input: BuildNarrativeArtifactInput): NarrativeArtifact {
  const sections = [...input.sections];
  const confidences = sections.map((s) => s.confidence);
  const mean = confidences.length === 0 ? 0 : Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length);
  const lowest = confidences.length === 0 ? 0 : Math.min(...confidences);

  const rejected = [...(input.rejectedClaims ?? [])];
  const limitations = [...new Set([...(input.limitations ?? []), ...sections.flatMap((s) => s.limitations)])].sort();

  const status: NarrativeStatus = rejected.length > 0 ? "validation_failed" : "review_required";

  return narrativeArtifactSchema.parse({
    id: input.id,
    requestId: input.requestId,
    scanId: input.scanId,
    clientId: input.clientId,
    version: input.version ?? 1,
    status,
    audience: input.audience,
    purpose: input.purpose,
    title: input.title,
    sections,
    claims: [...(input.claims ?? [])],
    citations: [...(input.citations ?? [])],
    rejectedClaims: rejected,
    omittedSections: [...(input.omittedSections ?? [])],
    redactions: [...(input.redactions ?? [])],
    confidenceSummary: { mean, lowest, band: bandFor(mean) },
    evidenceCoverage: input.evidenceCoverage ?? 0,
    citationCoverage: input.citationCoverage ?? 0,
    limitations,
    reviewRequired: true,
    sourceArtifactIds: [...(input.sourceArtifactIds ?? [])].sort(),
    templateVersions: { schema: NARRATIVE_SCHEMA_VERSION, template: NARRATIVE_TEMPLATE_VERSION },
    provenance: { scanId: input.scanId, requestId: input.requestId, audience: input.audience },
    checksum: hashContent(checksumContent(input)),
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/** Recompute an existing artifact's content checksum. Pure. */
export function narrativeChecksum(artifact: NarrativeArtifact): string {
  return hashContent({
    requestId: artifact.requestId,
    scanId: artifact.scanId,
    audience: artifact.audience,
    purpose: artifact.purpose,
    sections: artifact.sections,
    claims: artifact.claims,
    citations: artifact.citations,
    redactions: artifact.redactions,
    omittedSections: artifact.omittedSections,
    limitations: artifact.limitations,
  });
}

/* ---- 17 · versioning & review ---------------------------------------------- */
const TRANSITIONS: Record<NarrativeStatus, NarrativeStatus[]> = {
  draft: ["review_required", "validation_failed", "superseded"],
  validation_failed: ["draft", "superseded"],
  review_required: ["approved", "draft", "superseded"],
  approved: ["superseded"],
  superseded: [],
};

export function canNarrativeTransition(from: NarrativeStatus, to: NarrativeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Apply a status transition. Illegal transitions return the artifact unchanged. Pure. */
export function transitionNarrative(artifact: NarrativeArtifact, to: NarrativeStatus, now: string): NarrativeArtifact {
  if (!canNarrativeTransition(artifact.status, to)) return artifact;
  // approval is impossible while any claim was rejected
  if (to === "approved" && artifact.rejectedClaims.length > 0) return artifact;
  return narrativeArtifactSchema.parse({ ...artifact, status: to, updatedAt: now });
}

/** The change kinds between two artifact versions. Deterministic. Pure. */
export function detectChanges(prior: NarrativeArtifact, next: NarrativeArtifact): NarrativeChangeKind[] {
  const changes: NarrativeChangeKind[] = [];
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id).sort().join("|");
  if (ids(prior.claims) !== ids(next.claims)) changes.push("claim_change");
  if (ids(prior.citations) !== ids(next.citations)) changes.push("citation_change");
  if (prior.confidenceSummary.mean !== next.confidenceSummary.mean) changes.push("confidence_change");
  if (prior.redactions.length !== next.redactions.length) changes.push("redaction_change");
  if (ids(prior.sections) !== ids(next.sections)) changes.push("section_change");
  if (prior.sourceArtifactIds.join("|") !== next.sourceArtifactIds.join("|")) changes.push("source_artifact_change");
  return changes;
}

export interface ReviseNarrativeInput {
  id: string;
  next: NarrativeArtifact;
  changeSummary?: string[];
  now: string;
}

/**
 * Create the next immutable version. `prior` is never mutated. Any material change
 * resets approval and returns the artifact to `draft`.
 */
export function reviseNarrative(prior: NarrativeArtifact, input: ReviseNarrativeInput): { artifact: NarrativeArtifact; revision: NarrativeRevision } {
  const changes = detectChanges(prior, input.next);
  const contentChanged = narrativeChecksum(prior) !== narrativeChecksum(input.next);
  const material = changes.length > 0 || contentChanged;
  const wasApproved = prior.status === "approved";

  const artifact = narrativeArtifactSchema.parse({
    ...input.next,
    id: input.id,
    version: prior.version + 1,
    status: material ? "draft" : prior.status,
    reviewRequired: true,
    checksum: narrativeChecksum(input.next),
    createdAt: prior.createdAt,
    updatedAt: input.now,
  });

  const summary = [...(input.changeSummary ?? [])];
  if (contentChanged) summary.push("Narrative content changed (checksum moved).");
  if (material && wasApproved) summary.push("Material change — prior approval invalidated.");

  const revision = narrativeRevisionSchema.parse({
    fromVersion: prior.version,
    toVersion: artifact.version,
    changes,
    changeSummary: summary,
    material,
    approvalReset: material && wasApproved,
    at: input.now,
  });

  return { artifact, revision };
}

/** Mark a prior version superseded. Returns a new value. Pure. */
export function supersede(artifact: NarrativeArtifact, now: string): NarrativeArtifact {
  return transitionNarrative(artifact, "superseded", now);
}
