/* =============================================================================
 * Sprint 6 · AI Reasoning Orchestrator — deterministic contract tests.
 *
 * Job validation + state machine, stage preconditions/completion, structured
 * input/output validation, grounding guards, provider-routing integration,
 * retry/fallback, multi-pass consensus, provenance, and determinism. Pure — no
 * model runs, no I/O, no clock (timestamps supplied).
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  reasoningInputSchema,
  researchFindingSchema,
  providerDescriptorSchema,
  REASONING_SCHEMA_VERSION,
  type ProviderDescriptor,
  type ReasoningJob,
} from "@brightloop/schema";
import { newReasoningJob, validateJob, applyJobEvent, canJobTransition, nextJobStatus, isJobTerminal } from "./job.js";
import { preconditionsMet, completionMet, outputAllowed, stageSpec, REASONING_STAGE_SPECS } from "./stages.js";
import { validateGrounding, isGrounded, type GroundingClaim, type GroundingContext } from "./grounding.js";
import { routeReasoningJob, buildRoutingRequest, providerChain } from "./routing-integration.js";
import { decideRetry, isRetryableFailure, nextFallbackProvider, isBudgetExhausted, isResumable, remainingOutputs, DEFAULT_RETRY_POLICY } from "./retry.js";
import { computeConsensus, nextPass, canAdvancePass, isPassComplete, REASONING_PASS_ORDER, isContested } from "./multipass.js";
import { buildResultProvenance } from "./provenance.js";
import { reasoningEvent, JOB_EVENT_FOR } from "./events.js";

const NOW = "2026-07-20T00:00:00.000Z";
const LATER = "2026-07-20T00:05:00.000Z";

const baseBudget = { costCeiling: 1.0, inputTokens: 1000, outputTokens: 500, latencyCeilingMs: 30_000 };

function makeJob(over: Partial<Parameters<typeof newReasoningJob>[0]> = {}): ReasoningJob {
  return newReasoningJob(
    {
      id: "job-1",
      scanId: "scan-1",
      clientId: null,
      taskType: "reasoning",
      stage: "research",
      inputRefs: { evidenceIds: ["ev-1"] },
      budget: baseBudget,
      ...over,
    },
    NOW,
  );
}

function provider(id: string, over: Partial<ProviderDescriptor> = {}): ProviderDescriptor {
  return providerDescriptorSchema.parse({
    id,
    taskTypes: ["reasoning"],
    capabilities: [],
    maxContextTokens: 100_000,
    maxOutputTokens: 8_000,
    structuredOutput: true,
    cost: { inputPerMTokens: 1, outputPerMTokens: 2 },
    latency: { typicalMs: 1_000, p95Ms: 2_000 },
    ...over,
  });
}

/* ---- 1 · job model + validation ------------------------------------------- */
describe("reasoning job", () => {
  it("creates a pending job with defaults", () => {
    const job = makeJob();
    expect(job.status).toBe("pending");
    expect(job.attempt).toBe(0);
    expect(job.createdAt).toBe(NOW);
    expect(job.startedAt).toBeNull();
    expect(job.cancelled).toBe(false);
  });

  it("flags a job with no inputs or no budget", () => {
    const bad = makeJob({ inputRefs: { evidenceIds: [] }, budget: { ...baseBudget, costCeiling: 0, inputTokens: 0, outputTokens: 0 } });
    const problems = validateJob(bad);
    expect(problems).toContain("job has no input references");
    expect(problems).toContain("job has no cost budget");
    expect(problems).toContain("job has no token budget");
  });

  it("passes a well-formed job", () => {
    expect(validateJob(makeJob())).toEqual([]);
  });
});

