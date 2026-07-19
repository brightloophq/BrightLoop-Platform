import { describe, it, expect } from "vitest";
import {
  providerDescriptorSchema,
  routingRequestSchema,
  providerHealthSchema,
  circuitSchema,
  circuitConfigSchema,
  type ProviderDescriptor,
  type RoutingRequest,
  type Circuit,
} from "@brightloop/schema";
import { route, hasCapability, estimateCost, evaluateBudget, type RoutingContext } from "./index.js";
import { newCircuit, recordFailure as cbFail, recordSuccess as cbOk, attempt, isOpen } from "./circuit.js";
import { newHealth, recordFailure as hFail, recordSuccess as hOk, effectiveStatus } from "./health.js";

const NOW = "2026-07-19T00:00:00.000Z";
const later = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();

const provider = (over: Partial<ProviderDescriptor> = {}): ProviderDescriptor =>
  providerDescriptorSchema.parse({
    id: "p", taskTypes: ["reasoning"], capabilities: ["structured_output"], maxContextTokens: 100_000, maxOutputTokens: 8_000,
    structuredOutput: true, multimodal: false, available: true, regions: [],
    cost: { inputPerMTokens: 5, outputPerMTokens: 15 }, latency: { typicalMs: 1_000, p95Ms: 2_000 }, ...over,
  });
const request = (over: Partial<RoutingRequest> = {}): RoutingRequest =>
  routingRequestSchema.parse({
    taskType: "reasoning", requiredCapabilities: [], minContextTokens: 1_000, tokens: { inputTokens: 10_000, outputTokens: 1_000 },
    maxLatencyMs: 5_000, region: null, budget: { perStage: 1, perJob: 10, hardCeiling: 20, softWarning: 8 }, spentSoFar: 0, preferredOrder: [], ...over,
  });
const ctx = (over: Partial<RoutingContext> = {}): RoutingContext => ({ health: new Map(), circuits: new Map(), now: NOW, ...over });

/* ---- cost model ----------------------------------------------------------- */
describe("cost estimation + budget (pure)", () => {
  it("prices input + output per million tokens; zero → 0", () => {
    expect(estimateCost(provider(), { inputTokens: 1_000_000, outputTokens: 0 })).toBe(5);
    expect(estimateCost(provider(), { inputTokens: 0, outputTokens: 1_000_000 })).toBe(15);
    expect(estimateCost(provider(), { inputTokens: 0, outputTokens: 0 })).toBe(0);
    expect(estimateCost(provider(), { inputTokens: 10_000, outputTokens: 1_000 })).toBeCloseTo(0.065, 6);
  });
  it("soft vs hard budget: soft warns but allows; hard ceiling blocks", () => {
    const soft = evaluateBudget(1, 8, { perStage: 5, perJob: 100, hardCeiling: 100, softWarning: 8 });
    expect(soft.softWarning).toBe(true);
    expect(soft.allowed).toBe(true); // projected 9, over soft(8) but under hard
    const hard = evaluateBudget(5, 18, { perStage: 10, perJob: 100, hardCeiling: 20, softWarning: 8 });
    expect(hard.withinHardCeiling).toBe(false); // projected 23 > 20
    expect(hard.allowed).toBe(false);
    const stage = evaluateBudget(6, 0, { perStage: 5, perJob: 100, hardCeiling: 100, softWarning: 90 });
    expect(stage.withinStage).toBe(false);
    expect(stage.allowed).toBe(false);
  });
});

/* ---- capability matching -------------------------------------------------- */
describe("capability matching", () => {
  it("hasCapability reads the list and the structured/multimodal flags", () => {
    expect(hasCapability(provider({ capabilities: [], structuredOutput: true }), "structured_output")).toBe(true);
    expect(hasCapability(provider({ capabilities: ["multimodal"], multimodal: false }), "multimodal")).toBe(true);
    expect(hasCapability(provider({ capabilities: [], structuredOutput: false, multimodal: false }), "function_calling")).toBe(false);
  });
  it("selects a provider that has the required capability", () => {
    const r = route([provider({ id: "ok", structuredOutput: true })], request({ requiredCapabilities: ["structured_output"] }), ctx());
    expect(r.selected).toBe("ok");
  });
  it("rejects a provider missing a required capability", () => {
    const r = route([provider({ id: "no", capabilities: [], structuredOutput: false, multimodal: false })], request({ requiredCapabilities: ["multimodal"] }), ctx());
    expect(r.selected).toBeNull();
    expect(r.rejected).toContainEqual({ providerId: "no", reason: "missing_capability", detail: null });
  });
});

