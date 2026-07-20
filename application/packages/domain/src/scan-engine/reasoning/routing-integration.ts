/* =============================================================================
 * Provider-routing integration (Sprint 6 §06 · PDF 27 §06/§14) — PURE.
 *
 * Bridges a reasoning job to the Sprint-2 registry + routing policy: derives the
 * required capabilities, token estimate, cost/latency ceilings, and preferred
 * order from the job, calls the pure `route()` policy, and returns the selection
 * plus every rejected provider with its reason. NO provider is invoked here.
 * ========================================================================== */

import type { ProviderDescriptor, ProviderHealth, Circuit, CircuitConfig, ReasoningJob, RoutingRequest, SelectionResult } from "@brightloop/schema";
import { route, type RoutingContext } from "../routing/policy.js";

/** Fraction of the cost ceiling above which routing raises a soft-budget warning. */
const SOFT_WARNING_FRACTION = 0.8;

export interface ReasoningRoutingContext {
  registry: ProviderDescriptor[];
  health?: Map<string, ProviderHealth>;
  circuits?: Map<string, Circuit>;
  circuitConfig?: CircuitConfig;
  spentSoFar?: number;
  region?: string | null;
  now: string;
}

/**
 * Build a routing request from a reasoning job's provider requirements + budget.
 * The single job cost ceiling maps to per-stage / per-job / hard ceiling; the
 * soft-warning threshold is a fixed fraction of it. Pure.
 */
export function buildRoutingRequest(job: ReasoningJob, spentSoFar = 0, region: string | null = null): RoutingRequest {
  const ceiling = job.budget.costCeiling;
  return {
    taskType: job.taskType, // extraction | reasoning | writing — shared enum with the registry
    requiredCapabilities: job.providerRequirements.capabilities,
    minContextTokens: job.providerRequirements.minContextTokens,
    tokens: { inputTokens: job.budget.inputTokens, outputTokens: job.budget.outputTokens },
    maxLatencyMs: job.budget.latencyCeilingMs,
    region,
    budget: { perStage: ceiling, perJob: ceiling, hardCeiling: ceiling, softWarning: ceiling * SOFT_WARNING_FRACTION },
    spentSoFar,
    preferredOrder: job.providerRequirements.preferredProviderIds,
  };
}

/**
 * Route a reasoning job: build its request, run the pure routing policy over the
 * registry, and return the structured selection (selected id, fallback order,
 * rejected candidates + reasons, rationale). No provider invocation. Pure given `now`.
 */
export function routeReasoningJob(job: ReasoningJob, ctx: ReasoningRoutingContext): SelectionResult {
  const request = buildRoutingRequest(job, ctx.spentSoFar ?? 0, ctx.region ?? null);
  const routingCtx: RoutingContext = {
    health: ctx.health ?? new Map(),
    circuits: ctx.circuits ?? new Map(),
    circuitConfig: ctx.circuitConfig,
    now: ctx.now,
  };
  return route(ctx.registry, request, routingCtx);
}

/** Convenience: the ordered provider chain (selected first, then fallbacks). */
export function providerChain(result: SelectionResult): string[] {
  return result.selected === null ? [] : [result.selected, ...result.fallbackOrder];
}
