/* =============================================================================
 * Canonical stage orchestration (Sprint 8 §2 · PDF 27 §03/§04) — PURE.
 *
 * The 13 orchestration stages in order, each declaring the artifacts it REQUIRES
 * and the artifact it PRODUCES. No stage may execute without its prior artifacts —
 * `stageDependenciesMet` is the hard gate the runner consults before every stage.
 * ========================================================================== */

import { pipelineRunStageSchema, type ArtifactKind, type PipelineRunStage } from "@brightloop/schema";

/** Canonical stage order (the enum declaration order). */
export const PIPELINE_STAGE_ORDER: readonly PipelineRunStage[] = pipelineRunStageSchema.options;

export interface PipelineStageSpec {
  stage: PipelineRunStage;
  purpose: string;
  /** Artifact kinds that must already exist (and be valid) before this stage runs. */
  requiresArtifacts: ArtifactKind[];
  /** The artifact kind this stage produces, when it produces one. */
  producesArtifact: ArtifactKind | null;
}

export const PIPELINE_STAGE_SPECS: Record<PipelineRunStage, PipelineStageSpec> = {
  discovery_planning: {
    stage: "discovery_planning",
    purpose: "Resolve the scan target into a bounded, crawlable surface plan.",
    requiresArtifacts: [],
    producesArtifact: null,
  },
  discovery_completion: {
    stage: "discovery_completion",
    purpose: "Finalize the discovery manifest that bounds the scan.",
    requiresArtifacts: [],
    producesArtifact: "discovery_manifest",
  },
  evidence_normalization: {
    stage: "evidence_normalization",
    purpose: "Normalize raw ingress into classified, provenanced evidence.",
    requiresArtifacts: ["discovery_manifest"],
    producesArtifact: "evidence_ingress",
  },
  evidence_validation: {
    stage: "evidence_validation",
    purpose: "Validate + bundle evidence (freshness, reliability, conflicts).",
    requiresArtifacts: ["evidence_ingress"],
    producesArtifact: "evidence_bundle",
  },
  graph_assembly: {
    stage: "graph_assembly",
    purpose: "Assemble the Intelligence Graph from the validated bundle.",
    requiresArtifacts: ["evidence_bundle"],
    producesArtifact: "intelligence_graph",
  },
  graph_snapshot: {
    stage: "graph_snapshot",
    purpose: "Freeze an immutable, checksummed graph snapshot for reasoning.",
    requiresArtifacts: ["intelligence_graph"],
    producesArtifact: "graph_snapshot",
  },
  reasoning_job_creation: {
    stage: "reasoning_job_creation",
    purpose: "Create the reasoning jobs the plan requires, bound to the snapshot.",
    requiresArtifacts: ["graph_snapshot"],
    producesArtifact: "reasoning_jobs",
  },
  provider_routing: {
    stage: "provider_routing",
    purpose: "Route each reasoning job to an eligible provider with a fallback chain.",
    requiresArtifacts: ["reasoning_jobs"],
    producesArtifact: null,
  },
  provider_execution: {
    stage: "provider_execution",
    purpose: "Execute the routed jobs through provider adapters under budget.",
    requiresArtifacts: ["reasoning_jobs"],
    producesArtifact: "execution_outcomes",
  },
  grounding_validation: {
    stage: "grounding_validation",
    purpose: "Promote only grounded, validated claims out of the execution outcomes.",
    requiresArtifacts: ["execution_outcomes"],
    producesArtifact: "validated_claims",
  },
  finding_synthesis: {
    stage: "finding_synthesis",
    purpose: "Derive deterministic findings from validated claims.",
    requiresArtifacts: ["validated_claims"],
    producesArtifact: "findings",
  },
  recommendation_candidates: {
    stage: "recommendation_candidates",
    purpose: "Construct evidence-linked recommendation candidates from findings.",
    requiresArtifacts: ["findings"],
    producesArtifact: "recommendation_candidates",
  },
  report_assembly: {
    stage: "report_assembly",
    purpose: "Assemble the internal intelligence report from validated artifacts only.",
    requiresArtifacts: ["findings", "recommendation_candidates"],
    producesArtifact: "internal_intelligence_report",
  },
};

export function pipelineStageSpec(stage: PipelineRunStage): PipelineStageSpec {
  return PIPELINE_STAGE_SPECS[stage];
}

/** The stage after `stage`, or null after `report_assembly`. Pure. */
export function nextPipelineStage(stage: PipelineRunStage): PipelineRunStage | null {
  const i = PIPELINE_STAGE_ORDER.indexOf(stage);
  if (i < 0 || i >= PIPELINE_STAGE_ORDER.length - 1) return null;
  return PIPELINE_STAGE_ORDER[i + 1]!;
}

/** A stage transition is legal iff `to` immediately follows `from`. Pure. */
export function canAdvanceStage(from: PipelineRunStage, to: PipelineRunStage): boolean {
  return nextPipelineStage(from) === to;
}

/**
 * The hard dependency gate: every artifact kind the stage requires must be
 * present in `availableKinds`. Returns the missing kinds ([] when satisfied). Pure.
 */
export function missingDependencies(stage: PipelineRunStage, availableKinds: readonly ArtifactKind[]): ArtifactKind[] {
  const have = new Set(availableKinds);
  return PIPELINE_STAGE_SPECS[stage].requiresArtifacts.filter((k) => !have.has(k));
}

export function stageDependenciesMet(stage: PipelineRunStage, availableKinds: readonly ArtifactKind[]): boolean {
  return missingDependencies(stage, availableKinds).length === 0;
}

/** Stages that consume an artifact kind (directly) — used for downstream invalidation. Pure. */
export function stagesDependingOn(kind: ArtifactKind): PipelineRunStage[] {
  return PIPELINE_STAGE_ORDER.filter((s) => PIPELINE_STAGE_SPECS[s].requiresArtifacts.includes(kind));
}
