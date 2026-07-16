/* =============================================================================
 * Service catalog contracts — Modules, Plans, and their editorial content.
 * Ported from docs/handoff/reference/onboarding-data.js.
 *
 * This is the CONTRACT only. The catalog itself is DATA served through
 * CatalogRepository — it is never hardcoded into a page. Prices, module lists
 * and copy are all placeholder until the product owner supplies real values
 * (open decisions 1 & 2), and swapping them must not require a code change.
 *
 * PRICING RULE (handoff §05 / approved Decision E): every price here is a
 * "from" ESTIMATE expressed as a RANGE. It is never a quote. Only Proposal and
 * Contract carry binding figures.
 * ========================================================================== */

import { z } from "zod";
import { DISCIPLINES } from "./reputation.js";

export const disciplineSchema = z.enum(DISCIPLINES);

/** An estimate range in whole currency units (USD). Never a fixed quote. */
export const estimateRangeSchema = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([lo, hi]) => hi >= lo, { message: "estimate high must be >= low" });

/** A capability the client may already own — drives configurator de-duplication. */
export const assetSchema = z.object({
  key: z.string(),
  label: z.string(),
  icon: z.string(),
});

/** A named deliverable: [name, plain-language explanation]. */
export const deliverableLineSchema = z.tuple([z.string(), z.string()]);

export const moduleImpactSchema = z.object({
  value: z.string(),
  results: z.string(),
  complexity: z.string(),
  future: z.string(),
  next: z.string(),
});

export const moduleResponsibilitySchema = z.object({
  /** What BrightLoop does. */
  bl: z.array(z.string()),
  /** What the client does. */
  you: z.array(z.string()),
});

/** Rich editorial content for a module (the layered, plain-language catalog). */
export const moduleContentSchema = z.object({
  outcome: z.string(),
  promise: z.string(),
  range: estimateRangeSchema,
  deliverables: z.array(deliverableLineSchema),
  impact: moduleImpactSchema,
  resp: moduleResponsibilitySchema,
  upgrades: z.array(z.string()),
});

export const serviceModuleSchema = z.object({
  id: z.string(),
  /** Which discipline of the loop this module belongs to. */
  stage: disciplineSchema,
  name: z.string(),
  /** "From" price in whole USD — indicative, refined on the strategy call. */
  from: z.number().nonnegative(),
  /** [minWeeks, maxWeeks] */
  weeks: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  /** Capability keys this module satisfies — matched against owned assets. */
  assets: z.array(z.string()),
  includes: z.array(z.string()),
  why: z.string(),
  /** Module ids this one depends on. */
  deps: z.array(z.string()),
  growth: z.string(),
  /** Upgrade modules are alternatives, excluded from plan selection totals. */
  upgrade: z.boolean().optional(),
});

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  tag: z.string(),
  blurb: z.string(),
  modules: z.array(z.string()),
});

export const goalSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string(),
});

/** Why an estimate is a range, not a fixed price: [factor, explanation]. */
export const rangeFactorSchema = z.tuple([z.string(), z.string()]);

export type ServiceModule = z.infer<typeof serviceModuleSchema>;
export type ModuleContent = z.infer<typeof moduleContentSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type EstimateRange = z.infer<typeof estimateRangeSchema>;
export type RangeFactor = z.infer<typeof rangeFactorSchema>;
export type Discipline = z.infer<typeof disciplineSchema>;

/** Ordering of the loop — Brand → Build → Automate → Grow. */
export const DISCIPLINE_ORDER: Record<Discipline, number> = {
  Brand: 0,
  Build: 1,
  Automate: 2,
  Grow: 3,
};

/** Slug ↔ discipline mapping for /services/:discipline routes. */
export const DISCIPLINE_SLUGS = {
  brand: "Brand",
  build: "Build",
  automate: "Automate",
  grow: "Grow",
} as const satisfies Record<string, Discipline>;

export type DisciplineSlug = keyof typeof DISCIPLINE_SLUGS;

export function disciplineFromSlug(slug: string): Discipline | null {
  return Object.prototype.hasOwnProperty.call(DISCIPLINE_SLUGS, slug)
    ? DISCIPLINE_SLUGS[slug as DisciplineSlug]
    : null;
}

export function slugForDiscipline(discipline: Discipline): DisciplineSlug {
  const entry = Object.entries(DISCIPLINE_SLUGS).find(([, d]) => d === discipline);
  return (entry?.[0] ?? "brand") as DisciplineSlug;
}
