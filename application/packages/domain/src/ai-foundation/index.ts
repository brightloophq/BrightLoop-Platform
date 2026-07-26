/* =============================================================================
 * AI Foundation (Phase E · Sprint E1) — domain barrel.
 *
 * The provider-agnostic substrate: model registry, provider port, token/cost
 * accounting, retry/failover policy, prompt lifecycle + templating + safety,
 * conversations, evaluation, and the repository ports. All pure except the port
 * (which adapters implement in `@brightloop/data`).
 * ========================================================================== */

export * from "./registry.js";
export * from "./provider.js";
export * from "./accounting.js";
export * from "./resilience.js";
export * from "./prompt.js";
export * from "./conversation.js";
export * from "./evaluation.js";
export * from "./repository.js";