/* ---- state machine: legal + illegal transitions --------------------------- */
describe("job state machine", () => {
  it("walks the happy path pending → completed", () => {
    let job = makeJob();
    for (const [event, status] of [
      ["plan", "planned"],
      ["route", "routed"],
      ["start", "running"],
      ["validate", "validating"],
      ["complete", "completed"],
    ] as const) {
      job = applyJobEvent(job, event, NOW);
      expect(job.status).toBe(status);
    }
    expect(isJobTerminal(job.status)).toBe(true);
    expect(job.completedAt).toBe(NOW);
  });

  it("rejects illegal transitions (job unchanged)", () => {
    const job = makeJob(); // pending
    expect(canJobTransition("pending", "complete")).toBe(false);
    expect(nextJobStatus("pending", "validate")).toBeNull();
    expect(applyJobEvent(job, "complete", NOW)).toBe(job); // same reference — unchanged
  });

  it("stamps startedAt on first run and bumps attempt on retry", () => {
    let job = makeJob();
    job = applyJobEvent(job, "plan", NOW);
    job = applyJobEvent(job, "route", NOW);
    job = applyJobEvent(job, "start", LATER);
    expect(job.startedAt).toBe(LATER);
    job = applyJobEvent(job, "validate", LATER);
    job = applyJobEvent(job, "retry", LATER); // validating → running
    expect(job.status).toBe("running");
    expect(job.attempt).toBe(1);
  });

  it("blocks, unblocks, and cancels", () => {
    let job = applyJobEvent(makeJob(), "block", NOW);
    expect(job.status).toBe("blocked");
    job = applyJobEvent(job, "unblock", NOW);
    expect(job.status).toBe("pending");
    job = applyJobEvent(job, "cancel", NOW);
    expect(job.status).toBe("cancelled");
    expect(job.cancelled).toBe(true);
    expect(isJobTerminal("cancelled")).toBe(true);
  });

  it("re-routes on retry after failure", () => {
    let job = makeJob();
    job = applyJobEvent(job, "plan", NOW);
    job = applyJobEvent(job, "route", NOW);
    job = applyJobEvent(job, "start", NOW);
    job = applyJobEvent(job, "fail", NOW);
    expect(job.status).toBe("failed");
    job = applyJobEvent(job, "retry", NOW);
    expect(job.status).toBe("routed"); // fallback re-route
  });
});

/* ---- 2 · stage preconditions + completion --------------------------------- */
describe("reasoning stages", () => {
  it("has all six canonical stages in a precondition chain", () => {
    expect(Object.keys(REASONING_STAGE_SPECS)).toHaveLength(6);
    expect(stageSpec("planner").preconditionStages).toEqual([]);
    expect(stageSpec("research").preconditionStages).toEqual(["planner"]);
    expect(stageSpec("proposal_writing").preconditionStages).toEqual(["executive_summary"]);
  });

  it("gates preconditions", () => {
    expect(preconditionsMet("planner", [])).toBe(true);
    expect(preconditionsMet("research", [])).toBe(false);
    expect(preconditionsMet("research", ["planner"])).toBe(true);
  });

  it("gates completion on an allowed output kind", () => {
    expect(completionMet("research", ["research_finding"])).toBe(true);
    expect(completionMet("research", ["recommendation_candidate"])).toBe(false);
    expect(outputAllowed("recommendation", "recommendation_candidate")).toBe(true);
    expect(outputAllowed("planner", "proposal_section")).toBe(false);
  });
});

/* ---- 3/4 · structured input + output validation --------------------------- */
describe("structured contracts", () => {
  it("validates a reasoning input", () => {
    const input = reasoningInputSchema.parse({
      jobId: "job-1",
      taskObjective: "Assess site coverage",
      outputSchemaId: "research_finding",
      costBudget: 1.0,
      tokenBudget: { inputTokens: 1000, outputTokens: 500 },
    });
    expect(input.constraints).toEqual([]);
    expect(input.prohibitedClaims).toEqual([]);
  });

  it("validates a research finding carrying its full attribution", () => {
    const finding = researchFindingSchema.parse({
      id: "rf-1",
      jobId: "job-1",
      statement: "The site has no analytics tag.",
      evidenceIds: ["ev-1"],
      evidenceState: "observed",
      confidence: { value: 90, band: "very_high", inputs: { coverage: 0.9, reliability: 0.9, freshness: 0.9, agreement: 0.9, completeness: 0.9, provenanceQuality: 0.9 } },
      provenance: { origin: "https://example.com", collectedAt: NOW, method: "crawl", stage: "evidence_collection" },
      freshness: { ageDays: 1, band: "fresh", score: 0.98 },
      limitations: [],
    });
    expect(finding.contradictionStatus).toBe("none");
  });
});

