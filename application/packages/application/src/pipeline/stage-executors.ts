/* =============================================================================
 * Deterministic intelligence stage executors (Phase C · Sprint C6.2) — PURE
 * ORCHESTRATION.
 *
 * Wires the deterministic intelligence engines into the CANONICAL runtime
 * pipeline as real stage executors, resolved by the same registry shape the
 * C2/C3 registries use, so the controlled driver advances them one stage per
 * turn:
 *
 *   evidence_validation      → evidence_bundle        (Evidence Engine)   [C6.2a]
 *   graph_assembly           → intelligence_graph     (Graph Engine)      [C6.2a]
 *   graph_snapshot           → graph_snapshot         (Graph Engine)      [C6.2a]
 *   reasoning_job_creation   → reasoning_jobs         (Reasoning Engine)  [C6.2b]
 *   provider_routing         → (control-only, no artifact)               [C6.2b]
 *   grounding_validation     → validated_claims       (Grounding guards)  [C6.2b]
 *   finding_synthesis        → findings               (Prospect Intel)    [C6.2b]
 *   recommendation_candidates→ recommendation_candidates (Prospect Intel) [C6.2b]
 *   report_assembly          → internal_intelligence_report (report adapter)[C6.2b]
 *
 * `provider_execution` stays with the C2 provider registry.
 *
 * Each executor validates its prerequisite, loads the exact upstream artifact,
 * invokes ONE existing domain capability, and returns typed `StageWork`. The
 * runtime engine owns persistence, checksums, lineage, events, checkpointing and
 * idempotent replay. This module reproduces no scoring, invents nothing, and
 * calls no provider or network.
 *
 * ██ PROVIDER-OPTIONAL BY DESIGN ██
 *   The deterministic path completes to a report with NO provider. Grounding
 *   consumes `execution_outcomes` only when the provider produced them; when it
 *   did not (the default, disabled config), grounding yields an empty
 *   `validated_claims` and the deterministic Prospect-Intelligence findings and
 *   report still complete — with the missing enrichment marked.
 * ========================================================================== */

import {
  StageBlockedError,
  assembleGraph,
  createSnapshot,
  newReasoningJob,
  runProspectIntelligence,
  validateGrounding,
  type GroundingClaim,
  type GroundingContext,
  type RuntimeServices,
  type StageExecutor,
} from "@brightloop/domain";
import {
  evidenceBundleSchema,
  type EvidenceBundle,
  type EvidenceState,
  type FreshnessBand,
  type IntelligenceGraph,
  type PipelineRunStage,
  type ProspectIntelligenceResult,
  type RuntimeArtifact,
  type RuntimeArtifactKind,
  type RuntimeRun,
} from "@brightloop/schema";
import { normalizeDiscoveryToEvidence } from "./evidence-bridge.js";
import { toFindingsEnvelope, toInternalReportEnvelope, toRecommendationEnvelope } from "./report-adapter.js";

/** The canonical deterministic stages this registry owns. */
export const INTELLIGENCE_STAGE_KEYS: ReadonlySet<PipelineRunStage> = new Set<PipelineRunStage>([
  "evidence_validation",
  "graph_assembly",
  "graph_snapshot",
  "reasoning_job_creation",
  "provider_routing",
  "grounding_validation",
  "finding_synthesis",
  "recommendation_candidates",
  "report_assembly",
]);

export type IntelligenceStageSupport =
  | { kind: "executable"; execute: StageExecutor }
  | { kind: "blocked"; reason: string };

export interface IntelligenceStageRegistry {
  resolve(stage: PipelineRunStage, run: RuntimeRun): IntelligenceStageSupport;
}

export interface IntelligenceStageDeps {
  runtime: RuntimeServices;
  now: () => string;
  /** Token caps for the reasoning-job budget (safety envelope only; no cost incurred). */
  reasoningInputTokens?: number;
  reasoningOutputTokens?: number;
}

