import {
  PLACEHOLDER_ASSESSMENT,
  PLACEHOLDER_CONTENT,
  PLACEHOLDER_GOALS,
  PLACEHOLDER_MODULES,
  PLACEHOLDER_ASSETS,
  PLACEHOLDER_PLANS,
} from "@brightloop/data";
import { DISCIPLINES } from "@brightloop/schema";
import type { FunnelCatalog } from "./FunnelWizard";

/**
 * Assemble the funnel catalog on the SERVER and hand plain data to the client
 * wizard. Importing @brightloop/data here (server side) keeps its Supabase
 * dependencies out of the client bundle — the wizard only imports pure domain
 * functions.
 *
 * The catalog is placeholder (open decisions 1–3). The prospect's estimate is
 * indicative; their binding quote is built by a strategist in the discovery
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
    modules: [...PLACEHOLDER_MODULES],
    content: { ...PLACEHOLDER_CONTENT },
    assets: [...PLACEHOLDER_ASSETS],
    disciplines: DISCIPLINES,
  };
}
