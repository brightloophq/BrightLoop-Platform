/* =============================================================================
 * Artifact registry (Sprint 8 §3 · AIS-001 §07/§08 Traceable/Reproducible) — PURE.
 *
 * Every pipeline artifact is wrapped in an envelope carrying identity, version,
 * a DETERMINISTIC content checksum (FNV-1a over canonical JSON), lineage
 * (`sourceArtifactIds`), validation status, and provenance. Identical content
 * always yields an identical checksum — the basis of reproducible runs.
 * ========================================================================== */

import {
  pipelineArtifactSchema,
  type ArtifactKind,
  type ArtifactValidationStatus,
  type PipelineArtifact,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";

/** In-run registry of artifacts, keyed by artifact id. */
export interface ArtifactRegistry {
  byId: Map<string, PipelineArtifact>;
  /** Latest artifact id per kind (the one downstream stages consume). */
  latestByKind: Map<ArtifactKind, string>;
  /** The payload behind each artifact id (not persisted; run-scoped). */
  payloads: Map<string, unknown>;
}

export function newArtifactRegistry(): ArtifactRegistry {
  return { byId: new Map(), latestByKind: new Map(), payloads: new Map() };
}

export interface RecordArtifactInput {
  id: string;
  pipelineRunId: string;
  scanId: string;
  kind: ArtifactKind;
  payload: unknown;
  sourceArtifactIds?: string[];
  validationStatus?: ArtifactValidationStatus;
  provenance?: Record<string, unknown>;
  now: string;
  version?: number;
}

/**
 * Wrap a payload in a validated artifact envelope and register it. The checksum is
 * computed from the payload alone, so the same payload always checksums the same.
 * Pure aside from the supplied registry mutation.
 */
export function recordArtifact(registry: ArtifactRegistry, input: RecordArtifactInput): PipelineArtifact {
  const artifact = pipelineArtifactSchema.parse({
    id: input.id,
    pipelineRunId: input.pipelineRunId,
    scanId: input.scanId,
    kind: input.kind,
    version: input.version ?? 1,
    checksum: hashContent(input.payload),
    generatedAt: input.now,
    sourceArtifactIds: input.sourceArtifactIds ?? [],
    validationStatus: input.validationStatus ?? "unvalidated",
    provenance: input.provenance ?? {},
  });
  registry.byId.set(artifact.id, artifact);
  registry.latestByKind.set(artifact.kind, artifact.id);
  registry.payloads.set(artifact.id, input.payload);
  return artifact;
}

/** The deterministic checksum of any payload. Pure. */
export function artifactChecksum(payload: unknown): string {
  return hashContent(payload);
}

export function latestArtifact(registry: ArtifactRegistry, kind: ArtifactKind): PipelineArtifact | null {
  const id = registry.latestByKind.get(kind);
  return id === undefined ? null : (registry.byId.get(id) ?? null);
}

export function artifactPayload<T>(registry: ArtifactRegistry, kind: ArtifactKind): T | null {
  const id = registry.latestByKind.get(kind);
  return id === undefined ? null : ((registry.payloads.get(id) as T) ?? null);
}

/** The artifact kinds currently available AND valid (invalid ones do not satisfy a dependency). */
export function availableKinds(registry: ArtifactRegistry): ArtifactKind[] {
  const out: ArtifactKind[] = [];
  for (const [kind, id] of registry.latestByKind) {
    const a = registry.byId.get(id);
    if (a !== undefined && a.validationStatus !== "invalid") out.push(kind);
  }
  return out.sort();
}

export function allArtifacts(registry: ArtifactRegistry): PipelineArtifact[] {
  return [...registry.byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
