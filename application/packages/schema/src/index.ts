/* =============================================================================
 * @brightloop/schema — the single source of truth for the Auxion platform.
 * Roles, permissions, entities, state machines, transition guards, tone map.
 * ========================================================================== */

export * from "./roles.js";
export * from "./machines.js";
export * from "./tone.js";
export * from "./entities.js";
export * from "./transformation.js";
export * from "./domains.js";
export * from "./scan-engine.js";
export * from "./engine.js";
export * from "./provider-registry.js";
export * from "./evidence.js";
export * from "./graph.js";
export * from "./discovery.js";
export * from "./reasoning.js";
export * from "./execution.js";
export * from "./pipeline.js";
export * from "./recommendation.js";
export * from "./competitor.js";
export * from "./competitor-intelligence.js";
export * from "./proposal.js";
export * from "./narrative.js";
export * from "./prospect-intelligence.js";
export * from "./runtime.js";
export * from "./reputation.js";
// `catalog` re-exports the Discipline type that originates in `reputation`;
// export the rest explicitly to avoid an ambiguous duplicate re-export.
export {
  disciplineSchema,
  estimateRangeSchema,
  assetSchema,
  deliverableLineSchema,
  moduleImpactSchema,
  moduleResponsibilitySchema,
  moduleContentSchema,
  serviceModuleSchema,
  planSchema,
  goalSchema,
  rangeFactorSchema,
  DISCIPLINE_ORDER,
  DISCIPLINE_SLUGS,
  disciplineFromSlug,
  slugForDiscipline,
} from "./catalog.js";
export type {
  ServiceModule,
  ModuleContent,
  Plan,
  Asset,
  Goal,
  EstimateRange,
  RangeFactor,
  DisciplineSlug,
} from "./catalog.js";
