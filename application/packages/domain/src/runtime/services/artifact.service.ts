/* =============================================================================
 * ArtifactService (Phase B · Sprint 13C) — immutable, versioned, lineage-bearing.
 *
 * There is NO update path, by construction. A change produces a new version with
 * its own checksum; `sourceArtifactIds` records what it was derived from, so
 * lineage is a property of the data rather than of a side table.
 *
 * The checksum is computed by the Phase-A `artifactChecksum` (FNV-1a over
 * canonical JSON) — the same function the in-memory engine uses, so a durable
 * artifact and its in-memory counterpart hash identically. That is what makes
 * deterministic replay verifiable rather than merely asserted.
 * ========================================================================== */

import type { RuntimeArtifact, RuntimeArtifactKind, RuntimeArtifactStatus } from "@brightloop/schema";
import { artifactChecksum } from "../../scan-engine/pipeline-run/artifacts.js";
import type { ArtifactRepository } from "../repository.js";
import type { RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { artifactKey, RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

export interface PersistArtifactInput {
  runId: string;
  clientId: string | null;
  scanId: string;
  kind: RuntimeArtifactKind;
  /** The artifact ENVELOPE — references and structured summary, never hidden reasoning. */
  envelope: Record<string, unknown>;
  /** Defaults to 1; a revision passes the next version explicitly. */
  version?: number;
  /** Lineage: the artifacts this one was derived from. */
  sourceArtifactIds?: string[];
  validationStatus?: RuntimeArtifactStatus;
  payloadRef?: string | null;
  /** Supply to pin an externally computed checksum; otherwise derived from the envelope. */
  checksum?: string;
}

export class ArtifactService {
  constructor(
    private readonly repo: ArtifactRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Persist an artifact version.
   *
   * Same (run, kind, version) + same content → `replayed`.
   * Same (run, kind, version) + DIFFERENT content → `conflict`. That conflict is
   * the immutability guarantee: history is never rewritten in place, so a caller
   * that meant to revise must supply the next version.
   */
  async persist(input: PersistArtifactInput): Promise<RuntimeResult<RuntimeArtifact>> {
    const version = input.version ?? 1;
    const record: RuntimeArtifact = {
      id: this.ctx.ids("art"),
      runId: input.runId,
      clientId: input.clientId,
      scanId: input.scanId,
      kind: input.kind,
      version,
      checksum: input.checksum ?? artifactChecksum(input.envelope),
      validationStatus: input.validationStatus ?? "unvalidated",
      sourceArtifactIds: [...(input.sourceArtifactIds ?? [])].sort(),
      envelope: input.envelope,
      payloadRef: input.payloadRef ?? null,
      idempotencyKey: artifactKey(input.runId, input.kind, version),
      createdBy: this.ctx.actorId ?? null,
      createdAt: this.ctx.clock(),
    };

    const result = await this.repo.saveArtifact(record);
    if (result.ok && result.code === "created") {
      await this.events.emit({
        eventType: RUNTIME_EVENTS.artifactPersisted,
        aggregateType: "intelligence_run",
        aggregateId: input.runId,
        clientId: input.clientId,
        runId: input.runId,
        scanId: input.scanId,
        payload: { artifactId: result.value.id, kind: input.kind, version, checksum: result.value.checksum },
      });
    }
    return result;
  }

  /** Revise: persist the NEXT version, carrying lineage back to its predecessor. */
  async revise(prior: RuntimeArtifact, envelope: Record<string, unknown>): Promise<RuntimeResult<RuntimeArtifact>> {
    return this.persist({
      runId: prior.runId,
      clientId: prior.clientId,
      scanId: prior.scanId,
      kind: prior.kind,
      envelope,
      version: prior.version + 1,
      sourceArtifactIds: [...prior.sourceArtifactIds, prior.id],
    });
  }

  async get(id: string): Promise<RuntimeResult<RuntimeArtifact>> {
    return this.repo.getArtifact(id);
  }

  async listByKind(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact[]>> {
    return this.repo.listArtifactsByKind(runId, kind);
  }

  /** The highest version of a kind, or null when the run has produced none. */
  async latest(runId: string, kind: RuntimeArtifactKind): Promise<RuntimeResult<RuntimeArtifact | null>> {
    const listed = await this.repo.listArtifactsByKind(runId, kind);
    if (!listed.ok) return listed;
    const sorted = [...listed.value].sort((a, b) => b.version - a.version);
    return { ok: true, code: "found", value: sorted[0] ?? null };
  }
}
