/* =============================================================================
 * Derived-record services (Phase B · Sprint 13C).
 *
 * FindingService, RecommendationService, CompetitorService, ProposalService and
 * NarrativeService persist the OUTPUTS of the Phase-A engines. They deliberately
 * hold no analytical logic: severity, priority, tiering, competitor selection and
 * narrative redaction were all decided in Phase A (Sprints 9–12). Re-deciding any
 * of it here would fork the truth.
 *
 * Each record carries a checksum, a version and `sourceArtifactIds`, so what was
 * persisted can always be traced back to the artifacts it came from.
 *
 * Proposal and narrative versions additionally carry `supersedesId`, forming an
 * explicit lineage chain. A new version NEVER rewrites its predecessor.
 * ========================================================================== */

import type {
  RuntimeCompetitorSnapshot,
  RuntimeFinding,
  RuntimeNarrativeVersion,
  RuntimeProposalVersion,
  RuntimeRecommendation,
} from "@brightloop/schema";
import { artifactChecksum } from "../../scan-engine/pipeline-run/artifacts.js";
import type {
  CompetitorSnapshotRepository,
  FindingRepository,
  NarrativeVersionRepository,
  ProposalVersionRepository,
  RecommendationRepository,
} from "../repository.js";
import type { RuntimeResult } from "../results.js";
import { derivedKey, type RuntimeServiceContext } from "./support.js";

/** Fields every derived record shares. */
interface DerivedBase {
  runId: string;
  clientId: string | null;
  scanId: string;
  envelope: Record<string, unknown>;
  sourceArtifactIds?: string[];
  version?: number;
  checksum?: string;
}

/** Shared assembly: checksum from the envelope unless one is supplied. */
function derived(base: DerivedBase, ctx: RuntimeServiceContext, kind: string, ref: string, idPrefix: string) {
  const version = base.version ?? 1;
  return {
    id: ctx.ids(idPrefix),
    runId: base.runId,
    clientId: base.clientId,
    scanId: base.scanId,
    version,
    checksum: base.checksum ?? artifactChecksum(base.envelope),
    envelope: base.envelope,
    sourceArtifactIds: [...(base.sourceArtifactIds ?? [])].sort(),
    idempotencyKey: derivedKey(kind, base.runId, ref, version),
    createdBy: ctx.actorId ?? null,
    createdAt: ctx.clock(),
  };
}

/* ---- findings ---------------------------------------------------------------- */
export interface SaveFindingInput extends DerivedBase {
  /** A stable identifier for this finding within the run — part of the idempotency key. */
  ref: string;
  domain?: string | null;
  severity?: string | null;
}

export class FindingService {
  constructor(private readonly repo: FindingRepository, private readonly ctx: RuntimeServiceContext) {}

  async save(input: SaveFindingInput): Promise<RuntimeResult<RuntimeFinding>> {
    return this.repo.saveFinding({
      ...derived(input, this.ctx, "find", input.ref, "find"),
      domain: input.domain ?? null,
      severity: input.severity ?? null,
    });
  }

  async list(runId: string): Promise<RuntimeResult<RuntimeFinding[]>> {
    return this.repo.listFindings(runId);
  }
}

/* ---- recommendations ---------------------------------------------------------- */
export interface SaveRecommendationInput extends DerivedBase {
  ref: string;
  tier?: string | null;
  priority?: number | null;
}

export class RecommendationService {
  constructor(private readonly repo: RecommendationRepository, private readonly ctx: RuntimeServiceContext) {}

  async save(input: SaveRecommendationInput): Promise<RuntimeResult<RuntimeRecommendation>> {
    return this.repo.saveRecommendation({
      ...derived(input, this.ctx, "rec", input.ref, "rec"),
      tier: input.tier ?? null,
      priority: input.priority ?? null,
    });
  }

  async list(runId: string): Promise<RuntimeResult<RuntimeRecommendation[]>> {
    return this.repo.listRecommendations(runId);
  }
}

/* ---- competitor snapshots ------------------------------------------------------ */
export interface SaveCompetitorSnapshotInput extends DerivedBase {
  competitorCount: number;
}

export class CompetitorService {
  constructor(private readonly repo: CompetitorSnapshotRepository, private readonly ctx: RuntimeServiceContext) {}

  /**
   * Persist a competitor snapshot. AIS-005's two inviolable rules — never
   * fabricate a competitor, never fabricate a benchmark — were enforced upstream
   * in Phase A; this service stores the resulting envelope verbatim and adds
   * nothing to it.
   */
  async save(input: SaveCompetitorSnapshotInput): Promise<RuntimeResult<RuntimeCompetitorSnapshot>> {
    const version = input.version ?? 1;
    return this.repo.saveCompetitorSnapshot({
      ...derived(input, this.ctx, "comp", `v${version}`, "comp"),
      competitorCount: input.competitorCount,
    });
  }
}

/* ---- proposal versions ---------------------------------------------------------- */
export interface SaveProposalVersionInput extends DerivedBase {
  status: string;
  /** The version this one replaces — the lineage link. */
  supersedesId?: string | null;
}

export class ProposalService {
  constructor(private readonly repo: ProposalVersionRepository, private readonly ctx: RuntimeServiceContext) {}

  async save(input: SaveProposalVersionInput): Promise<RuntimeResult<RuntimeProposalVersion>> {
    const version = input.version ?? 1;
    return this.repo.saveProposalVersion({
      ...derived(input, this.ctx, "prop", `v${version}`, "prop"),
      status: input.status,
      supersedesId: input.supersedesId ?? null,
    });
  }

  async latest(runId: string): Promise<RuntimeResult<RuntimeProposalVersion>> {
    return this.repo.getLatestProposalVersion(runId);
  }

  /**
   * Persist the next version in the chain. The prior row is left untouched —
   * only the new row records the link back to it.
   */
  async supersede(prior: RuntimeProposalVersion, envelope: Record<string, unknown>, status: string): Promise<RuntimeResult<RuntimeProposalVersion>> {
    return this.save({
      runId: prior.runId,
      clientId: prior.clientId,
      scanId: prior.scanId,
      envelope,
      sourceArtifactIds: prior.sourceArtifactIds,
      version: prior.version + 1,
      status,
      supersedesId: prior.id,
    });
  }
}

/* ---- narrative versions ---------------------------------------------------------- */
export interface SaveNarrativeVersionInput extends DerivedBase {
  audience: string;
  status: string;
  supersedesId?: string | null;
}

export class NarrativeService {
  constructor(private readonly repo: NarrativeVersionRepository, private readonly ctx: RuntimeServiceContext) {}

  /** Versions are per AUDIENCE: each audience carries an independent lineage. */
  async save(input: SaveNarrativeVersionInput): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    const version = input.version ?? 1;
    return this.repo.saveNarrativeVersion({
      ...derived(input, this.ctx, "narr", `${input.audience}:v${version}`, "narr"),
      audience: input.audience,
      status: input.status,
      supersedesId: input.supersedesId ?? null,
    });
  }

  async latest(runId: string, audience: string): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    return this.repo.getLatestNarrativeVersion(runId, audience);
  }

  async supersede(prior: RuntimeNarrativeVersion, envelope: Record<string, unknown>, status: string): Promise<RuntimeResult<RuntimeNarrativeVersion>> {
    return this.save({
      runId: prior.runId,
      clientId: prior.clientId,
      scanId: prior.scanId,
      envelope,
      sourceArtifactIds: prior.sourceArtifactIds,
      version: prior.version + 1,
      audience: prior.audience,
      status,
      supersedesId: prior.id,
    });
  }
}
