/* =============================================================================
 * Sprint 7 · AI Provider Execution Layer — deterministic tests.
 *
 * Request construction, capability validation, structured execution, schema +
 * grounding validation, retry/fallback, timeout, cancellation, deadline, budget
 * warning/stop, usage reconciliation, attempt history, provenance, and the
 * deterministic test adapter. Pure — no vendor SDK, no I/O, `now` supplied.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  reasoningInputSchema,
  type ReasoningInput,
  type ReasoningJob,
  type SelectionResult,
} from "@brightloop/schema";
import { newReasoningJob } from "../reasoning/job.js";
import { buildRoutingRequest } from "../reasoning/routing-integration.js";
import type { GroundingContext, GroundingClaim } from "../reasoning/grounding.js";
import { buildExecutionRequest } from "./request.js";
import { validateExecutionOutput, type ParsedProviderOutput } from "./validate.js";
import { buildUsage, buildCostAccounting, costOf, projectedExceedsCeiling } from "./accounting.js";
import { newCancellationToken, cancel, adapterMeetsCapabilities } from "./contract.js";
import { InMemoryReasoningAdapter, type ScriptedResponse } from "./test-adapter.js";
import { executeReasoningJob, type ExecutionContext } from "./orchestrator.js";

const NOW = "2026-07-20T00:00:00.000Z";
const PAST = "2026-07-19T00:00:00.000Z";

const baseBudget = { costCeiling: 1.0, inputTokens: 1000, outputTokens: 500, latencyCeilingMs: 30_000 };

function makeJob(over: Partial<Parameters<typeof newReasoningJob>[0]> = {}): ReasoningJob {
  return newReasoningJob(
    { id: "job-1", scanId: "scan-1", clientId: null, taskType: "reasoning", stage: "research", inputRefs: { evidenceIds: ["ev-1"] }, budget: baseBudget, ...over },
    NOW,
  );
}

function makePolicy(over: Partial<ReasoningInput> = {}): ReasoningInput {
  return reasoningInputSchema.parse({
    jobId: "job-1",
    taskObjective: "Assess analytics coverage",
    outputSchemaId: "research_finding",
    costBudget: 1.0,
    tokenBudget: { inputTokens: 1000, outputTokens: 500 },
    policyRules: ["cite evidence", "state limitations"],
    prohibitedClaims: ["guaranteed roi"],
    ...over,
  });
}

/** A selection naming a primary provider + an ordered fallback chain. */
function selection(selected: string | null, fallback: string[] = []): SelectionResult {
  return {
    selected,
    estimatedCost: selected ? 0.002 : null,
    estimatedLatencyMs: selected ? 1000 : null,
    fallbackOrder: fallback,
    rejected: [],
    rationale: { taskType: "reasoning", consideredCount: 1 + fallback.length, eligibleCount: (selected ? 1 : 0) + fallback.length, orderedBy: ["preferred"], softBudgetWarning: false, projectedJobSpend: 0.002 },
  };
}

const cheapPricing = { inputPerMTokens: 1, outputPerMTokens: 2 };

/* ---- grounding context + parsers ------------------------------------------ */
const groundingContext: GroundingContext = {
  evidenceById: new Map([["ev-1", { state: "observed", freshnessBand: "fresh", confidenceValue: 90 }]]),
  knownCompetitorIds: new Set(["comp-known"]),
  prohibitedClaims: ["guaranteed roi"],
};

// a well-grounded claim + citation, as a parser would extract them
const goodParsed: ParsedProviderOutput = {
  claims: [{ id: "c1", statement: "No analytics tag present.", evidenceIds: ["ev-1"], evidenceState: "observed", confidenceValue: 90, freshnessBand: "fresh", limitations: [] }],
  citations: [{ evidenceId: "ev-1", state: "observed", freshnessBand: "fresh", sourceUrl: null }],
};
const goodOutput = { statement: "No analytics tag present." };
const parseGood = (_raw: unknown): ParsedProviderOutput => goodParsed;
const parseMalformed = (_raw: unknown): ParsedProviderOutput => {
  throw new Error("schema mismatch");
};
const ungroundedParsed: ParsedProviderOutput = {
  claims: [{ id: "c2", statement: "Competitor X leads.", evidenceIds: [], evidenceState: "inferred", confidenceValue: 99, freshnessBand: "fresh", limitations: [], referencedCompetitorIds: ["comp-fake"] } as GroundingClaim],
  citations: [],
};
const parseUngrounded = (_raw: unknown): ParsedProviderOutput => ungroundedParsed;