/* ---- 5 · grounding / hallucination guards --------------------------------- */
describe("grounding guards", () => {
  const ctx: GroundingContext = {
    evidenceById: new Map([
      ["ev-1", { state: "observed", freshnessBand: "fresh", confidenceValue: 90 }],
      ["ev-stale", { state: "observed", freshnessBand: "expired", confidenceValue: 80 }],
      ["ev-unavail", { state: "unavailable", freshnessBand: "fresh", confidenceValue: 0 }],
      ["ev-inferred", { state: "inferred", freshnessBand: "fresh", confidenceValue: 40 }],
    ]),
    knownCompetitorIds: new Set(["comp-known"]),
    prohibitedClaims: ["guaranteed roi"],
  };
  const grounded: GroundingClaim = { id: "c1", statement: "Observed missing tag.", evidenceIds: ["ev-1"], evidenceState: "observed", confidenceValue: 90, freshnessBand: "fresh", limitations: [] };

  it("passes a fully grounded claim", () => {
    expect(validateGrounding(grounded, ctx)).toEqual([]);
    expect(isGrounded(grounded, ctx)).toBe(true);
  });

  it("rejects a claim with no evidence", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: [] }, ctx);
    expect(r.map((x) => x.reason)).toContain("no_evidence");
  });

  it("rejects a malformed / unknown citation", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-1", "missing"] }, ctx);
    expect(r.map((x) => x.reason)).toContain("malformed_citation");
  });

  it("rejects a reference to an unavailable source", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-unavail"], confidenceValue: 0 }, ctx);
    expect(r.map((x) => x.reason)).toContain("references_unavailable_source");
  });

  it("rejects stale evidence beyond policy", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-stale"] }, ctx);
    expect(r.map((x) => x.reason)).toContain("stale_evidence");
  });

  it("rejects certainty above the evidence ceiling", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-inferred"], evidenceState: "inferred", confidenceValue: 95, limitations: ["inferred"] }, ctx);
    expect(r.map((x) => x.reason)).toContain("certainty_exceeds_evidence");
  });

  it("rejects a fabricated metric with no evidence", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: [], assertsMetric: true }, ctx);
    expect(r.map((x) => x.reason)).toContain("fabricated_metric");
  });

  it("rejects an unsupported causal claim", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-inferred"], evidenceState: "inferred", confidenceValue: 40, isCausal: true, limitations: ["weak"] }, ctx);
    expect(r.map((x) => x.reason)).toContain("unsupported_causal_claim");
  });

  it("rejects a fabricated competitor", () => {
    const r = validateGrounding({ ...grounded, referencedCompetitorIds: ["comp-made-up"] }, ctx);
    expect(r.map((x) => x.reason)).toContain("fabricated_competitor");
  });

  it("accepts a known competitor", () => {
    const r = validateGrounding({ ...grounded, referencedCompetitorIds: ["comp-known"] }, ctx);
    expect(r).toEqual([]);
  });

  it("rejects a non-observed claim with no limitations", () => {
    const r = validateGrounding({ ...grounded, evidenceIds: ["ev-inferred"], evidenceState: "inferred", confidenceValue: 40, limitations: [] }, ctx);
    expect(r.map((x) => x.reason)).toContain("missing_limitations");
  });

  it("rejects a prohibited sensitive claim", () => {
    const r = validateGrounding({ ...grounded, statement: "We offer a GUARANTEED ROI." }, ctx);
    expect(r.map((x) => x.reason)).toContain("prohibited_sensitive_claim");
  });
});

