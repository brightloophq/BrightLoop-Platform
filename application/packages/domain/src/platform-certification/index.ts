/* =============================================================================
 * Platform Certification & Production Readiness (Phase E · Sprint E8) — domain
 * barrel. The declared platform manifest, the deterministic audit engine (real
 * checks over the live capability registry / role matrix / instruction-trust
 * precedence + manifest posture), immutable builders, and the repository ports.
 * All pure. This context CERTIFIES E1–E7; it adds no business capability.
 * ========================================================================== */

export * from "./manifest.js";
export * from "./audits.js";
export * from "./builders.js";
export * from "./repository.js";
