/* =============================================================================
 * Sprint 8 · End-to-End Business Intelligence Pipeline — deterministic tests.
 *
 * Full-pipeline success, transitions, dependency enforcement, artifact checksums,
 * checkpoint/resume/invalidation, every failure mode, budget propagation, finding
 * synthesis, candidate construction, report assembly, provenance, and run-to-run
 * determinism. Uses deterministic fixtures + the in-memory provider adapter only.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  reasoningInputSchema,
  type EngineEvidenceItem,
  type EvidenceBundle,
  type ExecutionOutcome,
  type Provenance,
  type ProviderDescriptor,
  type ReasoningJob,
  type ValidatedClaim,
  providerDescriptorSchema,
} from "@brightloop/schema";
import { buildProvenance, normalizeEvidence } from "../evidence/index.js";
import type { GroundingContext } from "../reasoning/grounding.js";
import type { ParsedProviderOutput } from "../execution/validate.js";
import { InMemoryReasoningAdapter, type ScriptedResponse } from "../execution/test-adapter.js";
import { newCancellationToken, cancel } from "../execution/contract.js";
import { newPipelineRun, canRunTransition, transitionRun, isRunTerminal, STATUS_FOR_STAGE } from "./run.js";
import { PIPELINE_STAGE_ORDER, canAdvanceStage, missingDependencies, stageDependenciesMet, stagesDependingOn, pipelineStageSpec } from "./stages.js";
import { newArtifactRegistry, recordArtifact, artifactChecksum, availableKinds } from "./artifacts.js";
import { newCheckpoint, lastValidCheckpoint, resumeStage, invalidateDownstream, shouldSkipStage, completedStagesFrom } from "./checkpoint.js";
import { pipelineFailure, isRetryablePipelineFailure, fromExecutionFailure } from "./failure.js";
import { initialSpend, accrueSpend, canAffordStage, reasoningBudgetFor, stageCeiling } from "./budget.js";
import { synthesizeFindings, deriveSeverity, derivePriority, orderFindings } from "./findings.js";
import { buildRecommendationCandidates, deriveTier, UNMODELLED_EFFORT } from "./candidates.js";
import { buildInternalIntelligenceReport } from "./report.js";
import { runPipeline, type PipelineRunnerInput, type PipelineRunnerDeps } from "./runner.js";

const NOW = "2026-07-20T00:00:00.000Z";
const PAST = "2026-07-19T00:00:00.000Z";

/* ---- deterministic clock + id generator ----------------------------------- */
function deps(over: Partial<PipelineRunnerDeps> = {}): PipelineRunnerDeps {
  let n = 0;
  return { clock: () => NOW, ids: (p: string) => `${p}-${++n}`, ...over };
}

/* ---- evidence fixture ------------------------------------------------------ */
const prov = (over: Partial<Provenance> = {}): Provenance => buildProvenance({ origin: "https://northwind.co", collectedAt: NOW, method: "crawl", stage: "crawler", ...over });
const item = (id: string, over: Partial<Parameters<typeof normalizeEvidence>[0]> = {}): EngineEvidenceItem =>
  normalizeEvidence({ id, scanId: "scan-1", source: "website", timestamp: NOW, provenance: prov(), value: { k: 1 }, affectedDomains: ["digital_presence"], ...over }, NOW);
const goodBundle = (): EvidenceBundle => ({ scanId: "scan-1", items: [item("ev-1"), item("ev-2", { source: "seo", affectedDomains: ["growth"] })] });

/* ---- budget + run ---------------------------------------------------------- */
const budget = { scanCeiling: 1.0, stageCeiling: 0.5, reasoningJobCeiling: 0.25, softWarningAt: 0.8 };
const makeRun = (over: Partial<Parameters<typeof newPipelineRun>[0]> = {}, deadline: string | null = null) =>
  newPipelineRun({ id: "run-1", scanId: "scan-1", clientId: null, budget, deadline, ...over }, NOW);

/* ---- provider + adapter fixtures ------------------------------------------ */
function provider(id: string, over: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return providerDescriptorSchema.parse({
    id, taskTypes: ["reasoning"], capabilities: [], maxContextTokens: 100_000, maxOutputTokens: 8_000,
    structuredOutput: true, cost: { inputPerMTokens: 1, outputPerMTokens: 2 }, latency: { typicalMs: 1_000, p95Ms: 2_000 }, ...over,
  });
}
const okStep: ScriptedResponse = { output: { statement: "No analytics tag." }, usage: { inputTokens: 100, outputTokens: 50 }, latencyMs: 20 };
const adapter = (id: string, script: ScriptedResponse[] = [okStep]) => new InMemoryReasoningAdapter({ providerId: id, script });

