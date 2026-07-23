/* =============================================================================
 * Prospect artifacts (Phase C · Sprint C5) — PURE, checksummed, lineage-carrying.
 *
 * C5 produces three artifacts: the intelligence assessment, the executive
 * summary, and the transformation readiness record.
 *
 * They are DELIBERATELY separate from the runtime's `PipelineArtifact` registry.
 * Registering a new kind there would mean touching the persistence contract, the
 * stage specs and the runtime artifact enum — all of which this sprint is
 * forbidden to modify. These records mirror that shape (id, checksum, lineage,
 * validation status) using the same `hashContent` hasher, so a caller can adopt
 * them later without a migration.
 *
 * `validationStatus` is always `unvalidated` and `reviewRequired` is always
 * `true`: the engine never marks its own output as validated.
 * ========================================================================== */

import {
  prospectArtifactSchema,
  type ExecutiveSummary,
  type ProspectArtifact,
  type ProspectArtifactKind,
  type TransformationReadiness,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";

export interface ArtifactInput {
  id: string;
  scanId: string;
  kind: ProspectArtifactKind;
  payload: unknown;
  sourceArtifactIds?: readonly string[];
  version?: number;
  now: string;
}

/**
 * Build one artifact record. The checksum is the deterministic content hash of
 * the payload, so an identical assessment always produces an identical checksum.
 */
export function buildProspectArtifact(input: ArtifactInput): ProspectArtifact {
  return prospectArtifactSchema.parse({
    id: input.id,
    scanId: input.scanId,
    kind: input.kind,
    version: input.version ?? 1,
    checksum: hashContent(input.payload),
    generatedAt: input.now,
    sourceArtifactIds: [...(input.sourceArtifactIds ?? [])].sort(),
    validationStatus: "unvalidated",
    reviewRequired: true,
  });
}

export interface ArtifactSetInput {
  scanId: string;
  /** The full assessment payload (everything C5 derived). */
  intelligencePayload: unknown;
  executiveSummary: ExecutiveSummary;
  readiness: TransformationReadiness;
  sourceArtifactIds?: readonly string[];
  idFor: (kind: ProspectArtifactKind) => string;
  now: string;
}

/** Build all three artifacts in a stable order. */
export function buildProspectArtifacts(input: ArtifactSetInput): ProspectArtifact[] {
  const common = { scanId: input.scanId, sourceArtifactIds: input.sourceArtifactIds, now: input.now };
  return [
    buildProspectArtifact({ ...common, id: input.idFor("prospect_intelligence"), kind: "prospect_intelligence", payload: input.intelligencePayload }),
    buildProspectArtifact({ ...common, id: input.idFor("executive_summary"), kind: "executive_summary", payload: input.executiveSummary }),
    buildProspectArtifact({ ...common, id: input.idFor("transformation_readiness"), kind: "transformation_readiness", payload: input.readiness }),
  ];
}