/* ---- artifact helpers -------------------------------------------------------- */

async function latest(deps: IntelligenceStageDeps, runId: string, kind: RuntimeArtifactKind): Promise<RuntimeArtifact | null> {
  const result = await deps.runtime.artifacts.latest(runId, kind);
  if (!result.ok) throw new StageBlockedError(`${kind}_unreadable`);
  return result.value;
}

async function requireArtifact(deps: IntelligenceStageDeps, runId: string, kind: RuntimeArtifactKind, missing: string): Promise<RuntimeArtifact> {
  const value = await latest(deps, runId, kind);
  if (value === null) throw new StageBlockedError(missing);
  return value;
}

/** Run Prospect Intelligence from a persisted evidence bundle. Deterministic. */
function assess(bundleArtifact: RuntimeArtifact, scanId: string, now: string): { result: ProspectIntelligenceResult; bundleId: string } {
  const bundle: EvidenceBundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
  const result = runProspectIntelligence({
    scanId,
    evidence: bundle.items,
    sourceArtifactIds: [bundleArtifact.id],
    idFor: (prefix, index) => `${prefix}:${scanId}:${index}`,
    now,
  });
  return { result, bundleId: bundleArtifact.id };
}

/* ---- C6.2a · evidence + graph ------------------------------------------------ */

function evidenceValidation(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const manifest = await requireArtifact(deps, run.id, "discovery_manifest", "discovery_manifest_missing");
    const bridge = normalizeDiscoveryToEvidence(manifest.envelope, run.scanId, deps.now(), (s) => `ev:${run.scanId}:${s}`);
    return { envelope: { scanId: run.scanId, items: bridge.items }, kind: "evidence_bundle", sourceArtifactIds: [manifest.id] };
  };
}

function graphAssembly(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
    const graph = assembleGraph(bundle, deps.now(), run.clientId);
    return { envelope: graph as unknown as Record<string, unknown>, kind: "intelligence_graph", sourceArtifactIds: [bundleArtifact.id] };
  };
}

function graphSnapshot(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const graphArtifact = await requireArtifact(deps, run.id, "intelligence_graph", "intelligence_graph_missing");
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const graph = graphArtifact.envelope as unknown as IntelligenceGraph;
    const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
    const snapshot = createSnapshot(graph, bundle, graphArtifact.version, deps.now());
    return { envelope: snapshot as unknown as Record<string, unknown>, kind: "graph_snapshot", sourceArtifactIds: [graphArtifact.id] };
  };
}

/* ---- C6.2b · reasoning · grounding · findings · report ----------------------- */

/** reasoning_job_creation → reasoning_jobs (deterministic job from the snapshot). */
function reasoningJobCreation(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const snapshotArtifact = await requireArtifact(deps, run.id, "graph_snapshot", "graph_snapshot_missing");
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const snapshot = snapshotArtifact.envelope as { checksum?: unknown };
    const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
    const evidenceIds = bundle.items.filter((i) => i.state !== "unavailable").map((i) => i.id);

    const job = newReasoningJob(
      {
        id: `job:${run.scanId}:executive_summary`,
        scanId: run.scanId,
        clientId: run.clientId,
        taskType: "reasoning",
        stage: "executive_summary",
        inputRefs: { evidenceIds, graphSnapshotChecksum: typeof snapshot.checksum === "string" ? snapshot.checksum : null, discoveryManifestId: null, graphRefs: [] },
        requiredOutputs: ["execution_outcomes"],
        budget: { costCeiling: 0, inputTokens: deps.reasoningInputTokens ?? 8000, outputTokens: deps.reasoningOutputTokens ?? 2000, latencyCeilingMs: 30_000 },
      },
      deps.now(),
    );

    return { envelope: { scanId: run.scanId, jobs: [job], note: "Structured reasoning job only — no model prose is stored." }, kind: "reasoning_jobs", sourceArtifactIds: [snapshotArtifact.id] };
  };
}