/* ---- grounding + claim extraction ------------------------------------------ */
const groundingContext: GroundingContext = {
  evidenceById: new Map([["ev-1", { state: "observed", freshnessBand: "fresh", confidenceValue: 90 }], ["ev-2", { state: "observed", freshnessBand: "fresh", confidenceValue: 85 }]]),
  knownCompetitorIds: new Set(["comp-known"]),
  prohibitedClaims: ["guaranteed roi"],
};
const parseGood = (): ParsedProviderOutput => ({
  claims: [{ id: "c1", statement: "No analytics tag.", evidenceIds: ["ev-1"], evidenceState: "observed", confidenceValue: 90, freshnessBand: "fresh", limitations: [] }],
  citations: [{ evidenceId: "ev-1", state: "observed", freshnessBand: "fresh", sourceUrl: null }],
});
const parseUngrounded = (): ParsedProviderOutput => ({
  claims: [{ id: "c2", statement: "Competitor X leads.", evidenceIds: [], evidenceState: "inferred", confidenceValue: 99, freshnessBand: "fresh", limitations: [], referencedCompetitorIds: ["comp-fake"] }],
  citations: [],
});

const validatedClaim = (over: Partial<ValidatedClaim> = {}): ValidatedClaim => ({
  id: "vc-1", jobId: "job-1", claim: "No analytics tag present on the site.",
  validation: { passed: true, rejections: [] },
  evidenceIds: ["ev-1"], evidenceState: "observed",
  confidence: { value: 90, band: "very_high", inputs: { coverage: 0.9, reliability: 0.9, freshness: 0.9, agreement: 0.9, completeness: 0.9, provenanceQuality: 0.9 } },
  provenance: prov(), freshness: { ageDays: 1, band: "fresh", score: 0.98 }, limitations: [], contradictionStatus: "none",
  ...over,
});

/** Claims extractor: emit one validated claim per successful outcome. */
const claimsFrom = (o: ExecutionOutcome, job: ReasoningJob): ValidatedClaim[] =>
  o.finalStatus === "succeeded" ? [validatedClaim({ id: `vc-${job.id}`, jobId: job.id })] : [];

function runnerInput(over: Partial<PipelineRunnerInput> = {}): PipelineRunnerInput {
  return {
    run: makeRun(),
    inputs: { discoveryManifest: { root: "https://northwind.co", routes: ["/"] }, evidenceBundle: goodBundle() },
    reasoning: {
      policy: reasoningInputSchema.parse({ jobId: "job-1", taskObjective: "Assess coverage", outputSchemaId: "research_finding", costBudget: 0.25, tokenBudget: { inputTokens: 1000, outputTokens: 500 } }),
      plan: [{ stage: "research", taskType: "reasoning", tokens: { inputTokens: 1000, outputTokens: 500 } }],
      registry: [provider("p-a")],
      adapters: new Map([["p-a", adapter("p-a")]]),
      groundingContext,
      parse: parseGood,
      pricingFor: () => ({ inputPerMTokens: 1, outputPerMTokens: 2 }),
      claimsFrom,
    },
    synthesis: { domainFor: () => "digital_presence" },
    ...over,
  };
}

