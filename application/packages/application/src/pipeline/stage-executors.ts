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
  runCompetitorIntelligence,
  runProspectIntelligence,
  synthesizeProposalIntelligence,
  validateGrounding,
  type GroundingClaim,
  type GroundingContext,
  type ProposalCandidateInput,
  type RuntimeServices,
  type StageExecutor,
} from "@brightloop/domain";
import {
  evidenceBundleSchema,
  type CompetitorIntelligenceSnapshot,
  type EvidenceBundle,
  type EvidenceState,
  type FreshnessBand,
  type IntelligenceGraph,
  type PipelineRunStage,
  type ProposalIntelligenceSnapshot,
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

/**
 * Competitor Intelligence runtime step (C8) — deterministic, evidence-only.
 *
 * Runs between the graph and Prospect Intelligence, INSIDE finding_synthesis so
 * the flow's `competitor intelligence → prospect intelligence` adjacency holds
 * without adding a canonical pipeline stage (which would reorder the 13-stage
 * runtime — out of scope). It reads ONLY verified competitor evidence in the
 * bundle; with none it persists an explicit UNAVAILABLE snapshot and the runtime
 * continues. The persisted `competitor_snapshot` is content-addressed (its own
 * checksum), so re-execution/replay is idempotent — no duplicate artifact.
 */
async function ensureCompetitorSnapshot(deps: IntelligenceStageDeps, run: RuntimeRun, bundleArtifact: RuntimeArtifact): Promise<CompetitorIntelligenceSnapshot> {
  const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
  const snapshot = runCompetitorIntelligence({
    scanId: run.scanId,
    evidence: bundle.items,
    sourceArtifactIds: [bundleArtifact.id],
    now: deps.now(),
    idFor: (prefix) => `${prefix}:${run.scanId}:1`,
  });
  const persisted = await deps.runtime.artifacts.persist({
    runId: run.id,
    clientId: run.clientId,
    scanId: run.scanId,
    kind: "competitor_snapshot",
    envelope: snapshot as unknown as Record<string, unknown>,
    sourceArtifactIds: [bundleArtifact.id],
    checksum: snapshot.checksum,
  });
  if (!persisted.ok) throw new StageBlockedError("competitor_snapshot_unpersisted");
  return snapshot;
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
  /** C7 safe-candidate confidence (0–100). */
  confidence?: unknown;
  /** Legacy field name, still read for compatibility. */
  confidenceValue?: unknown;
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

    let index = 0;
    for (const raw of rawClaims) {
      const evidenceIds = Array.isArray(raw.evidenceIds) ? raw.evidenceIds.filter((x): x is string => typeof x === "string") : [];
      // Derive the claim's evidence facts from the bundle it references — the
      // strongest state + freshest band, and the evidence confidence as a CEILING.
      const facts = evidenceIds.map((id) => context.evidenceById.get(id)).filter((f): f is NonNullable<typeof f> => f !== undefined);
      const state = strongestState(facts.map((f) => f.state));
      const band = freshestBand(facts.map((f) => f.freshnessBand));
      const ceiling = facts.length === 0 ? 0 : Math.min(...facts.map((f) => f.confidenceValue));
      // Provider confidence is advisory and CANNOT exceed the evidence ceiling.
      const providerConf = typeof raw.confidence === "number" ? raw.confidence : typeof raw.confidenceValue === "number" ? raw.confidenceValue : ceiling;

      const claim: GroundingClaim = {
        id: typeof raw.id === "string" ? raw.id : `claim:${index}`,
        statement: typeof raw.statement === "string" ? raw.statement.slice(0, 400) : "",
        evidenceIds,
        evidenceState: state,
        confidenceValue: Math.max(0, Math.min(providerConf, ceiling)),
        freshnessBand: band,
        limitations: Array.isArray(raw.limitations) ? raw.limitations.filter((x): x is string => typeof x === "string") : [],
        isCausal: raw.isCausal === true,
        assertsMetric: raw.assertsMetric === true,
      };
      index += 1;
      const rejections = validateGrounding(claim, context);
      if (rejections.length === 0) grounded.push({ id: claim.id, claim: claim.statement, evidenceIds: claim.evidenceIds, evidenceState: claim.evidenceState, confidenceValue: claim.confidenceValue, grounded: true });
      else rejected.push({ id: claim.id, reasons: rejections.map((r) => r.reason) });
    }

    const enrichment = outcome === null ? null : (outcome.envelope["enrichment"] as { status?: unknown; rejectionCategories?: unknown } | undefined);
    return {
      envelope: {
        scanId: run.scanId,
        providerEnriched: grounded.length > 0,
        providerAttempted: outcome !== null,
        enrichmentStatus: outcome === null ? "unavailable" : typeof enrichment?.status === "string" ? enrichment.status : "attempted",
        claims: grounded,
        rejected,
        groundedCount: grounded.length,
        rejectedCount: rejected.length,
        parserRejectionCategories: Array.isArray(enrichment?.rejectionCategories) ? enrichment.rejectionCategories : [],
        note: outcome === null ? "No provider output — deterministic path only." : "Provider claims validated against evidence; ungrounded claims excluded.",
      },
      kind: "validated_claims",
      sourceArtifactIds: outcome === null ? [bundleArtifact.id] : [outcome.id, bundleArtifact.id],
    };
  };
}