/**
 * provider_routing — CONTROL-ONLY. It verifies a reasoning job exists and leaves
 * routing to the provider registry's own cost-aware selection at execution time;
 * it persists NO artifact (the canonical spec declares `producesArtifact: null`).
 * Provider disabled still passes here — execution is where the kill switch bites.
 */
function providerRouting(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    await requireArtifact(deps, run.id, "reasoning_jobs", "reasoning_jobs_missing");
    return { envelope: null, kind: null };
  };
}

interface RawClaim {
  id?: unknown;
  statement?: unknown;
  evidenceIds?: unknown;
  evidenceState?: unknown;
  confidenceValue?: unknown;
  freshnessBand?: unknown;
  limitations?: unknown;
  isCausal?: unknown;
  assertsMetric?: unknown;
}

/**
 * grounding_validation → validated_claims.
 *
 * Consumes `execution_outcomes` WHEN PRESENT and validates each provider claim
 * against the evidence bundle's facts using the existing anti-hallucination
 * guards. Only grounded claims pass; raw provider prose never becomes a finding.
 * When no execution outcome exists (provider disabled), it yields an EMPTY
 * validated set — the deterministic path continues without enrichment.
 */
function groundingValidation(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
    const outcome = await latest(deps, run.id, "execution_outcomes");

    const context: GroundingContext = {
      evidenceById: new Map(bundle.items.map((i) => [i.id, { state: i.state as EvidenceState, freshnessBand: i.freshness.band as FreshnessBand, confidenceValue: i.confidence.value }])),
      knownCompetitorIds: new Set(),
      prohibitedClaims: [],
    };

    const rawClaims: RawClaim[] = outcome === null ? [] : extractClaims(outcome.envelope);
    const grounded: unknown[] = [];
    const rejected: unknown[] = [];

    for (const raw of rawClaims) {
      const claim: GroundingClaim = {
        id: typeof raw.id === "string" ? raw.id : `claim:${grounded.length + rejected.length}`,
        statement: typeof raw.statement === "string" ? raw.statement.slice(0, 2000) : "",
        evidenceIds: Array.isArray(raw.evidenceIds) ? raw.evidenceIds.filter((x): x is string => typeof x === "string") : [],
        evidenceState: isState(raw.evidenceState) ? raw.evidenceState : "inferred",
        confidenceValue: typeof raw.confidenceValue === "number" ? raw.confidenceValue : 0,
        freshnessBand: isBand(raw.freshnessBand) ? raw.freshnessBand : "expired",
        limitations: Array.isArray(raw.limitations) ? raw.limitations.filter((x): x is string => typeof x === "string") : [],
        isCausal: raw.isCausal === true,
        assertsMetric: raw.assertsMetric === true,
      };
      const rejections = validateGrounding(claim, context);
      if (rejections.length === 0) grounded.push({ id: claim.id, claim: claim.statement, evidenceIds: claim.evidenceIds, evidenceState: claim.evidenceState, confidenceValue: claim.confidenceValue, grounded: true });
      else rejected.push({ id: claim.id, reasons: rejections.map((r) => r.reason) });
    }

    return {
      envelope: {
        scanId: run.scanId,
        providerEnriched: outcome !== null,
        claims: grounded,
        rejected,
        groundedCount: grounded.length,
        rejectedCount: rejected.length,
        note: outcome === null ? "No provider output — deterministic path only." : "Provider claims validated against evidence; ungrounded claims excluded.",
      },
      kind: "validated_claims",
      sourceArtifactIds: outcome === null ? [bundleArtifact.id] : [outcome.id, bundleArtifact.id],
    };
  };
}