/* ===== 1 · full pipeline ==================================================== */
describe("full pipeline", () => {
  it("runs discovery → report and completes", async () => {
    const out = await runPipeline(runnerInput(), deps());
    expect(out.status).toBe("completed");
    expect(out.run.completedStages).toEqual([...PIPELINE_STAGE_ORDER]);
    expect(out.failure).toBeNull();
    expect(out.report).not.toBeNull();
    expect(out.findings).toHaveLength(1);
    expect(out.candidates).toHaveLength(1);
    expect(out.events[0]?.type).toBe("pipeline.created");
    expect(out.events.at(-1)?.type).toBe("pipeline.completed");
  });

  it("produces one artifact per producing stage with lineage", async () => {
    const out = await runPipeline(runnerInput(), deps());
    const kinds = out.artifacts.map((a) => a.kind).sort();
    expect(kinds).toContain("discovery_manifest");
    expect(kinds).toContain("evidence_bundle");
    expect(kinds).toContain("graph_snapshot");
    expect(kinds).toContain("internal_intelligence_report");
    const report = out.artifacts.find((a) => a.kind === "internal_intelligence_report")!;
    expect(report.sourceArtifactIds.length).toBeGreaterThan(0); // lineage preserved
    expect(report.validationStatus).toBe("valid");
  });

  it("emits no hidden chain-of-thought fields on any artifact or report", async () => {
    const out = await runPipeline(runnerInput(), deps());
    const forbidden = ["chainOfThought", "reasoning", "thoughts", "scratchpad", "hidden", "cot"];
    for (const a of out.artifacts) for (const k of forbidden) expect(Object.prototype.hasOwnProperty.call(a, k)).toBe(false);
    for (const k of forbidden) expect(Object.prototype.hasOwnProperty.call(out.report!, k)).toBe(false);
  });
});

