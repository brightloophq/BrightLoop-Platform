import "server-only";

import { acquisitionFunnel, countByName, type FunnelStage } from "@brightloop/domain";
import { demoAnalytics } from "@brightloop/data";
import { createClient } from "./supabase/server";
import { isDemoMode } from "./repositories";

/**
 * Analytics read seam (PX.1b). The Admin Analytics page renders this shape and is
 * unaware of the data source: live Supabase in normal mode (real events + live
 * counts, the existing integrity contract), or the deterministic demo dataset in
 * Demo Mode. No `if (demoMode)` ever lives in the page.
 */
export interface AnalyticsData {
  readonly funnel: FunnelStage[];
  readonly byName: Record<string, number>;
  readonly leads: number;
  readonly activations: number;
  readonly projects: number;
  readonly totalEvents: number;
  /** True when RLS denied the analytics scope (live mode only). */
  readonly denied: boolean;
}

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  filter?: [string, string],
): Promise<number> {
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (filter) q = q.eq(filter[0], filter[1]);
  const { count } = await q;
  return count ?? 0;
}

export async function getAnalyticsData(): Promise<AnalyticsData> {
  if (await isDemoMode()) {
    const d = demoAnalytics();
    const funnel = acquisitionFunnel({
      assessments: d.assessments,
      proposalsAccepted: d.proposalsAccepted,
      contractsSigned: d.contractsSigned,
      activations: d.activations,
    });
    const byName = { ...d.byName };
    const totalEvents = Object.values(byName).reduce((a, b) => a + b, 0);
    return { funnel, byName, leads: d.leads, activations: d.activations, projects: d.projects, totalEvents, denied: false };
  }

  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("analytics_events")
    .select("name, at")
    .order("at", { ascending: false })
    .limit(5000);

  const rows = events ?? [];
  const byName = countByName(rows);

  const [assessments, proposalsAccepted, contractsSigned, activations, leads, projects] = await Promise.all([
    count(supabase, "assessments", ["status", "completed"]),
    count(supabase, "proposals", ["status", "accepted"]),
    count(supabase, "contracts", ["status", "active"]),
    count(supabase, "clients", ["lifecycle", "client_active"]),
    count(supabase, "leads"),
    count(supabase, "projects"),
  ]);

  const funnel = acquisitionFunnel({ assessments, proposalsAccepted, contractsSigned, activations });
  const denied = error?.message?.toLowerCase().includes("permission") ?? false;

  return { funnel, byName, leads, activations, projects, totalEvents: rows.length, denied };
}