/* ---- 6 · provider-routing integration ------------------------------------- */
describe("routing integration", () => {
  it("builds a routing request from a job", () => {
    const req = buildRoutingRequest(makeJob({ providerRequirements: { preferredProviderIds: ["p-fast"] } }));
    expect(req.taskType).toBe("reasoning");
    expect(req.tokens).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(req.maxLatencyMs).toBe(30_000);
    expect(req.budget.hardCeiling).toBe(1.0);
    expect(req.preferredOrder).toEqual(["p-fast"]);
  });

  it("selects the cheapest eligible provider and orders fallbacks", () => {
    const registry = [provider("p-mid", { cost: { inputPerMTokens: 5, outputPerMTokens: 10 } }), provider("p-cheap")];
    const result = routeReasoningJob(makeJob(), { registry, now: NOW });
    expect(result.selected).toBe("p-cheap");
    expect(providerChain(result)).toEqual(["p-cheap", "p-mid"]);
  });

  it("rejects an over-budget provider and an unsupported task", () => {
    const registry = [provider("p-expensive", { cost: { inputPerMTokens: 5_000_000, outputPerMTokens: 5_000_000 } }), provider("p-writer", { taskTypes: ["writing"] })];
    const result = routeReasoningJob(makeJob(), { registry, now: NOW });
    expect(result.selected).toBeNull();
    const reasons = Object.fromEntries(result.rejected.map((r) => [r.providerId, r.reason]));
    expect(reasons["p-expensive"]).toBe("over_cost_budget");
    expect(reasons["p-writer"]).toBe("unsupported_task");
  });

  it("honours preferred order over cost", () => {
    const registry = [provider("p-cheap"), provider("p-pref", { cost: { inputPerMTokens: 3, outputPerMTokens: 6 } })];
    const job = makeJob({ providerRequirements: { preferredProviderIds: ["p-pref"] } });
    const result = routeReasoningJob(job, { registry, now: NOW });
    expect(result.selected).toBe("p-pref");
  });
});

/* ---- 7 · retry / fallback ------------------------------------------------- */
describe("retry + fallback", () => {
  it("classifies failure kinds", () => {
    expect(isRetryableFailure("retryable")).toBe(true);
    expect(isRetryableFailure("validation")).toBe(true);
    expect(isRetryableFailure("timeout")).toBe(true);
    expect(isRetryableFailure("fatal")).toBe(false);
    expect(isRetryableFailure("budget_exhausted")).toBe(false);
    expect(isRetryableFailure("cancelled")).toBe(false);
  });

  const selection = { selected: "p-a", estimatedCost: 0.01, estimatedLatencyMs: 1000, fallbackOrder: ["p-b", "p-c"], rejected: [], rationale: { taskType: "reasoning" as const, consideredCount: 3, eligibleCount: 3, orderedBy: [], softBudgetWarning: false, projectedJobSpend: 0.01 } };

  it("stops on a fatal failure", () => {
    expect(decideRetry("fatal", 0, selection)).toBe("stop");
  });

  it("retries the same route on a validation failure", () => {
    expect(decideRetry("validation", 0, selection)).toBe("retry_same");
  });

  it("falls back to another provider on a retryable failure", () => {
    expect(decideRetry("retryable", 0, selection)).toBe("retry_fallback");
  });

  it("stops once attempts are exhausted", () => {
    expect(decideRetry("retryable", DEFAULT_RETRY_POLICY.maxAttempts - 1, selection)).toBe("stop");
  });

  it("walks the fallback chain, skipping tried providers", () => {
    expect(nextFallbackProvider(selection, [])).toBe("p-b");
    expect(nextFallbackProvider(selection, ["p-b"])).toBe("p-c");
    expect(nextFallbackProvider(selection, ["p-b", "p-c"])).toBeNull();
  });

  it("detects budget exhaustion", () => {
    expect(isBudgetExhausted(1.0, 1.0)).toBe(true);
    expect(isBudgetExhausted(0.9, 1.0)).toBe(false);
  });

  it("handles partial output + checkpoint resume", () => {
    const partial = { jobId: "job-1", stage: "research" as const, producedIds: ["rf-1"], complete: false };
    expect(isResumable(partial)).toBe(true);
    expect(remainingOutputs(partial, ["rf-1", "rf-2", "rf-3"])).toEqual(["rf-2", "rf-3"]);
    expect(isResumable({ ...partial, complete: true })).toBe(false);
  });
});