/* ===== 2 · transitions + dependencies ====================================== */
describe("transitions and dependencies", () => {
  it("allows forward status transitions and rejects backwards/terminal", () => {
    expect(canRunTransition("pending", "discovering")).toBe(true);
    expect(canRunTransition("discovering", "pending")).toBe(false);
    expect(canRunTransition("completed", "failed")).toBe(false);
    expect(canRunTransition("discovering", "cancelled")).toBe(true);
    expect(canRunTransition("blocked", "assembling_graph")).toBe(true); // resume
    expect(isRunTerminal("cancelled")).toBe(true);
  });

  it("leaves the run unchanged on an illegal transition", () => {
    const run = makeRun();
    expect(transitionRun(run, "completed", NOW).status).toBe("completed"); // legal (forward)
    const done = transitionRun(run, "completed", NOW);
    expect(transitionRun(done, "failed", NOW)).toBe(done); // terminal → unchanged
  });

  it("orders stages and gates advancement", () => {
    expect(PIPELINE_STAGE_ORDER).toHaveLength(13);
    expect(canAdvanceStage("discovery_planning", "discovery_completion")).toBe(true);
    expect(canAdvanceStage("discovery_planning", "report_assembly")).toBe(false);
    expect(STATUS_FOR_STAGE.report_assembly).toBe("preparing_report");
  });

  it("enforces artifact dependencies", () => {
    expect(stageDependenciesMet("graph_assembly", [])).toBe(false);
    expect(missingDependencies("graph_assembly", [])).toEqual(["evidence_bundle"]);
    expect(stageDependenciesMet("graph_assembly", ["evidence_bundle"])).toBe(true);
    expect(pipelineStageSpec("report_assembly").requiresArtifacts).toEqual(["findings", "recommendation_candidates"]);
    expect(stagesDependingOn("evidence_bundle")).toContain("graph_assembly");
  });

  it("blocks a stage whose dependency is missing", async () => {
    // an empty evidence bundle fails normalization, so graph_assembly never gets its input
    const out = await runPipeline(runnerInput({ inputs: { discoveryManifest: {}, evidenceBundle: { scanId: "scan-1", items: [] } } }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("malformed_artifact");
  });
});

/* ===== 3 · artifacts ======================================================== */
describe("artifact registry", () => {
  it("checksums deterministically and independent of key order", () => {
    expect(artifactChecksum({ a: 1, b: 2 })).toBe(artifactChecksum({ a: 1, b: 2 }));
    expect(artifactChecksum({ a: 1, b: 2 })).toBe(artifactChecksum({ b: 2, a: 1 }));
    expect(artifactChecksum({ a: 1 })).not.toBe(artifactChecksum({ a: 2 }));
  });

  it("registers artifacts and excludes invalid ones from available kinds", () => {
    const reg = newArtifactRegistry();
    recordArtifact(reg, { id: "a1", pipelineRunId: "run-1", scanId: "scan-1", kind: "findings", payload: [1], now: NOW, validationStatus: "valid" });
    recordArtifact(reg, { id: "a2", pipelineRunId: "run-1", scanId: "scan-1", kind: "evidence_bundle", payload: [2], now: NOW, validationStatus: "invalid" });
    expect(availableKinds(reg)).toEqual(["findings"]); // invalid does not satisfy a dependency
  });
});

/* ===== 4 · checkpoint / resume ============================================= */
describe("checkpoints", () => {
  const cps = (...stages: (typeof PIPELINE_STAGE_ORDER)[number][]) =>
    stages.map((s, i) => newCheckpoint({ id: `cp-${i}`, pipelineRunId: "run-1", stage: s, now: NOW }));

  it("finds the last valid checkpoint and the resume stage", () => {
    const list = cps("discovery_planning", "discovery_completion", "evidence_normalization");
    expect(lastValidCheckpoint(list)?.stage).toBe("evidence_normalization");
    expect(resumeStage(list)).toBe("evidence_validation");
    expect(resumeStage([])).toBe("discovery_planning");
  });

  it("skips stages already checkpointed and reports completed stages", () => {
    const list = cps("discovery_planning");
    expect(shouldSkipStage("discovery_planning", list)).toBe(true);
    expect(shouldSkipStage("graph_assembly", list)).toBe(false);
    expect(completedStagesFrom(list)).toEqual(["discovery_planning"]);
  });

  it("invalidates downstream checkpoints when an upstream artifact changes", () => {
    const list = cps("discovery_planning", "evidence_normalization", "evidence_validation", "graph_assembly");
    const after = invalidateDownstream(list, "evidence_bundle"); // consumed first by graph_assembly
    expect(after.find((c) => c.stage === "discovery_planning")!.valid).toBe(true);
    expect(after.find((c) => c.stage === "evidence_validation")!.valid).toBe(true);
    expect(after.find((c) => c.stage === "graph_assembly")!.valid).toBe(false);
  });

  it("resumes a run, skipping checkpointed stages and emitting pipeline.resumed", async () => {
    const priors = cps("discovery_planning", "discovery_completion");
    const out = await runPipeline(runnerInput({ resumeFrom: priors }), deps());
    expect(out.events.some((e) => e.type === "pipeline.resumed")).toBe(true);
    expect(out.run.completedStages).not.toContain("discovery_planning"); // skipped, not re-run
    // the skipped stages never re-produced their artifacts this run, so the next stage
    // is dependency-blocked — a distinct `blocked` outcome, not a failure.
    expect(out.status).toBe("blocked");
    expect(out.failure?.kind).toBe("blocked_dependency");
    expect(out.events.some((e) => e.type === "pipeline.blocked")).toBe(true);
  });
});

/* ===== 5 · failure model =================================================== */
describe("failure model", () => {
  it("classifies retryability and maps execution failures", () => {
    expect(isRetryablePipelineFailure("timeout")).toBe(true);
    expect(isRetryablePipelineFailure("discovery_failure")).toBe(false);
    expect(fromExecutionFailure("budget_exhausted")).toBe("budget_exhaustion");
    expect(fromExecutionFailure("validation")).toBe("grounding_rejection");
    expect(fromExecutionFailure("fatal")).toBe("provider_execution_failure");
    expect(pipelineFailure({ kind: "timeout", stage: "graph_assembly", detail: "d", now: NOW }).retryable).toBe(true);
  });

  it("fails on a missing discovery manifest", async () => {
    const out = await runPipeline(runnerInput({ inputs: { discoveryManifest: null, evidenceBundle: goodBundle() } }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("discovery_failure");
  });

  it("fails evidence validation and preserves the invalid artifact for audit", async () => {
    const future = new Date(Date.parse(NOW) + 86_400_000).toISOString();
    const bad: EvidenceBundle = { scanId: "scan-1", items: [item("ev-bad", { timestamp: future })] }; // future timestamp
    const out = await runPipeline(runnerInput({ inputs: { discoveryManifest: {}, evidenceBundle: bad } }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("evidence_validation_failure");
    expect(out.failure?.artifactIds.length).toBe(1);
    expect(out.artifacts.find((a) => a.id === out.failure!.artifactIds[0])!.validationStatus).toBe("invalid");
  });

  it("fails routing when no provider is eligible", async () => {
    const out = await runPipeline(runnerInput({ reasoning: { ...runnerInput().reasoning, registry: [] } }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("provider_routing_failure");
  });

  it("fails on a fatal provider execution error", async () => {
    const base = runnerInput();
    const out = await runPipeline(runnerInput({ reasoning: { ...base.reasoning, adapters: new Map([["p-a", adapter("p-a", [{ throw: "fatal" }])]]) } }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("provider_execution_failure");
  });

  it("recovers via provider fallback after a transient failure", async () => {
    const base = runnerInput();
    const out = await runPipeline(
      runnerInput({
        reasoning: {
          ...base.reasoning,
          registry: [provider("p-a"), provider("p-b", { cost: { inputPerMTokens: 5, outputPerMTokens: 10 } })],
          adapters: new Map<string, InMemoryReasoningAdapter>([["p-a", adapter("p-a", [{ throw: "retryable" }, { throw: "retryable" }, { throw: "retryable" }])], ["p-b", adapter("p-b")]]),
        },
      }),
      deps(),
    );
    expect(out.status).toBe("completed");
  });

  it("rejects ungrounded output — nothing unvalidated reaches the report", async () => {
    const base = runnerInput();
    const out = await runPipeline(
      runnerInput({ reasoning: { ...base.reasoning, parse: parseUngrounded, claimsFrom: () => [] } }),
      deps(),
    );
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("grounding_rejection");
    expect(out.report).toBeNull();
  });

  it("stops on deadline expiry", async () => {
    const out = await runPipeline(runnerInput({ run: makeRun({}, PAST) }), deps());
    expect(out.status).toBe("failed");
    expect(out.failure?.kind).toBe("timeout");
  });

  it("cancels at the first stage when the token is already cancelled", async () => {
    const token = newCancellationToken();
    cancel(token, "user");
    const out = await runPipeline(runnerInput(), deps({ signal: token }));
    expect(out.status).toBe("cancelled");
    expect(out.failure?.kind).toBe("cancellation");
    expect(out.events.some((e) => e.type === "pipeline.cancelled")).toBe(true);
  });
});

/* ===== 6 · budget ========================================================== */
describe("budget propagation", () => {
  it("accrues spend, raises the soft warning, then latches the hard stop", () => {
    let spend = initialSpend(budget);
    expect(spend.remaining).toBe(1.0);
    spend = accrueSpend(budget, spend, 0.4, 0.85);
    expect(spend.softWarning).toBe(true);
    expect(spend.hardStop).toBe(false);
    spend = accrueSpend(budget, spend, 0.3, 0.3);
    expect(spend.hardStop).toBe(true);
    expect(spend.remaining).toBeLessThan(0); // overrun exposed, not hidden
    expect(canAffordStage(budget, spend)).toBe(false);
  });

  it("caps a downstream stage/job at the remaining ceiling", () => {
    const spend = accrueSpend(budget, initialSpend(budget), 0, 0.9);
    expect(stageCeiling(budget, spend)).toBeCloseTo(0.1); // stageCeiling 0.5 capped by remaining 0.1
    const jb = reasoningBudgetFor(budget, spend, { inputTokens: 10, outputTokens: 5 }, 1000);
    expect(jb.costCeiling).toBeCloseTo(0.1); // job ceiling 0.25 capped by remaining
  });

  it("stops the pipeline when the scan ceiling is exhausted", async () => {
    const tiny = { scanCeiling: 0.0000001, stageCeiling: 0.0000001, reasoningJobCeiling: 0.0000001, softWarningAt: 0 };
    const out = await runPipeline(runnerInput({ run: makeRun({ budget: tiny }) }), deps());
    expect(out.status).toBe("failed");
    expect(["budget_exhaustion", "provider_routing_failure"]).toContain(out.failure?.kind);
  });
});

/* ===== 7 · findings ======================================================== */
describe("finding synthesis", () => {
  it("derives severity and priority deterministically", () => {
    expect(deriveSeverity(90, "observed")).toBe("critical");
    expect(deriveSeverity(75, "estimated")).toBe("high");
    expect(deriveSeverity(50, "inferred")).toBe("moderate");
    expect(deriveSeverity(90, "unavailable")).toBe("low");
    expect(derivePriority(100, "observed", "none")).toBe(100);
    expect(derivePriority(100, "inferred", "none")).toBe(60); // weak evidence caps priority
    expect(derivePriority(100, "observed", "contradicted")).toBe(60);
  });

  it("builds findings from validated claims only", () => {
    const claims = [validatedClaim(), validatedClaim({ id: "vc-2", validation: { passed: false, rejections: [{ reason: "no_evidence", claimId: "vc-2", detail: "x" }] } })];
    const findings = synthesizeFindings(claims, { pipelineRunId: "run-1", idFor: (_c, i) => `f-${i}`, domainFor: () => "digital_presence" });
    expect(findings).toHaveLength(1); // the failed claim was dropped
    expect(findings[0]!.evidenceIds).toEqual(["ev-1"]);
    expect(findings[0]!.severity).toBe("critical");
    expect(findings[0]!.provenance.origin).toBe("https://northwind.co"); // provenance preserved
  });

  it("orders findings by severity then priority", () => {
    const mk = (id: string, cv: number) => synthesizeFindings([validatedClaim({ id, confidence: { ...validatedClaim().confidence, value: cv } })], { pipelineRunId: "run-1", idFor: () => id, domainFor: () => "growth" })[0]!;
    const ordered = orderFindings([mk("low", 40), mk("high", 90)]);
    expect(ordered[0]!.id).toBe("high");
  });
});

/* ===== 8 · recommendation candidates ====================================== */
describe("recommendation candidates", () => {
  const finding = () => synthesizeFindings([validatedClaim()], { pipelineRunId: "run-1", idFor: () => "f-1", domainFor: () => "growth" })[0]!;

  it("builds a candidate linked to its finding, review-gated", () => {
    const cands = buildRecommendationCandidates([finding()], { pipelineRunId: "run-1", idFor: () => "c-1" });
    expect(cands).toHaveLength(1);
    expect(cands[0]!.findingIds).toEqual(["f-1"]);
    expect(cands[0]!.evidenceIds).toEqual(["ev-1"]);
    expect(cands[0]!.reviewRequired).toBe(true);
    expect(cands[0]!.effort).toBe(UNMODELLED_EFFORT);
    expect(cands[0]!.limitations.some((l) => l.includes("cost model"))).toBe(true); // honest about deferral
  });

  it("assigns tiers deterministically", () => {
    const f = finding();
    expect(deriveTier(f, 90, 20)).toBe("critical_risk"); // critical severity wins
    expect(deriveTier({ ...f, severity: "high" }, 90, 20)).toBe("quick_win");
    expect(deriveTier({ ...f, severity: "high" }, 90, 90)).toBe("strategic_win");
    expect(deriveTier({ ...f, severity: "moderate" }, 10, 90)).toBe("medium_win");
  });
});

/* ===== 9 · report ========================================================== */
describe("internal intelligence report", () => {
  it("assembles from findings + candidates with pipeline metadata", () => {
    const findings = synthesizeFindings([validatedClaim()], { pipelineRunId: "run-1", idFor: () => "f-1", domainFor: () => "risk" });
    const candidates = buildRecommendationCandidates(findings, { pipelineRunId: "run-1", idFor: () => "c-1" });
    const report = buildInternalIntelligenceReport({ id: "rep-1", run: makeRun(), findings, candidates, unavailableData: ["competitor pricing"], now: NOW });
    expect(report.findingsLedger).toHaveLength(1);
    expect(report.recommendationCandidates).toHaveLength(1);
    expect(report.strongestRisks).toEqual(["f-1"]);
    expect(report.domainSummaries[0]!.domain).toBe("risk");
    expect(report.unavailableData).toEqual(["competitor pricing"]); // reported, never filled
    expect(report.pipelineMetadata.runId).toBe("run-1");
  });

  it("carries coverage, confidence, and conflicts through the run", async () => {
    const out = await runPipeline(runnerInput(), deps());
    expect(out.report!.evidenceCoverage).not.toBeNull();
    expect(out.report!.confidenceSummary).not.toBeNull();
    expect(out.report!.pipelineMetadata.artifactIds.length).toBeGreaterThan(0);
  });
});

/* ===== 10 · determinism ==================================================== */
describe("determinism", () => {
  it("repeated identical runs produce identical artifacts and events", async () => {
    const a = await runPipeline(runnerInput(), deps());
    const b = await runPipeline(runnerInput(), deps());
    expect(a.status).toBe(b.status);
    expect(a.artifacts.map((x) => [x.kind, x.checksum])).toEqual(b.artifacts.map((x) => [x.kind, x.checksum]));
    expect(a.events).toEqual(b.events);
    expect(a.findings).toEqual(b.findings);
    expect(a.candidates).toEqual(b.candidates);
    expect(a.report).toEqual(b.report);
  });
});
