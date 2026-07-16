/* =============================================================================
 * CatalogRepository — the PORT for the service catalog (modules, plans, content).
 *
 * The Services and Packages pages read the catalog through this port. No page
 * hardcodes a module, a price, or a plan. When real pricing arrives (open
 * decisions 1 & 2) it replaces the DATA behind this port — no page changes.
 * ========================================================================== */

import type {
  Asset,
  Discipline,
  Goal,
  ModuleContent,
  Plan,
  RangeFactor,
  ServiceModule,
} from "@brightloop/schema";
import type { DataSource } from "./reputation.js";

/** A module joined with its editorial content and resolved estimate range. */
export interface ModuleDetail {
  module: ServiceModule;
  content: ModuleContent | null;
  /** Resolved estimate range — from content.range, else derived from `from`. */
  range: readonly [number, number];
}

export interface CatalogRepository {
  readonly source: DataSource;

  /** All modules, ordered Brand → Build → Automate → Grow. */
  listModules(): Promise<ServiceModule[]>;

  /** Modules for one discipline, ordered by ascending "from" price. */
  listModulesByDiscipline(discipline: Discipline): Promise<ServiceModule[]>;

  /** A module with its editorial content and resolved range. */
  getModuleDetail(id: string): Promise<ModuleDetail | null>;

  /** Every module of a discipline with content — powers the service detail page. */
  listModuleDetailsByDiscipline(discipline: Discipline): Promise<ModuleDetail[]>;

  /** Productised plans (Foundation, Launch, Transform, Growth Partner). */
  listPlans(): Promise<Plan[]>;

  /** A plan with each of its modules resolved, plus the plan's estimate range. */
  getPlanDetail(id: string): Promise<PlanDetail | null>;

  /** Capabilities a client may already own (configurator inventory). */
  listAssets(): Promise<Asset[]>;

  /** Business goals (used by the funnel; exposed here as catalog reference data). */
  listGoals(): Promise<Goal[]>;

  /** Why an estimate is a range and not a fixed price. */
  listRangeFactors(): Promise<RangeFactor[]>;
}

export interface PlanDetail {
  plan: Plan;
  modules: ModuleDetail[];
  /** Summed estimate range across the plan's modules. An ESTIMATE, not a quote. */
  range: readonly [number, number];
  /** Longest realistic delivery window in weeks, from the modules' max weeks. */
  weeksMax: number;
}