/* ---- rejection reasons ---------------------------------------------------- */
describe("routing rejections", () => {
  it("unsupported task type", () => {
    const r = route([provider({ id: "p", taskTypes: ["reasoning"] })], request({ taskType: "writing" }), ctx());
    expect(r.rejected[0]).toMatchObject({ providerId: "p", reason: "unsupported_task" });
  });
  it("context too small (input exceeds max context)", () => {
    const r = route([provider({ id: "p", maxContextTokens: 5_000 })], request({ tokens: { inputTokens: 10_000, outputTokens: 100 } }), ctx());
    expect(r.rejected[0]!.reason).toBe("context_too_small");
  });
  it("over latency budget", () => {
    const r = route([provider({ id: "p", latency: { typicalMs: 10_000, p95Ms: 12_000 } })], request({ maxLatencyMs: 5_000 }), ctx());
    expect(r.rejected[0]!.reason).toBe("over_latency_budget");
  });
  it("over cost budget", () => {
    const r = route([provider({ id: "p" })], request({ budget: { perStage: 0.01, perJob: 0.01, hardCeiling: 0.01, softWarning: 0.005 } }), ctx());
    expect(r.rejected[0]!.reason).toBe("over_cost_budget");
  });
  it("statically unavailable provider", () => {
    const r = route([provider({ id: "p", available: false })], request(), ctx());
    expect(r.rejected[0]!.reason).toBe("unavailable");
  });
  it("region excluded", () => {
    const r = route([provider({ id: "p", regions: ["us"] })], request({ region: "eu" }), ctx());
    expect(r.rejected[0]!.reason).toBe("region_excluded");
  });
  it("rate-limited (health window unexpired)", () => {
    const health = new Map([["p", providerHealthSchema.parse({ providerId: "p", status: "rate_limited", rateLimitResetAt: later(60_000) })]]);
    const r = route([provider({ id: "p" })], request(), ctx({ health }));
    expect(r.rejected[0]!.reason).toBe("rate_limited");
  });
  it("open circuit within cooldown", () => {
    const circuits = new Map([["p", circuitSchema.parse({ providerId: "p", state: "open", failures: 5, openedAt: NOW })]]);
    const r = route([provider({ id: "p" })], request(), ctx({ circuits }));
    expect(r.rejected[0]!.reason).toBe("circuit_open");
  });
});

