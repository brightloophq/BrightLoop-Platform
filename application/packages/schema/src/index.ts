/* =============================================================================
 * @brightloop/schema — the single source of truth for the BrightLoop platform.
 * Roles, permissions, entities, state machines, transition guards, tone map.
 * ========================================================================== */

export * from "./roles.js";
export * from "./machines.js";
export * from "./tone.js";
export * from "./entities.js";
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