/** finding_synthesis → findings (deterministic Prospect Intelligence; claims enrich). */
function findingSynthesis(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const { result } = assess(bundleArtifact, run.scanId, deps.now());
    const claims = await latest(deps, run.id, "validated_claims");
    const envelope = toFindingsEnvelope(result);
    envelope["providerEnriched"] = claims !== null && (claims.envelope["groundedCount"] as number ?? 0) > 0;
    envelope["reviewRequired"] = true;
    const sources = [bundleArtifact.id, ...(claims === null ? [] : [claims.id])];
    return { envelope, kind: "findings", sourceArtifactIds: sources };
  };
}

/** recommendation_candidates → recommendation_candidates (deterministic inputs). */
function recommendationCandidates(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const findings = await latest(deps, run.id, "findings");
    const { result } = assess(bundleArtifact, run.scanId, deps.now());
    return {
      envelope: toRecommendationEnvelope(result),
      kind: "recommendation_candidates",
      sourceArtifactIds: findings === null ? [bundleArtifact.id] : [findings.id],
    };
  };
}

/** report_assembly → internal_intelligence_report (reuses the C6.1 adapter). */
function reportAssembly(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const { result } = assess(bundleArtifact, run.scanId, deps.now());
    const snapshot = await latest(deps, run.id, "graph_snapshot");
    const claims = await latest(deps, run.id, "validated_claims");
    const findings = await latest(deps, run.id, "findings");
    const recs = await latest(deps, run.id, "recommendation_candidates");

    const envelope = toInternalReportEnvelope(result);
    envelope["graphSummary"] =
      snapshot === null ? null : { nodeCount: snapshot.envelope["nodeCount"], edgeCount: snapshot.envelope["edgeCount"], checksum: snapshot.envelope["checksum"] };
    envelope["groundedClaimSummary"] = { providerEnriched: claims !== null && (claims.envelope["groundedCount"] as number ?? 0) > 0, groundedCount: claims === null ? 0 : (claims.envelope["groundedCount"] as number ?? 0) };

    const sources = [bundleArtifact.id, ...[snapshot, claims, findings, recs].filter((a): a is RuntimeArtifact => a !== null).map((a) => a.id)];
    return { envelope, kind: "internal_intelligence_report", sourceArtifactIds: sources };
  };
}

/* ---- registry ---------------------------------------------------------------- */

export function createIntelligenceStageRegistry(deps: IntelligenceStageDeps): IntelligenceStageRegistry {
  const executors: Partial<Record<PipelineRunStage, StageExecutor>> = {
    evidence_validation: evidenceValidation(deps),
    graph_assembly: graphAssembly(deps),
    graph_snapshot: graphSnapshot(deps),
    reasoning_job_creation: reasoningJobCreation(deps),
    provider_routing: providerRouting(deps),
    grounding_validation: groundingValidation(deps),
    finding_synthesis: findingSynthesis(deps),
    recommendation_candidates: recommendationCandidates(deps),
    report_assembly: reportAssembly(deps),
  };

  return {
    resolve(stage: PipelineRunStage): IntelligenceStageSupport {
      const execute = executors[stage];
      if (execute === undefined) return { kind: "blocked", reason: `stage '${stage}' is not a deterministic intelligence stage` };
      return { kind: "executable", execute };
    },
  };
}

/* ---- claim extraction (defensive) -------------------------------------------- */

function extractClaims(envelope: Record<string, unknown>): RawClaim[] {
  // The provider's structured output may carry claims either at the top level or
  // under `response.claims`. Read defensively; never assume a shape.
  const direct = envelope["claims"];
  if (Array.isArray(direct)) return direct as RawClaim[];
  const response = envelope["response"];
  if (response !== null && typeof response === "object") {
    const nested = (response as Record<string, unknown>)["claims"];
    if (Array.isArray(nested)) return nested as RawClaim[];
  }
  return [];
}

function isState(v: unknown): v is EvidenceState {
  return v === "observed" || v === "estimated" || v === "inferred" || v === "unavailable";
}
function isBand(v: unknown): v is FreshnessBand {
  return v === "fresh" || v === "recent" || v === "stale" || v === "expired";
}
