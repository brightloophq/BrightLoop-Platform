/* Scan engine foundation — provider ports, entitlement policy, pipeline order.
 * Contracts only; the engine (crawler, LLM calls, benchmarks, proposal PDF) is
 * a later implementation phase. See docs/design/scan-engine-architecture.md. */
export * from "./providers.js";
export * from "./entitlements.js";
export * from "./pipeline.js";
