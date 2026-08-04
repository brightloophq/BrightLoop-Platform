import "server-only";

import { demoDashboardCharts, type DemoDashboardCharts } from "@brightloop/data";
import { isDemoMode } from "./repositories";

/**
 * Executive dashboard chart seam (PX.1c). Returns believable time-series + KPI
 * enrichment in Demo Mode, or `null` in normal mode — the platform has no
 * revenue/trend tables, so rather than fabricate production data the Console
 * shows an honest "not available yet" state for the analytics section. The page
 * is unaware of the source (no `if (demoMode)` in the view).
 */
export async function getDashboardCharts(): Promise<DemoDashboardCharts | null> {
  if (await isDemoMode()) return demoDashboardCharts();
  return null;
}
