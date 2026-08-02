/* =============================================================================
 * Integration Platform (Phase F · Sprint F4.1) — domain barrel.
 *
 * The framework every external service plugs into: the Connector Registry, pure
 * lifecycle machines, config validation, the OAuth abstraction, idempotency keys,
 * health + failure normalization, secret redaction, event translation, immutable
 * builders, the provider-adapter + secret-store PORTS, and repository ports.
 * Provider-neutral throughout — the domain never depends on a connector SDK.
 * Auxion is the system of record.
 * ========================================================================== */

export * from "./registry.js";
export * from "./lifecycle.js";
export * from "./config.js";
export * from "./oauth.js";
export * from "./idempotency.js";
export * from "./health.js";
export * from "./failures.js";
export * from "./redaction.js";
export * from "./translation.js";
export * from "./events.js";
export * from "./builders.js";
export * from "./adapter-port.js";
export * from "./repository.js";
