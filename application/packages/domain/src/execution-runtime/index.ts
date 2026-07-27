/* =============================================================================
 * Execution Runtime & Deployment Engine (Phase F · Sprint F3) — domain barrel.
 *
 * Pure lifecycle machines, deployment policy evaluation, idempotency keys, failure
 * normalization + bounded retry, secret redaction, drift classification, package
 * validation + incompatibility detection, the provider-adapter + secret-store
 * PORTS, immutable builders, and repository ports. Provider-neutral throughout —
 * the domain never depends on the n8n SDK. Auxion is the system of record.
 * ========================================================================== */

export * from "./lifecycle.js";
export * from "./policy.js";
export * from "./idempotency.js";
export * from "./failures.js";
export * from "./redaction.js";
export * from "./drift.js";
export * from "./validation.js";
export * from "./adapter-port.js";
export * from "./builders.js";
export * from "./repository.js";
