/* =============================================================================
 * Pipeline integration (Sprint 12 §18) — PURE extension point.
 *
 * Consumes the upstream artifacts and produces the six audience narratives.
 * Upstream artifacts are NEVER mutated; the narrative set is registered as a NEW
 * pipeline artifact carrying its source ids, preserving lineage and checksums.
 * ========================================================================== */

import {
  narrativeSetSchema,
  type NarrativeAudience,
  type NarrativeEvent,
  type NarrativePurpose,
  type NarrativeSet,
  type PipelineArtifact,
} from "@brightloop/schema";
import { recordArtifact, type ArtifactRegistry } from "../pipeline-run/artifacts.js";
import { newNarrativeRequest } from "./request.js";
import {
  buildBoardSummary,
  buildClientDiagnosis,
  buildExecutiveSummary,
  buildInternalOperatorReport,
  buildProposalNarrative,
  buildPublicPreview,
  type BuilderContext,
  type NarrativeInputs,
} from "./builders.js";
import * as evt from "./events.js";

export interface NarrativeStageInput {
  scanId: string;
  clientId: string | null;
  pipelineRunId?: string | null;
  inputs: NarrativeInputs;
  sourceArtifactIds?: string[];
  locale?: string;
  idFor: (prefix: string) => string;
  now: string;
  /** Restrict which audiences are produced; defaults to all six. */
  audiences?: readonly NarrativeAudience[];
}

const AUDIENCE_PURPOSE: Record<NarrativeAudience, NarrativePurpose> = {
  internal_operator: "diagnosis",
  executive: "decision_support",
  client: "diagnosis",
  prospect: "proposal",
  board: "decision_support",
  public_visitor: "public_preview",
};

/** Run the narrative stage for every requested audience. Deterministic. */
export function runNarrativeStage(input: NarrativeStageInput): NarrativeSet {
  const events: NarrativeEvent[] = [];
  const audiences = input.audiences ?? (["internal_operator", "executive", "client", "prospect", "board", "public_visitor"] as const);

  const build = (audience: NarrativeAudience) => {
    if (!audiences.includes(audience)) return null;
    const request = newNarrativeRequest({
      id: input.idFor(`narrative-request-${audience}`),
      scanId: input.scanId,
      clientId: input.clientId,
      audience,
      purpose: AUDIENCE_PURPOSE[audience],
      sourceArtifactIds: input.sourceArtifactIds ?? [],
      locale: input.locale,
      createdAt: input.now,
    });
    events.push(evt.requested(input.scanId, audience, input.now));

    const ctx: BuilderContext = {
      request,
      inputs: input.inputs,
      idFor: (prefix) => input.idFor(`${audience}-${prefix}`),
      now: input.now,
    };

    const artifact =
      audience === "internal_operator" ? buildInternalOperatorReport(ctx)
      : audience === "executive" ? buildExecutiveSummary(ctx)
      : audience === "client" ? buildClientDiagnosis(ctx)
      : audience === "prospect" ? buildProposalNarrative(ctx)
      : audience === "board" ? buildBoardSummary(ctx)
      : buildPublicPreview(ctx);

    for (const s of artifact.sections) events.push(evt.sectionCreated(input.scanId, s.id, input.now, s.type));
    for (const r of artifact.rejectedClaims) events.push(evt.claimRejected(input.scanId, r.claimId, input.now, r.reason));
    for (const r of artifact.redactions) events.push(evt.redactionApplied(input.scanId, r.subjectId, audience, input.now, r.reason));
    if (artifact.status === "validation_failed") events.push(evt.validationFailed(input.scanId, artifact.id, input.now));
    else events.push(evt.reviewRequired(input.scanId, artifact.id, audience, input.now));
    events.push(evt.versionCreated(input.scanId, artifact.id, input.now, `v${artifact.version}`));
    return artifact;
  };

  return narrativeSetSchema.parse({
    scanId: input.scanId,
    pipelineRunId: input.pipelineRunId ?? null,
    internal: build("internal_operator"),
    executive: build("executive"),
    client: build("client"),
    proposal: build("prospect"),
    board: build("board"),
    publicPreview: build("public_visitor"),
    events,
  });
}

/** Artifact kinds this stage reads (never mutates). */
export const NARRATIVE_SOURCE_KINDS = ["internal_intelligence_report", "findings", "recommendation_candidates"] as const;

/**
 * Register the narrative set as a NEW pipeline artifact with lineage preserved.
 * Existing artifacts are left untouched.
 */
export function recordNarrativeArtifact(
  registry: ArtifactRegistry,
  set: NarrativeSet,
  opts: { id: string; pipelineRunId: string; scanId: string; now: string },
): PipelineArtifact {
  const sources = NARRATIVE_SOURCE_KINDS.map((k) => registry.latestByKind.get(k)).filter((x): x is string => x !== undefined);
  const priorId = registry.latestByKind.get("internal_intelligence_report");
  const priorVersion = priorId === undefined ? 1 : (registry.byId.get(priorId)?.version ?? 1);
  return recordArtifact(registry, {
    id: opts.id,
    pipelineRunId: opts.pipelineRunId,
    scanId: opts.scanId,
    kind: "internal_intelligence_report", // continues the report lineage as a new version
    payload: {
      internal: set.internal,
      executive: set.executive,
      client: set.client,
      proposal: set.proposal,
      board: set.board,
      publicPreview: set.publicPreview,
    },
    sourceArtifactIds: sources,
    validationStatus: "valid",
    provenance: { stage: "narrative", audiences: Object.keys(set).filter((k) => k !== "events" && k !== "scanId" && k !== "pipelineRunId") },
    version: priorVersion + 1,
    now: opts.now,
  });
}
