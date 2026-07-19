/* =============================================================================
 * Provider Registry & cost-aware routing — CONTRACTS (PDF 27 §06/§14/§15).
 *
 * Sprint 2 extends the Sprint-1 engine skeleton: a descriptor-based provider
 * registry, a health model, a cost model, a circuit breaker, and a structured
 * selection result. Data SHAPES only — the routing/health/circuit/cost LOGIC is
 * pure domain code (@brightloop/domain/scan-engine/routing/*). No vendor is named
 * anywhere; providers are opaque registry entries chosen at runtime.
 * ========================================================================== */

import { z } from "zod";

/* ---- provider registry ---------------------------------------------------- */
/** Task kinds a stage needs (PDF 27 §06: "extraction, reasoning, or writing"). */
export const providerTaskTypeSchema = z.enum(["extraction", "reasoning", "writing"]);
export type ProviderTaskType = z.infer<typeof providerTaskTypeSchema>;

/** General capability flags a task may require of a provider. */
export const providerCapabilitySchema = z.enum(["structured_output", "multimodal", "function_calling", "long_context", "streaming"]);
export type ProviderCapability = z.infer<typeof providerCapabilitySchema>;

export const providerCostSchema = z.object({
  inputPerMTokens: z.number().nonnegative(), // price per 1e6 input tokens
  outputPerMTokens: z.number().nonnegative(), // price per 1e6 output tokens
});
export type ProviderCost = z.infer<typeof providerCostSchema>;

export const providerLatencySchema = z.object({
  typicalMs: z.number().int().nonnegative(),
  p95Ms: z.number().int().nonnegative(),
});
export type ProviderLatency = z.infer<typeof providerLatencySchema>;

/** A registry entry. `id` is opaque — NEVER a hardcoded vendor branch downstream. */
export const providerDescriptorSchema = z.object({
  id: z.string(),
  taskTypes: z.array(providerTaskTypeSchema).min(1), // supported task types
  capabilities: z.array(providerCapabilitySchema).default([]),
  maxContextTokens: z.number().int().positive(), // context limits
  maxOutputTokens: z.number().int().positive(),
  structuredOutput: z.boolean().default(false), // structured-output support
  multimodal: z.boolean().default(false), // multimodal support
  available: z.boolean().default(true), // static availability (operator toggle)
  regions: z.array(z.string()).default([]), // region constraints ([] = unrestricted)
  cost: providerCostSchema, // cost metadata
  latency: providerLatencySchema, // latency metadata
});
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

/* ---- provider health model ------------------------------------------------ */
export const healthStatusSchema = z.enum(["healthy", "degraded", "unavailable", "rate_limited", "circuit_open"]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const providerHealthSchema = z.object({
  providerId: z.string(),
  status: healthStatusSchema.default("healthy"),
  lastSuccessAt: z.string().nullable().default(null),
  lastFailureAt: z.string().nullable().default(null),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  rateLimitResetAt: z.string().nullable().default(null),
});
export type ProviderHealth = z.infer<typeof providerHealthSchema>;

/* ---- circuit breaker ------------------------------------------------------ */
export const circuitStateSchema = z.enum(["closed", "open", "half_open"]);
export type CircuitState = z.infer<typeof circuitStateSchema>;

export const circuitConfigSchema = z.object({
  failureThreshold: z.number().int().positive().default(5), // consecutive failures → open
  cooldownMs: z.number().int().positive().default(30_000), // open → half-open after cooldown
  halfOpenProbes: z.number().int().positive().default(1), // successful probes to close
});
export type CircuitConfig = z.infer<typeof circuitConfigSchema>;

export const circuitSchema = z.object({
  providerId: z.string(),
  state: circuitStateSchema.default("closed"),
  failures: z.number().int().nonnegative().default(0),
  openedAt: z.string().nullable().default(null),
  halfOpenSuccesses: z.number().int().nonnegative().default(0),
});
export type Circuit = z.infer<typeof circuitSchema>;

/* ---- cost model ----------------------------------------------------------- */
export const tokenEstimateSchema = z.object({
  inputTokens: z.number().int().nonnegative(), // estimated input tokens
  outputTokens: z.number().int().nonnegative(), // estimated output tokens
});
export type TokenEstimate = z.infer<typeof tokenEstimateSchema>;

export const budgetSchema = z.object({
  perStage: z.number().nonnegative(), // ceiling for one request/stage
  perJob: z.number().nonnegative(), // ceiling for the whole scan job
  hardCeiling: z.number().nonnegative(), // absolute cap — never exceeded
  softWarning: z.number().nonnegative(), // projected cost at/above this warns (still allowed)
});
export type Budget = z.infer<typeof budgetSchema>;

/* ---- routing request + selection result ----------------------------------- */
export const rejectionReasonSchema = z.enum([
  "unsupported_task",
  "missing_capability",
  "context_too_small",
  "over_cost_budget",
  "over_latency_budget",
  "unavailable",
  "rate_limited",
  "circuit_open",
  "region_excluded",
]);
export type RejectionReason = z.infer<typeof rejectionReasonSchema>;

export const routingRequestSchema = z.object({
  taskType: providerTaskTypeSchema,
  requiredCapabilities: z.array(providerCapabilitySchema).default([]),
  minContextTokens: z.number().int().nonnegative().default(0),
  tokens: tokenEstimateSchema,
  maxLatencyMs: z.number().int().positive(),
  region: z.string().nullable().default(null), // request region constraint
  budget: budgetSchema,
  spentSoFar: z.number().nonnegative().default(0), // job spend before this request
  preferredOrder: z.array(z.string()).default([]), // explicit preferred provider ids
});
export type RoutingRequest = z.infer<typeof routingRequestSchema>;

export const rejectedCandidateSchema = z.object({
  providerId: z.string(),
  reason: rejectionReasonSchema,
  detail: z.string().nullable().default(null),
});
export type RejectedCandidate = z.infer<typeof rejectedCandidateSchema>;

/** Structured routing rationale — inspectable metadata, NOT hidden chain-of-thought. */
export const routingRationaleSchema = z.object({
  taskType: providerTaskTypeSchema,
  consideredCount: z.number().int().nonnegative(),
  eligibleCount: z.number().int().nonnegative(),
  orderedBy: z.array(z.string()), // e.g. ["preferred", "cost", "latency", "id"]
  softBudgetWarning: z.boolean(),
  projectedJobSpend: z.number().nonnegative(),
});
export type RoutingRationale = z.infer<typeof routingRationaleSchema>;

export const selectionResultSchema = z.object({
  selected: z.string().nullable(), // provider id, or null when nothing is eligible
  estimatedCost: z.number().nonnegative().nullable(),
  estimatedLatencyMs: z.number().int().nonnegative().nullable(),
  fallbackOrder: z.array(z.string()).default([]), // ordered eligible ids after the selected
  rejected: z.array(rejectedCandidateSchema).default([]),
  rationale: routingRationaleSchema,
});
export type SelectionResult = z.infer<typeof selectionResultSchema>;
