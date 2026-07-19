/* =============================================================================
 * Cost-aware routing policy (PDF 27 §06/§14/§15) — PURE.
 *
 * Selects a provider for a task from the registry, checking required
 * capabilities, context/token limits, region, availability, health, circuit
 * state, latency budget, and cost budget. Produces a deterministic fallback
 * chain and a STRUCTURED rationale (never hidden chain-of-thought). Pure
 * functions of registry + request + health/circuit context + a supplied `now`.
 * ========================================================================== */

import {
  type ProviderDescriptor,
  type ProviderCapability,
  type ProviderHealth,
  type Circuit,
  type CircuitConfig,
  type RoutingRequest,
  type RejectionReason,
  type SelectionResult,
  circuitConfigSchema,
} from "@brightloop/schema";
import { estimateCost, evaluateBudget } from "./cost.js";
import { effectiveStatus, isEligibleStatus, newHealth } from "./health.js";
import { attempt, newCircuit } from "./circuit.js";

export interface RoutingContext {
  health: Map<string, ProviderHealth>;
  circuits: Map<string, Circuit>;
  circuitConfig?: CircuitConfig;
  now: string;
}

/** A descriptor "has" a capability via its list or the structured/multimodal flags. */
export function hasCapability(d: ProviderDescriptor, cap: ProviderCapability): boolean {
  if (d.capabilities.includes(cap)) return true;
  if (cap === "structured_output" && d.structuredOutput) return true;
  if (cap === "multimodal" && d.multimodal) return true;
  return false;
}

interface Evaluated {
  id: string;
  eligible: boolean;
  reason: RejectionReason | null;
  cost: number;
  latencyMs: number;
  healthTier: number; // 0 healthy, 1 degraded
  preferredIndex: number;
  softWarning: boolean;
  projectedJobSpend: number;
}

/** Canonical check order → the FIRST failing check is the recorded reason. */
function evaluate(d: ProviderDescriptor, request: RoutingRequest, ctx: RoutingContext): Evaluated {
  const config = circuitConfigSchema.parse(ctx.circuitConfig ?? {});
  const cost = estimateCost(d, request.tokens);
  const budget = evaluateBudget(cost, request.spentSoFar, request.budget);
  const preferredIndex = request.preferredOrder.indexOf(d.id);
  const base = {
    id: d.id,
    cost,
    latencyMs: d.latency.typicalMs,
    preferredIndex: preferredIndex < 0 ? Number.POSITIVE_INFINITY : preferredIndex,
    softWarning: budget.softWarning,
    projectedJobSpend: budget.projectedJobSpend,
  };
  const reject = (reason: RejectionReason, healthTier = 0): Evaluated => ({ ...base, eligible: false, reason, healthTier });

  if (!d.taskTypes.includes(request.taskType)) return reject("unsupported_task");
  for (const cap of request.requiredCapabilities) if (!hasCapability(d, cap)) return reject("missing_capability");
  if (d.maxContextTokens < request.minContextTokens || d.maxContextTokens < request.tokens.inputTokens || d.maxOutputTokens < request.tokens.outputTokens) {
    return reject("context_too_small");
  }
  if (request.region && d.regions.length > 0 && !d.regions.includes(request.region)) return reject("region_excluded");
  if (!d.available) return reject("unavailable");

  const health = ctx.health.get(d.id) ?? newHealth(d.id);
  const circuit = ctx.circuits.get(d.id) ?? newCircuit(d.id);
  const status = effectiveStatus(health, circuit, ctx.now);
  if (status === "unavailable") return reject("unavailable");
  if (status === "rate_limited") return reject("rate_limited");
  if (status === "circuit_open") {
    // an open circuit past cooldown allows a half-open probe → still eligible
    if (!attempt(circuit, config, ctx.now).allowed) return reject("circuit_open");
  }
  if (!isEligibleStatus(status === "circuit_open" ? "degraded" : status)) return reject("unavailable");

  if (d.latency.typicalMs > request.maxLatencyMs) return reject("over_latency_budget", status === "degraded" ? 1 : 0);
  if (!budget.allowed) return reject("over_cost_budget", status === "degraded" ? 1 : 0);

  return { ...base, eligible: true, reason: null, healthTier: status === "degraded" ? 1 : 0 };
}

/**
 * Route a task to a provider. Returns the selected provider (or null when none is
 * eligible), the ordered fallback chain, every rejected candidate with its reason,
 * estimated cost/latency, and a structured rationale. Deterministic — identical
 * inputs always yield an identical result.
 *
 * Eligible ordering: preferred index → health (healthy before degraded) → cost
 * (ascending, cost-aware) → latency → id. A total, stable order.
 */
export function route(registry: ProviderDescriptor[], request: RoutingRequest, ctx: RoutingContext): SelectionResult {
  const evaluated = registry.map((d) => evaluate(d, request, ctx));
  const eligible = evaluated
    .filter((e) => e.eligible)
    .sort((a, b) => {
      if (a.preferredIndex !== b.preferredIndex) return a.preferredIndex - b.preferredIndex;
      if (a.healthTier !== b.healthTier) return a.healthTier - b.healthTier;
      if (a.cost !== b.cost) return a.cost - b.cost;
      if (a.latencyMs !== b.latencyMs) return a.latencyMs - b.latencyMs;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
  const rejected = evaluated
    .filter((e) => !e.eligible)
    .map((e) => ({ providerId: e.id, reason: e.reason!, detail: null }));

  const selected = eligible[0] ?? null;
  return {
    selected: selected?.id ?? null,
    estimatedCost: selected?.cost ?? null,
    estimatedLatencyMs: selected?.latencyMs ?? null,
    fallbackOrder: eligible.slice(1).map((e) => e.id),
    rejected,
    rationale: {
      taskType: request.taskType,
      consideredCount: registry.length,
      eligibleCount: eligible.length,
      orderedBy: ["preferred", "health", "cost", "latency", "id"],
      softBudgetWarning: selected?.softWarning ?? false,
      projectedJobSpend: selected?.projectedJobSpend ?? request.spentSoFar,
    },
  };
}
