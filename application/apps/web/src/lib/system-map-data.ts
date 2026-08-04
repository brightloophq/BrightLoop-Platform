import "server-only";

import { DOMAIN_KEYS, DOMAIN_META, type Domain } from "@brightloop/schema";
import { demoSystemMap } from "@brightloop/data";
import type { ExplorerData, ExplorerNode, NodeRisk, NodeStatus } from "@brightloop/ui";
import { getCoreSurfaceRepository, isDemoMode } from "./repositories";

/**
 * System Map explorer data seam (PX.1d). Demo Mode → the rich interactive map;
 * normal mode → a sparse but honest map built from the caller's live domain rows
 * (no fabricated owners/signals/AI); `null` when there are no domains yet, so the
 * page shows an educational empty state. The page is unaware of the source.
 */
export async function getSystemMapData(): Promise<ExplorerData | null> {
  if (await isDemoMode()) return demoSystemMap(Date.now());

  try {
    const repo = await getCoreSurfaceRepository();
    const domains = await repo.listAllDomains();
    if (domains.length === 0) return null;
    return buildLiveExplorerData(domains);
  } catch {
    return null;
  }
}

function riskFromHealth(h: number | null): NodeRisk {
  if (h === null) return "high";
  if (h >= 75) return "low";
  if (h >= 55) return "medium";
  return "high";
}

const NA_AI = {
  summarize: "AI insights are available in Demo Mode or once this domain has activity.",
  explain: "AI insights are available in Demo Mode or once this domain has activity.",
  recommend: "AI insights are available in Demo Mode or once this domain has activity.",
  predict: "AI insights are available in Demo Mode or once this domain has activity.",
  risk: "AI insights are available in Demo Mode or once this domain has activity.",
  nextAction: "AI insights are available in Demo Mode or once this domain has activity.",
};

/** Aggregate live domain rows (RLS-scoped) into a sparse, honest explorer view. */
function buildLiveExplorerData(domains: readonly Domain[]): ExplorerData {
  const byKey = new Map<string, Domain[]>();
  for (const d of domains) {
    const arr = byKey.get(d.key) ?? [];
    arr.push(d);
    byKey.set(d.key, arr);
  }
  const nodes: ExplorerNode[] = DOMAIN_KEYS.map((key) => {
    const rows = byKey.get(key) ?? [];
    const scores = rows.map((r) => r.currentScore).filter((s): s is number => s !== null);
    const health = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const operating = rows.filter((r) => r.status === "operating").length;
    const assembling = rows.filter((r) => r.status === "assembling").length;
    const status: NodeStatus =
      operating > 0 && operating * 2 >= rows.length ? "operating" : assembling > 0 ? "assembling" : "not_operating";
    return {
      key,
      code: DOMAIN_META[key].code,
      label: DOMAIN_META[key].label,
      status,
      health,
      completion: health ?? 0,
      automation: 0,
      aiConfidence: 0,
      risk: riskFromHealth(health),
      owner: "—",
      activeSignals: 0,
      recommendations: 0,
      lastUpdated: new Date().toISOString(),
      connections: [],
      summary: "Live domain from the latest business scan.",
      businessImpact: "Detail accrues as signals, recommendations and activity are recorded for this domain.",
      signals: [],
      recs: [],
      activity: [],
      metrics: health !== null ? [{ label: "Health", value: `${health}/100` }] : [],
      history: [],
      nextActions: [],
      ai: NA_AI,
    };
  });
  const scored = nodes.map((n) => n.health).filter((h): h is number => h !== null);
  const value = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 0;
  return { nodes, connections: [], index: { value, target: 92, pct: Math.min(1, value / 92) }, scopeLabel: "Portfolio" };
}