const STATE_RANK: Record<EvidenceState, number> = { observed: 3, estimated: 2, inferred: 1, unavailable: 0 };
const BAND_RANK: Record<FreshnessBand, number> = { fresh: 3, recent: 2, stale: 1, expired: 0 };

/** The strongest evidence state among a claim's references (observed wins). */
function strongestState(states: EvidenceState[]): EvidenceState {
  if (states.length === 0) return "inferred";
  return states.reduce((best, s) => (STATE_RANK[s] > STATE_RANK[best] ? s : best), states[0]!);
}
/** The freshest band among a claim's references. */
function freshestBand(bands: FreshnessBand[]): FreshnessBand {
  if (bands.length === 0) return "expired";
  return bands.reduce((best, b) => (BAND_RANK[b] > BAND_RANK[best] ? b : best), bands[0]!);
}

/** finding_synthesis → findings (deterministic Prospect Intelligence; claims enrich). */
function findingSynthesis(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    // C8 · competitor intelligence runs BEFORE prospect intelligence (evidence-only,
    // deterministic; UNAVAILABLE snapshot when there is no competitor evidence).
    await ensureCompetitorSnapshot(deps, run, bundleArtifact);
    const { result } = assess(bundleArtifact, run.scanId, deps.now());
    const claims = await latest(deps, run.id, "validated_claims");
    const envelope = toFindingsEnvelope(result);
    envelope["providerEnriched"] = claims !== null && (claims.envelope["groundedCount"] as number ?? 0) > 0;
    envelope["reviewRequired"] = true;
    const sources = [bundleArtifact.id, ...(claims === null ? [] : [claims.id])];
    return { envelope, kind: "findings", sourceArtifactIds: sources };
  };
}

/**
 * Proposal Intelligence runtime step (C9) — deterministic, evidence-only.
 *
 * Converts the deterministic recommendation candidates into STRUCTURED proposal
 * objects. It runs INSIDE recommendation_candidates (right after the candidates
 * are derived, so the flow's `recommendations → proposal` adjacency holds) without
 * adding a canonical pipeline stage. Categories carrying both a strength and a
 * weakness are conflicting findings and reduce confidence; evidence confidence is
 * the ceiling. With no candidates it persists an UNAVAILABLE snapshot and the
 * runtime continues. The `proposal` artifact is content-addressed → idempotent.
 */
