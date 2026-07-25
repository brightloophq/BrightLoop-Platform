/* =============================================================================
 * Proposal Intelligence Engine (Sprint 11) — barrel.
 *
 * Converts approved recommendations, decision briefs, and competitor context into
 * an approval-ready, DATA-ONLY proposal artifact. Pure and deterministic: no PDF,
 * no UI, no live AI, no pricing, no contracts or e-signatures.
 *
 * Named `proposal-intelligence` so it does not collide with the Sprint-1
 * `proposal/` module, which is unchanged. `events.ts` is namespaced.
 * ========================================================================== */

export * from "./request.js";
export * from "./strategy.js";
export * from "./scope.js";
export * from "./deliverables.js";
export * from "./phases.js";
export * from "./milestones.js";
export * from "./metrics.js";
export * from "./qualifiers.js";
export * from "./investment.js";
export * from "./packages.js";
export * from "./proof.js";
export * from "./artifact.js";
export * from "./lifecycle.js";
export * from "./integration.js";
export * from "./runtime.js";
export * as proposalEvents from "./events.js";