function ctx(over: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    now: NOW,
    traceId: "trace-1",
    policy: makePolicy(),
    groundingContext,
    parse: parseGood,
    pricingFor: () => cheapPricing,
    ...over,
  };
}

function adapters(...list: InMemoryReasoningAdapter[]): Map<string, InMemoryReasoningAdapter> {
  return new Map(list.map((a) => [a.providerId, a]));
}
function adapter(id: string, script: ScriptedResponse[], over: Partial<ConstructorParameters<typeof InMemoryReasoningAdapter>[0]> = {}): InMemoryReasoningAdapter {
  return new InMemoryReasoningAdapter({ providerId: id, script, ...over });
}
const ok: ScriptedResponse = { output: goodOutput, usage: { inputTokens: 1000, outputTokens: 400 }, latencyMs: 20 };

/* ---- 3 · request construction --------------------------------------------- */
describe("execution request", () => {
  it("builds from a routed job + policy, no chain-of-thought field", () => {
    const req = buildExecutionRequest({ job: makeJob({ inputRefs: { evidenceIds: ["ev-1"], graphSnapshotChecksum: "gsc-1" } }), policy: makePolicy(), providerId: "p-a", traceId: "trace-1" });
    expect(req.providerId).toBe("p-a");
    expect(req.tokenBudget).toEqual({ inputTokens: 1000, outputTokens: 500 });
    expect(req.graphSnapshotRef).toBe("gsc-1");
    expect(req.systemPolicy).toContain("cite evidence");
    const forbidden = ["chainOfThought", "reasoning", "thoughts", "scratchpad", "hidden", "cot"];
    for (const k of forbidden) expect(Object.prototype.hasOwnProperty.call(req, k)).toBe(false);
  });
});

/* ---- 2 · capability validation -------------------------------------------- */
describe("capability validation", () => {
  it("checks an adapter declares required capabilities", () => {
    const a = adapter("p-a", [ok], { capabilities: ["structured_output"] });
    expect(adapterMeetsCapabilities(a, ["structured_output"])).toBe(true);
    expect(adapterMeetsCapabilities(a, ["multimodal"])).toBe(false);
  });

  it("fails over when the selected provider lacks a required capability", async () => {
    const weak = adapter("p-weak", [ok], { capabilities: [] });
    const strong = adapter("p-strong", [ok], { capabilities: ["long_context"] });
    const job = makeJob({ providerRequirements: { capabilities: ["long_context"] } });
    const out = await executeReasoningJob(job, selection("p-weak", ["p-strong"]), adapters(weak, strong), ctx());
    expect(out.finalStatus).toBe("succeeded");
    expect(out.response?.providerId).toBe("p-strong");
    expect(out.events.some((e) => e.type === "provider.fallback_started")).toBe(true);
  });
});

/* ---- successful structured execution -------------------------------------- */
describe("successful execution", () => {
  it("executes, validates, accounts, and provenances", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [ok])), ctx());
    expect(out.finalStatus).toBe("succeeded");
    expect(out.response?.status).toBe("succeeded");
    expect(out.response?.output).toEqual(goodOutput);
    expect(out.response?.validation.passed).toBe(true);
    expect(out.response?.citations).toHaveLength(1);
    expect(out.response?.rawResponseRef).toBe("raw-ref");
    expect(out.provenance?.providerId).toBe("p-a");
    expect(out.provenance?.validationStatus).toBe("passed");
    expect(out.events[0]?.type).toBe("provider.execution_started");
    expect(out.events.at(-1)?.type).toBe("provider.execution_succeeded");
  });

  it("does not embed raw content — only a reference", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [{ ...ok, rawResponseRef: "blob://123" }])), ctx());
    expect(out.response?.rawResponseRef).toBe("blob://123");
  });
});

/* ---- 5 · schema + grounding validation ------------------------------------ */
describe("output validation", () => {
  it("passes a grounded output", () => {
    const r = validateExecutionOutput(goodOutput, { groundingContext, parse: parseGood });
    expect(r.status).toBe("succeeded");
    expect(r.validation.passed).toBe(true);
  });

  it("rejects malformed output (schema parse failure)", () => {
    const r = validateExecutionOutput({}, { groundingContext, parse: parseMalformed });
    expect(r.status).toBe("rejected");
    expect(r.validation.rejections[0]?.reason).toBe("malformed_output");
  });

  it("rejects fabricated + ungrounded claims", () => {
    const r = validateExecutionOutput({}, { groundingContext, parse: parseUngrounded });
    expect(r.status).toBe("rejected");
    const reasons = r.groundingRejections.map((x) => x.reason);
    expect(reasons).toContain("no_evidence");
    expect(reasons).toContain("fabricated_competitor");
    expect(reasons).toContain("certainty_exceeds_evidence");
  });

  it("never promotes invalid output to a completed result", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [ok])), ctx({ parse: parseUngrounded, retryPolicy: { maxAttempts: 1, allowProviderFallback: false } }));
    expect(out.finalStatus).toBe("rejected");
    expect(out.response?.output).toBeNull();
    expect(out.events.some((e) => e.type === "provider.output_rejected")).toBe(true);
  });
});