async function ensureProposalSnapshot(deps: IntelligenceStageDeps, run: RuntimeRun, result: ProspectIntelligenceResult, bundleArtifact: RuntimeArtifact, findingsId: string | null): Promise<ProposalIntelligenceSnapshot> {
  const bundle = evidenceBundleSchema.parse(bundleArtifact.envelope);
  const evidenceConfidence = new Map(bundle.items.map((i) => [i.id, i.confidence.value]));
  const weaknessCats = new Set(result.weaknesses.map((w) => w.category));
  const conflictedCategories = [...new Set(result.strengths.map((s) => s.category))].filter((c) => weaknessCats.has(c));
  const candidates: ProposalCandidateInput[] = result.recommendationInputs.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    problemStatement: r.problemStatement,
    proposedAction: r.proposedAction,
    affectedDimensions: r.affectedDimensions,
    impact: r.impact,
    effort: r.effort,
    evidenceIds: r.evidenceIds,
    riskIds: r.riskIds,
    confidence: r.confidence.value,
    limitations: r.limitations,
  }));
  const lineage = [bundleArtifact.id, ...(findingsId === null ? [] : [findingsId])];
  const snapshot = synthesizeProposalIntelligence({
    scanId: run.scanId,
    candidates,
    conflictedCategories,
    evidenceConfidence,
    sourceArtifactIds: lineage,
    now: deps.now(),
    idFor: (prefix, index) => `${prefix}:${run.scanId}:${index + 1}`,
  });
  const persisted = await deps.runtime.artifacts.persist({
    runId: run.id,
    clientId: run.clientId,
    scanId: run.scanId,
    kind: "proposal",
    envelope: snapshot as unknown as Record<string, unknown>,
    sourceArtifactIds: lineage,
    checksum: snapshot.checksum,
  });
  if (!persisted.ok) throw new StageBlockedError("proposal_unpersisted");
  return snapshot;
}

/** recommendation_candidates → recommendation_candidates (deterministic inputs). */
function recommendationCandidates(deps: IntelligenceStageDeps): StageExecutor {
  return async (_stage, run) => {
    const bundleArtifact = await requireArtifact(deps, run.id, "evidence_bundle", "evidence_bundle_missing");
    const findings = await latest(deps, run.id, "findings");
    const { result } = assess(bundleArtifact, run.scanId, deps.now());
    // C9 · Proposal Intelligence runs right after the recommendation candidates.
    await ensureProposalSnapshot(deps, run, result, bundleArtifact, findings === null ? null : findings.id);
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
    const competitor = await latest(deps, run.id, "competitor_snapshot");
    const proposal = await latest(deps, run.id, "proposal");

    const envelope = toInternalReportEnvelope(result);
    envelope["graphSummary"] =
      snapshot === null ? null : { nodeCount: snapshot.envelope["nodeCount"], edgeCount: snapshot.envelope["edgeCount"], checksum: snapshot.envelope["checksum"] };

    // C8 · Competitor Intelligence — a bounded, deterministic report section read
    // from the persisted snapshot. When no competitor evidence exists the section
    // is present with status `unavailable` (the runtime never fails on absence).
    envelope["competitorIntelligence"] = competitor === null ? UNAVAILABLE_COMPETITOR_SECTION : summarizeCompetitor(competitor.envelope as unknown as CompetitorIntelligenceSnapshot);

    // C9 · Proposal Intelligence — a bounded, deterministic report section read
    // from the persisted snapshot. Present with status `unavailable` when evidence
    // is insufficient; the runtime never fails on absence.
    envelope["proposalIntelligence"] = proposal === null ? UNAVAILABLE_PROPOSAL_SECTION : summarizeProposal(proposal.envelope as unknown as ProposalIntelligenceSnapshot);

    // Safe provider-enrichment metadata only — counts + status + safe reason
    // codes, never claim text or provider payloads.
    const groundedCount = claims === null ? 0 : (claims.envelope["groundedCount"] as number ?? 0);
    const rejectedCount = claims === null ? 0 : (claims.envelope["rejectedCount"] as number ?? 0);
    envelope["providerEnrichment"] = {
      status: claims === null ? "unavailable" : (claims.envelope["enrichmentStatus"] as string ?? "attempted"),
      deterministicOnly: groundedCount === 0,
      acceptedClaims: groundedCount,
      rejectedClaims: rejectedCount,
      rejectionCategories: claims === null ? [] : (claims.envelope["parserRejectionCategories"] as unknown[] ?? []),
    };

    const sources = [bundleArtifact.id, ...[snapshot, claims, findings, recs, competitor, proposal].filter((a): a is RuntimeArtifact => a !== null).map((a) => a.id)];
    return { envelope, kind: "internal_intelligence_report", sourceArtifactIds: sources };
  };
}