/* ---- ordering / fallback / determinism ------------------------------------ */
describe("selection ordering + fallback chain", () => {
  it("cost-aware: cheaper provider is selected, dearer becomes fallback", () => {
    const cheap = provider({ id: "cheap", cost: { inputPerMTokens: 1, outputPerMTokens: 1 } });
    const dear = provider({ id: "dear", cost: { inputPerMTokens: 50, outputPerMTokens: 50 } });
    const r = route([dear, cheap], request(), ctx());
    expect(r.selected).toBe("cheap");
    expect(r.fallbackOrder).toEqual(["dear"]);
    expect(r.estimatedCost).toBeLessThan(1);
  });
  it("preferred order overrides cost", () => {
    const cheap = provider({ id: "cheap", cost: { inputPerMTokens: 1, outputPerMTokens: 1 } });
    const dear = provider({ id: "dear", cost: { inputPerMTokens: 50, outputPerMTokens: 50 } });
    const r = route([cheap, dear], request({ preferredOrder: ["dear"] }), ctx());
    expect(r.selected).toBe("dear");
    expect(r.fallbackOrder).toEqual(["cheap"]);
  });
  it("healthy ranks before degraded at equal cost", () => {
    const health = new Map([["b", providerHealthSchema.parse({ providerId: "b", status: "degraded", consecutiveFailures: 2 })]]);
    const r = route([provider({ id: "b" }), provider({ id: "a" })], request(), ctx({ health }));
    expect(r.selected).toBe("a"); // both eligible + equal cost, but b is degraded
    expect(r.fallbackOrder).toEqual(["b"]);
  });
  it("deterministic: identical inputs and registry order-independence", () => {
    const p1 = provider({ id: "p1", cost: { inputPerMTokens: 2, outputPerMTokens: 2 } });
    const p2 = provider({ id: "p2", cost: { inputPerMTokens: 3, outputPerMTokens: 3 } });
    expect(route([p1, p2], request(), ctx())).toEqual(route([p2, p1], request(), ctx()));
  });
  it("no eligible provider → null selection with a structured rationale", () => {
    const r = route([], request(), ctx());
    expect(r.selected).toBeNull();
    expect(r.estimatedCost).toBeNull();
    expect(r.fallbackOrder).toEqual([]);
    expect(r.rationale.eligibleCount).toBe(0);
    expect(r.rationale.consideredCount).toBe(0);
    expect(r.rationale.orderedBy).toEqual(["preferred", "health", "cost", "latency", "id"]);
  });
  it("rationale carries the soft-budget warning without blocking", () => {
    const r = route([provider({ id: "p" })], request({ spentSoFar: 8, budget: { perStage: 5, perJob: 100, hardCeiling: 100, softWarning: 8 } }), ctx());
    expect(r.selected).toBe("p");
    expect(r.rationale.softBudgetWarning).toBe(true);
  });
});

/* ---- circuit breaker transitions ------------------------------------------ */
describe("circuit breaker (closed → open → half_open → closed)", () => {
  const config = circuitConfigSchema.parse({ failureThreshold: 3, cooldownMs: 30_000, halfOpenProbes: 1 });
  it("opens after the failure threshold", () => {
    let c = newCircuit("p");
    c = cbFail(c, config, NOW);
    c = cbFail(c, config, NOW);
    expect(isOpen(c)).toBe(false); // 2 < 3
    c = cbFail(c, config, NOW);
    expect(isOpen(c)).toBe(true); // 3 ≥ 3
    expect(c.openedAt).toBe(NOW);
  });
  it("stays open until cooldown, then allows a half-open probe", () => {
    let c: Circuit = { ...newCircuit("p"), state: "open", failures: 3, openedAt: NOW };
    expect(attempt(c, config, later(10_000)).allowed).toBe(false); // within cooldown
    const probe = attempt(c, config, later(30_000));
    expect(probe.allowed).toBe(true);
    expect(probe.circuit.state).toBe("half_open");
    c = probe.circuit;
    c = cbOk(c, config); // successful probe closes it
    expect(c.state).toBe("closed");
    expect(c.failures).toBe(0);
  });
  it("a failed half-open probe re-opens immediately", () => {
    const half = { ...newCircuit("p"), state: "half_open" as const };
    const reopened = cbFail(half, config, later(60_000));
    expect(reopened.state).toBe("open");
  });
  it("a success while closed clears the failure streak", () => {
    let c = cbFail(newCircuit("p"), config, NOW);
    expect(c.failures).toBe(1);
    c = cbOk(c, config);
    expect(c.failures).toBe(0);
    expect(c.state).toBe("closed");
  });
});

/* ---- health model --------------------------------------------------------- */
describe("provider health model", () => {
  it("degrades after consecutive failures; a success restores healthy", () => {
    let h = newHealth("p");
    h = hFail(h, NOW);
    expect(h.status).toBe("healthy"); // 1 failure
    h = hFail(h, NOW);
    expect(h.status).toBe("degraded"); // 2 failures
    expect(effectiveStatus(h, null, NOW)).toBe("degraded");
    h = hOk(h, later(1_000));
    expect(h.status).toBe("healthy");
    expect(h.consecutiveFailures).toBe(0);
  });
  it("an open circuit overrides health as circuit_open", () => {
    const h = newHealth("p");
    const open = { ...newCircuit("p"), state: "open" as const, failures: 5, openedAt: NOW };
    expect(effectiveStatus(h, open, NOW)).toBe("circuit_open");
  });
});