/* ---- 6 · retry / fallback ------------------------------------------------- */
describe("retry and fallback", () => {
  it("retries the same provider on a transient failure then succeeds", async () => {
    const a = adapter("p-a", [{ throw: "retryable" }, ok]);
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(a), ctx());
    expect(out.finalStatus).toBe("succeeded");
    expect(out.attempts).toHaveLength(2);
    expect(out.attempts[0]?.status).toBe("failed");
    expect(out.attempts[1]?.status).toBe("succeeded");
  });

  it("stops immediately on a fatal failure", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(adapter("p-a", [{ throw: "fatal" }]), adapter("p-b", [ok])), ctx());
    expect(out.finalStatus).toBe("failed");
    expect(out.attempts).toHaveLength(1);
    expect(out.response).toBeNull();
  });

  it("falls back to the next provider on a transient failure", async () => {
    const a = adapter("p-a", [{ throw: "retryable" }, { throw: "retryable" }, { throw: "retryable" }]);
    const b = adapter("p-b", [ok]);
    const out = await executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(a, b), ctx());
    expect(out.finalStatus).toBe("succeeded");
    expect(out.response?.providerId).toBe("p-b");
    expect(out.events.some((e) => e.type === "provider.fallback_started")).toBe(true);
  });

  it("stops when the fallback chain is exhausted (no infinite retry)", async () => {
    const a = adapter("p-a", [{ throw: "retryable" }]);
    const b = adapter("p-b", [{ throw: "retryable" }]);
    const out = await executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(a, b), ctx({ retryPolicy: { maxAttempts: 5, allowProviderFallback: true } }));
    expect(out.finalStatus).toBe("failed");
    expect(out.attempts.length).toBeLessThanOrEqual(5);
  });
});

/* ---- 8 · timeout / cancellation / deadline -------------------------------- */
describe("timeout, cancellation, deadline", () => {
  it("flags a timeout when latency exceeds the ceiling", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [{ output: goodOutput, latencyMs: 999_999 }])), ctx({ timeoutMs: 100, retryPolicy: { maxAttempts: 1, allowProviderFallback: false } }));
    expect(out.finalStatus).toBe("timed_out");
    expect(out.events.some((e) => e.type === "provider.execution_timed_out")).toBe(true);
  });

  it("honours a pre-cancelled token", async () => {
    const token = newCancellationToken();
    cancel(token, "user");
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [ok])), ctx({ signal: token }));
    expect(out.finalStatus).toBe("cancelled");
    expect(out.events.some((e) => e.type === "provider.execution_cancelled")).toBe(true);
  });

  it("stops on a provider-signalled cancellation", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(adapter("p-a", [{ throw: "cancelled" }]), adapter("p-b", [ok])), ctx());
    expect(out.finalStatus).toBe("cancelled");
    expect(out.response).toBeNull();
  });

  it("stops when the deadline has passed", async () => {
    const out = await executeReasoningJob(makeJob({ deadline: PAST }), selection("p-a"), adapters(adapter("p-a", [ok])), ctx());
    expect(out.finalStatus).toBe("deadline_exceeded");
  });
});

/* ---- 7 · budget ----------------------------------------------------------- */
describe("budget accounting", () => {
  it("raises a soft warning then still succeeds", async () => {
    // small pre-flight estimate clears the ceiling; actual usage lands in the warning band (≥80%, ≤100%).
    const job = makeJob({ budget: { ...baseBudget, costCeiling: 0.0016 } });
    const a = adapter("p-a", [{ output: goodOutput, usage: { inputTokens: 1400, outputTokens: 100 }, latencyMs: 10 }], { tokenEstimate: { inputTokens: 100, outputTokens: 50 } });
    const out = await executeReasoningJob(job, selection("p-a"), adapters(a), ctx({ pricingFor: () => ({ inputPerMTokens: 1, outputPerMTokens: 1 }) }));
    expect(out.finalStatus).toBe("succeeded");
    expect(out.response?.cost.softWarning).toBe(true);
    expect(out.events.some((e) => e.type === "provider.budget_warning")).toBe(true);
  });

  it("stops before executing when projected spend exceeds the hard ceiling", async () => {
    const job = makeJob({ budget: { ...baseBudget, costCeiling: 0.0000001 } });
    const out = await executeReasoningJob(job, selection("p-a"), adapters(adapter("p-a", [ok])), ctx());
    expect(out.finalStatus).toBe("budget_exhausted");
    expect(out.events.some((e) => e.type === "provider.budget_exhausted")).toBe(true);
    expect(out.attempts).toHaveLength(0); // never executed
  });

  it("computes cost and projection deterministically", () => {
    expect(costOf(1_000_000, 0, cheapPricing)).toBe(1);
    expect(projectedExceedsCeiling(0.9, 0.2, 1.0)).toBe(true);
    expect(projectedExceedsCeiling(0.5, 0.2, 1.0)).toBe(false);
  });
});