/* ---- 8 · multi-pass orchestration ----------------------------------------- */
describe("multi-pass", () => {
  it("orders the four passes", () => {
    expect(REASONING_PASS_ORDER).toEqual(["primary", "critic", "validation", "synthesis"]);
    expect(nextPass("primary")).toBe("critic");
    expect(nextPass("synthesis")).toBeNull();
    expect(canAdvancePass("primary", "critic")).toBe(true);
    expect(canAdvancePass("primary", "synthesis")).toBe(false);
    expect(isPassComplete("synthesis")).toBe(true);
  });

  it("computes consensus + disagreement metadata", () => {
    const c = computeConsensus([{ id: "a", agree: true }, { id: "c", agree: true }, { id: "b", agree: false }]);
    expect(c.agreement).toBeCloseTo(2 / 3);
    expect(c.agreeing).toEqual(["a", "c"]); // sorted
    expect(c.disagreeing).toEqual(["b"]);
    expect(c.resolved).toBe(true); // strict majority
    expect(isContested(c)).toBe(true);
  });

  it("reports no consensus for an empty set", () => {
    const c = computeConsensus([]);
    expect(c.agreement).toBe(0);
    expect(c.resolved).toBe(false);
  });
});

/* ---- 9 · result provenance ------------------------------------------------ */
describe("result provenance", () => {
  it("assembles a full provenance record from a job + selection", () => {
    const job = makeJob({ inputRefs: { evidenceIds: ["ev-1", "ev-2"], graphSnapshotChecksum: "abc123" } });
    const registry = [provider("p-cheap")];
    const selection = routeReasoningJob(job, { registry, now: NOW });
    const prov = buildResultProvenance({ job, selection, model: { provider: "opaque", model: "m1", version: "v1" }, startedAt: NOW, completedAt: LATER, validationStatus: "passed" });
    expect(prov.jobId).toBe("job-1");
    expect(prov.providerId).toBe("p-cheap");
    expect(prov.routingDecision).toBe("p-cheap");
    expect(prov.sourceEvidenceIds).toEqual(["ev-1", "ev-2"]);
    expect(prov.graphSnapshotChecksum).toBe("abc123");
    expect(prov.schemaVersion).toBe(REASONING_SCHEMA_VERSION);
    expect(prov.validationStatus).toBe("passed");
  });

  it("records no_provider when routing found nothing", () => {
    const selection = { selected: null, estimatedCost: null, estimatedLatencyMs: null, fallbackOrder: [], rejected: [], rationale: { taskType: "reasoning" as const, consideredCount: 0, eligibleCount: 0, orderedBy: [], softBudgetWarning: false, projectedJobSpend: 0 } };
    const prov = buildResultProvenance({ job: makeJob(), selection, startedAt: NOW, validationStatus: "skipped" });
    expect(prov.routingDecision).toBe("no_provider");
    expect(prov.costEstimate).toBe(0);
  });
});

/* ---- 10 · events ---------------------------------------------------------- */
describe("reasoning events", () => {
  it("builds validated events with a supplied timestamp", () => {
    const ev = reasoningEvent("reasoning.completed", "job-1", NOW, "done");
    expect(ev).toEqual({ type: "reasoning.completed", jobId: "job-1", at: NOW, detail: "done" });
  });

  it("maps job events to canonical event types", () => {
    expect(JOB_EVENT_FOR.complete).toBe("reasoning.completed");
    expect(JOB_EVENT_FOR.fail).toBe("reasoning.failed");
  });
});

/* ---- determinism ---------------------------------------------------------- */
describe("determinism", () => {
  it("routes identically for identical inputs", () => {
    const registry = [provider("p-b"), provider("p-a")];
    const a = routeReasoningJob(makeJob(), { registry, now: NOW });
    const b = routeReasoningJob(makeJob(), { registry, now: NOW });
    expect(a).toEqual(b);
  });

  it("computes consensus identically for identical inputs", () => {
    const verdicts = [{ id: "x", agree: true }, { id: "y", agree: false }];
    expect(computeConsensus(verdicts)).toEqual(computeConsensus(verdicts));
  });
});
