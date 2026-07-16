/* =============================================================================
 * PlaceholderCatalogRepository — implements the CatalogRepository port over the
 * placeholder module/plan catalog.
 *
 * When real pricing lands (open decisions 1 & 2) the DATA behind this port is
 * replaced — either by editing the dataset or by a SupabaseCatalogRepository.
 * No page or component changes, because none of them know where the catalog
 * comes from or what any price is.
 * ========================================================================== */

import type { Asset, Discipline, Goal, Plan, RangeFactor, ServiceModule } from "@brightloop/schema";
import {
  orderModules,
  rangeFor,
  sumRanges,
  weeksMaxFor,
  type CatalogRepository,
  type DataSource,
  type ModuleDetail,
  type PlanDetail,
} from "@brightloop/domain";
import {
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_CONTENT,
  PLACEHOLDER_GOALS,
  PLACEHOLDER_MODULES,
  PLACEHOLDER_PLANS,
  PLACEHOLDER_RANGE_FACTORS,
} from "./catalog.dataset.js";

export class PlaceholderCatalogRepository implements CatalogRepository {
  readonly source: DataSource = "placeholder";

  private readonly modules: readonly ServiceModule[];
  private readonly plans: readonly Plan[];

  constructor(
    options: { modules?: readonly ServiceModule[]; plans?: readonly Plan[] } = {},
  ) {
    this.modules = options.modules ?? PLACEHOLDER_MODULES;
    this.plans = options.plans ?? PLACEHOLDER_PLANS;
  }

  private detailFor(module: ServiceModule): ModuleDetail {
    const content = PLACEHOLDER_CONTENT[module.id] ?? null;
    return { module, content, range: rangeFor(module, content) };
  }

  async listModules(): Promise<ServiceModule[]> {
    return orderModules(this.modules);
  }

  async listModulesByDiscipline(discipline: Discipline): Promise<ServiceModule[]> {
    return orderModules(this.modules.filter((m) => m.stage === discipline));
  }

  async getModuleDetail(id: string): Promise<ModuleDetail | null> {
    const module = this.modules.find((m) => m.id === id);
    return module ? this.detailFor(module) : null;
  }

  async listModuleDetailsByDiscipline(discipline: Discipline): Promise<ModuleDetail[]> {
    const modules = await this.listModulesByDiscipline(discipline);
    return modules.map((m) => this.detailFor(m));
  }

  async listPlans(): Promise<Plan[]> {
    return [...this.plans];
  }

  async getPlanDetail(id: string): Promise<PlanDetail | null> {
    const plan = this.plans.find((p) => p.id === id);
    if (!plan) return null;

    // `upgrade` modules are alternatives, not additive — exclude them from the
    // plan roll-up so the estimate does not double-count Brand work.
    const modules = orderModules(
      plan.modules
        .map((mid) => this.modules.find((m) => m.id === mid))
        .filter((m): m is ServiceModule => Boolean(m) && !m!.upgrade),
    ).map((m) => this.detailFor(m));

    return {
      plan,
      modules,
      range: sumRanges(modules.map((m) => m.range)),
      weeksMax: weeksMaxFor(modules.map((m) => m.module)),
    };
  }

  async listAssets(): Promise<Asset[]> {
    return [...PLACEHOLDER_ASSETS];
  }

  async listGoals(): Promise<Goal[]> {
    return [...PLACEHOLDER_GOALS];
  }

  async listRangeFactors(): Promise<RangeFactor[]> {
    return [...PLACEHOLDER_RANGE_FACTORS];
  }
}