/* ---- usage reconciliation ------------------------------------------------- */
describe("usage", () => {
  const estimate = { inputTokens: 1000, outputTokens: 500 };
  it("records actual usage when the provider reports it", () => {
    const u = buildUsage(estimate, { inputTokens: 900, outputTokens: 400 });
    expect(u.estimated).toBe(false);
    expect(u.actualInputTokens).toBe(900);
    const acct = buildCostAccounting({ usage: u, pricing: cheapPricing, priorJobSpend: 0, costCeiling: 1, softWarningAt: 0.8 });
    expect(acct.actualCost).not.toBeNull();
    expect(acct.stageSpend).toBeCloseTo(costOf(900, 400, cheapPricing));
  });

  it("falls back to estimated usage when the provider omits it", () => {
    const u = buildUsage(estimate, undefined);
    expect(u.estimated).toBe(true);
    expect(u.actualInputTokens).toBeNull();
    const acct = buildCostAccounting({ usage: u, pricing: cheapPricing, priorJobSpend: 0, costCeiling: 1, softWarningAt: 0.8 });
    expect(acct.actualCost).toBeNull();
    expect(acct.stageSpend).toBeCloseTo(acct.estimatedCost);
  });

  it("surfaces estimated usage through the response when usage is missing", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [{ output: goodOutput, latencyMs: 10 }])), ctx());
    expect(out.response?.usage.estimated).toBe(true);
    expect(out.response?.cost.actualCost).toBeNull();
  });
});

/* ---- attempt history + provenance ----------------------------------------- */
describe("attempt history + provenance", () => {
  it("preserves an attempt record per try", async () => {
    const a = adapter("p-a", [{ throw: "retryable" }, { throw: "retryable" }]);
    const b = adapter("p-b", [ok]);
    const out = await executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(a, b), ctx());
    expect(out.attempts.length).toBeGreaterThanOrEqual(2);
    expect(out.attempts.every((x) => typeof x.providerId === "string")).toBe(true);
    expect(out.provenance?.jobId).toBe("job-1");
    expect(out.provenance?.schemaVersion).toBeTruthy();
  });

  it("records a failed validationStatus in provenance on rejection", async () => {
    const out = await executeReasoningJob(makeJob(), selection("p-a"), adapters(adapter("p-a", [ok])), ctx({ parse: parseUngrounded, retryPolicy: { maxAttempts: 1, allowProviderFallback: false } }));
    expect(out.provenance?.validationStatus).toBe("failed");
  });
});

/* ---- test adapter + determinism ------------------------------------------- */
describe("test adapter + determinism", () => {
  it("consumes its script in order, repeating the last step", async () => {
    const req = buildExecutionRequest({ job: makeJob(), policy: makePolicy(), providerId: "p-a", traceId: "t" });
    const control = { signal: newCancellationToken(), timeoutMs: 30_000, deadline: null, now: NOW };
    const a = adapter("p-a", [{ output: { n: 1 } }, { output: { n: 2 } }]);
    expect((await a.execute(req, control)).output).toEqual({ n: 1 });
    expect((await a.execute(req, control)).output).toEqual({ n: 2 });
    expect((await a.execute(req, control)).output).toEqual({ n: 2 }); // last repeats
  });

  it("produces identical outcomes for identical inputs", async () => {
    const run = () => executeReasoningJob(makeJob(), selection("p-a", ["p-b"]), adapters(adapter("p-a", [{ throw: "retryable" }, ok]), adapter("p-b", [ok])), ctx());
    const a = await run();
    const b = await run();
    expect(a.finalStatus).toBe(b.finalStatus);
    expect(a.attempts).toEqual(b.attempts);
    expect(a.events).toEqual(b.events);
  });

  it("keeps routing integration intact (request budget maps through)", () => {
    const rr = buildRoutingRequest(makeJob());
    expect(rr.tokens).toEqual({ inputTokens: 1000, outputTokens: 500 });
  });
});