/** The proposal report section when no snapshot exists (evidence absent, safe). */
const UNAVAILABLE_PROPOSAL_SECTION = {
  status: "unavailable",
  reason: "insufficient_evidence",
  proposalCount: 0,
  critical: 0,
  high: 0,
  medium: 0,
  low: 0,
  confidence: 0,
  confidenceBand: "very_low",
  reviewRequired: false,
  summary: "Unavailable — insufficient evidence to propose work.",
} as const;

/**
 * Bounded, deterministic proposal report section — status, counts, confidence.
 * Never dumps the full proposal set into the report.
 */
function summarizeProposal(snapshot: ProposalIntelligenceSnapshot): Record<string, unknown> {
  return {
    status: snapshot.status,
    reason: snapshot.reason,
    proposalCount: snapshot.proposals.length,
    critical: snapshot.counts.critical,
    high: snapshot.counts.high,
    medium: snapshot.counts.medium,
    low: snapshot.counts.low,
    conflicts: snapshot.conflicts,
    confidence: snapshot.confidence.value,
    confidenceBand: snapshot.confidence.band,
    reviewRequired: snapshot.reviewRequired,
    summary: snapshot.summary,
  };
}

/** The competitor report section when no snapshot exists (evidence absent, safe). */
const UNAVAILABLE_COMPETITOR_SECTION = {
  status: "unavailable",
  reason: "no_competitor_evidence",
  competitorCount: 0,
  marketPosition: "undetermined",
  keyDifferentiators: [] as string[],
  opportunityCount: 0,
  threatCount: 0,
  confidence: 0,
  confidenceBand: "very_low",
  reviewRequired: false,
  summary: "Unavailable — no verified competitor evidence.",
} as const;

/**
 * Bounded, deterministic competitor report section — counts + status + a small
 * cap of differentiator statements. Never dumps the full snapshot into the report.
 */
function summarizeCompetitor(snapshot: CompetitorIntelligenceSnapshot): Record<string, unknown> {
  return {
    status: snapshot.status,
    reason: snapshot.reason,
    competitorCount: snapshot.competitors.length,
    marketPosition: snapshot.marketPosition,
    keyDifferentiators: snapshot.differentiators.slice(0, 5).map((d) => d.statement),
    opportunityCount: snapshot.opportunities.length,
    threatCount: snapshot.threats.length,
    conflicts: snapshot.conflicts,
    confidence: snapshot.confidence.value,
    confidenceBand: snapshot.confidence.band,
    evidenceCount: snapshot.evidenceIds.length,
    reviewRequired: snapshot.reviewRequired,
    summary: snapshot.summary,
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
  // C7: the provider executor persists SAFE candidates under `enrichment.candidates`.
  const enrichment = envelope["enrichment"];
  if (enrichment !== null && typeof enrichment === "object") {
    const candidates = (enrichment as Record<string, unknown>)["candidates"];
    if (Array.isArray(candidates)) return candidates as RawClaim[];
  }
  // Legacy fallbacks (top-level / nested) — read defensively; never assume a shape.
  const direct = envelope["claims"];
  if (Array.isArray(direct)) return direct as RawClaim[];
  const response = envelope["response"];
  if (response !== null && typeof response === "object") {
    const nested = (response as Record<string, unknown>)["claims"];
    if (Array.isArray(nested)) return nested as RawClaim[];
  }
  return [];
}
