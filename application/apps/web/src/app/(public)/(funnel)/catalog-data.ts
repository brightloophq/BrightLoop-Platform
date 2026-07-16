import {
  PLACEHOLDER_ASSESSMENT,
  PLACEHOLDER_GOALS,
  PLACEHOLDER_MODULES,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_PLANS,
} from "@brightloop/data";
import { DISCIPLINES } from "@brightloop/schema";
import type { FunnelCatalog } from "./FunnelWizard";

/**
 * Assemble the funnel catalog on the SERVER and hand PRICE-FREE data to the
 * client wizard.
 *
 * PRICING NEVER CROSSES TO THE CLIENT. The full catalog carries `from` prices
 * and cost ranges (PLACEHOLDER_MODULES / PLACEHOLDER_CONTENT); those stay on the
 * server for the internal pricing engine. Here we project modules down to their
 * price-free shape (id/name/stage/assets/upgrade) and drop `content` entirely —
 * the wizard displays neither, so a prospect's browser receives no price data
 * and no cost logic. The binding price is built by a strategist in the discovery
 * chat (Sprint 5C).
 */
export function funnelCatalog(): FunnelCatalog {
  return {
    questions: [...PLACEHOLDER_ASSESSMENT],
    goals: [...PLACEHOLDER_GOALS],
    plans: PLACEHOLDER_PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      tag: p.tag,
      blurb: p.blurb,
      modules: [...p.modules],
    })),
    modules: PLACEHOLDER_MODULES.map((m) => ({
      id: m.id,
      name: m.name,
      stage: m.stage,
      assets: [...m.assets],
      upgrade: m.upgrade,
    })),
    assets: [...PLACEHOLDER_ASSETS],
    disciplines: DISCIPLINES,
  };
}
