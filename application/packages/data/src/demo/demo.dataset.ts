/* =============================================================================
 * Demo dataset — believable, deterministic development/demo data (PX.1b).
 *
 * This is the single source of realistic content behind Demo Mode. It is PURE
 * data + pure derivations: no Supabase, no clock at module load, no randomness.
 * The only time input is an injected `now` (ms) so the activity feed reads as
 * "recent" while staying testable. It fabricates NOTHING that could be mistaken
 * for a real customer record — the organizations are the illustrative set named
 * in the PX.1 brief (Onixus, Verdant Fields Co., Acme Construction, Kingston
 * Logistics, Green Horizon), and Demo Mode is env-gated + off in real production.
 *
 * Everything downstream (the demo repositories) reads from here, so widening the
 * demo to new surfaces means extending this file, not the adapters.
 * ========================================================================== */

import type {
  BusinessScan,
  Domain,
  DomainKey,
  DomainStatus,
  EvidenceItem,
  FindingPriority,
  ScanFinding,
  ScanStatus,
  Signal,
} from "@brightloop/schema";
import { DOMAIN_KEYS } from "@brightloop/schema";
import type {
  DashboardActivity,
  DashboardSnapshot,
  SignalDetailData,
  SignalListData,
  SignalListQuery,
  SignalStatus,
  SignalSummary,
  SignalTransition,
} from "@brightloop/domain";
import { SIGNAL_PAGE_SIZE, SIGNAL_RECENT_DAYS } from "@brightloop/domain";

/* ---- org profile shape ---------------------------------------------------- */

interface DomainProfile {
  readonly status: DomainStatus;
  readonly baseline: number;
  readonly current: number | null;
}

interface DemoActivitySeed {
  readonly entity: string;
  readonly entityId: string;
  readonly from: string | null;
  readonly to: string;
  readonly actor: string | null;
  /** Minutes before `now` this transition happened. */
  readonly minutesAgo: number;
}

export interface DemoOrg {
  readonly id: string;
  readonly name: string;
  readonly industry: string;
  readonly health: number;
  readonly index: { readonly value: number; readonly delta: number | null };
  readonly scan: { readonly status: ScanStatus; readonly baselineIndex: number; readonly targetIndex: number };
  readonly domains: Readonly<Record<DomainKey, DomainProfile>>;
  readonly signals: Readonly<Record<string, number>>;
  readonly insights: Readonly<Record<string, number>>;
  readonly recommendations: Readonly<Record<string, number>>;
  readonly recommendationsStale: number;
  readonly approvals: Readonly<Record<string, number>>;
  readonly moves: Readonly<Record<string, number>>;
  readonly executions: Readonly<Record<string, number>>;
  readonly measurements: number;
  readonly learnings: number;
  readonly knowledge: number;
  readonly risks: { readonly total: number; readonly criticalOpen: number };
  readonly findings: readonly {
    readonly domainKey: DomainKey;
    readonly finding: string;
    readonly baseline: string | null;
    readonly priority: FindingPriority;
  }[];
  readonly activity: readonly DemoActivitySeed[];
}

const D = (status: DomainStatus, baseline: number, current: number | null): DomainProfile => ({
  status,
  baseline,
  current,
});

/* ---- the organizations ---------------------------------------------------- */

export const DEMO_ORGS: readonly DemoOrg[] = [
  {
    id: "demo_onixus",
    name: "Onixus",
    industry: "B2B SaaS",
    health: 84,
    index: { value: 88, delta: 6 },
    scan: { status: "operating", baselineIndex: 61, targetIndex: 92 },
    domains: {
      web: D("operating", 64, 90),
      sales: D("operating", 58, 86),
      crm: D("operating", 55, 88),
      operations: D("assembling", 60, 74),
      delivery: D("operating", 62, 91),
      analytics: D("operating", 57, 89),
      ai: D("assembling", 40, 71),
    },
    signals: { detected: 3, validated: 4, prioritized: 5, archived: 12 },
    insights: { generated: 4, endorsed: 9, dismissed: 3 },
    recommendations: { proposed: 3, adjusted: 2, accepted: 11, rejected: 2 },
    recommendationsStale: 1,
    approvals: { pending: 2, approved: 14, rejected: 1 },
    moves: { planned: 2, approved: 3, executing: 4, completed: 9, measured: 6 },
    executions: { running: 4, completed: 15, failed: 0 },
    measurements: 22,
    learnings: 8,
    knowledge: 34,
    risks: { total: 4, criticalOpen: 0 },
    findings: [
      { domainKey: "ai", finding: "No unified customer data model feeding the AI layer", baseline: "Fragmented", priority: "high" },
      { domainKey: "operations", finding: "Manual handoffs between onboarding and success", baseline: "6 steps", priority: "medium" },
    ],
    activity: [
      { entity: "move", entityId: "mv_onx_18", from: "executing", to: "completed", actor: "Amara Chen", minutesAgo: 24 },
      { entity: "recommendation", entityId: "rc_onx_42", from: "proposed", to: "accepted", actor: "Devon Reyes", minutesAgo: 96 },
      { entity: "signal", entityId: "sg_onx_77", from: "validated", to: "prioritized", actor: "Amara Chen", minutesAgo: 210 },
    ],
  },
  {
    id: "demo_verdant",
    name: "Verdant Fields Co.",
    industry: "Retail & Garden",
    health: 72,
    index: { value: 76, delta: 9 },
    scan: { status: "activating", baselineIndex: 48, targetIndex: 90 },
    domains: {
      web: D("operating", 52, 84),
      sales: D("operating", 50, 79),
      crm: D("assembling", 44, 68),
      operations: D("assembling", 47, 66),
      delivery: D("operating", 55, 81),
      analytics: D("assembling", 41, 63),
      ai: D("not_operating", 30, null),
    },
    signals: { detected: 5, validated: 3, prioritized: 4, archived: 6 },
    insights: { generated: 6, endorsed: 5, dismissed: 1 },
    recommendations: { proposed: 4, adjusted: 3, accepted: 6, rejected: 1 },
    recommendationsStale: 2,
    approvals: { pending: 3, approved: 8, rejected: 0 },
    moves: { planned: 3, approved: 2, executing: 3, completed: 5, measured: 3 },
    executions: { running: 3, completed: 8, failed: 1 },
    measurements: 12,
    learnings: 5,
    knowledge: 19,
    risks: { total: 5, criticalOpen: 1 },
    findings: [
      { domainKey: "ai", finding: "No AI-assisted demand forecasting for seasonal stock", baseline: "None", priority: "high" },
      { domainKey: "analytics", finding: "Sales reporting is spreadsheet-based, updated weekly", baseline: "Weekly", priority: "medium" },
      { domainKey: "crm", finding: "Repeat customers not segmented for retention offers", baseline: "Flat list", priority: "medium" },
    ],
    activity: [
      { entity: "approval", entityId: "ap_vfc_09", from: "pending", to: "approved", actor: "Priya Nair", minutesAgo: 52 },
      { entity: "insight", entityId: "in_vfc_31", from: "generated", to: "endorsed", actor: "Marcus Hale", minutesAgo: 140 },
      { entity: "signal", entityId: "sg_vfc_88", from: "detected", to: "validated", actor: "Priya Nair", minutesAgo: 320 },
    ],
  },
  {
    id: "demo_acme",
    name: "Acme Construction",
    industry: "Construction",
    health: 66,
    index: { value: 69, delta: 4 },
    scan: { status: "activating", baselineIndex: 44, targetIndex: 88 },
    domains: {
      web: D("operating", 48, 77),
      sales: D("assembling", 45, 64),
      crm: D("assembling", 42, 61),
      operations: D("operating", 50, 80),
      delivery: D("operating", 53, 82),
      analytics: D("not_operating", 33, null),
      ai: D("not_operating", 28, null),
    },
    signals: { detected: 6, validated: 4, prioritized: 3, archived: 5 },
    insights: { generated: 5, endorsed: 4, dismissed: 2 },
    recommendations: { proposed: 5, adjusted: 2, accepted: 4, rejected: 1 },
    recommendationsStale: 3,
    approvals: { pending: 4, approved: 6, rejected: 1 },
    moves: { planned: 4, approved: 2, executing: 2, completed: 3, measured: 2 },
    executions: { running: 2, completed: 5, failed: 1 },
    measurements: 9,
    learnings: 3,
    knowledge: 14,
    risks: { total: 6, criticalOpen: 2 },
    findings: [
      { domainKey: "analytics", finding: "Project margins reconciled only at close-out", baseline: "Post-hoc", priority: "high" },
      { domainKey: "sales", finding: "Bid follow-up is ad hoc; no pipeline stages", baseline: "None", priority: "high" },
    ],
    activity: [
      { entity: "signal", entityId: "sg_acm_51", from: "detected", to: "validated", actor: "Tobias Grant", minutesAgo: 75 },
      { entity: "move", entityId: "mv_acm_12", from: "approved", to: "executing", actor: "Lena Fisher", minutesAgo: 260 },
    ],
  },
  {
    id: "demo_kingston",
    name: "Kingston Logistics",
    industry: "Logistics",
    health: 78,
    index: { value: 81, delta: 7 },
    scan: { status: "operating", baselineIndex: 55, targetIndex: 90 },
    domains: {
      web: D("operating", 58, 83),
      sales: D("operating", 54, 80),
      crm: D("operating", 56, 82),
      operations: D("operating", 60, 88),
      delivery: D("operating", 63, 90),
      analytics: D("assembling", 48, 70),
      ai: D("assembling", 38, 66),
    },
    signals: { detected: 4, validated: 5, prioritized: 3, archived: 9 },
    insights: { generated: 3, endorsed: 8, dismissed: 2 },
    recommendations: { proposed: 2, adjusted: 2, accepted: 9, rejected: 1 },
    recommendationsStale: 0,
    approvals: { pending: 1, approved: 12, rejected: 1 },
    moves: { planned: 1, approved: 2, executing: 3, completed: 7, measured: 5 },
    executions: { running: 3, completed: 12, failed: 0 },
    measurements: 18,
    learnings: 6,
    knowledge: 27,
    risks: { total: 3, criticalOpen: 0 },
    findings: [
      { domainKey: "ai", finding: "Route optimization not yet model-assisted", baseline: "Rules-based", priority: "medium" },
      { domainKey: "analytics", finding: "On-time delivery tracked, but not by lane", baseline: "Aggregate", priority: "low" },
    ],
    activity: [
      { entity: "measurement", entityId: "ms_kng_20", from: null, to: "captured", actor: "Sofia Marin", minutesAgo: 40 },
      { entity: "move", entityId: "mv_kng_31", from: "completed", to: "measured", actor: "Sofia Marin", minutesAgo: 180 },
    ],
  },
  {
    id: "demo_greenhorizon",
    name: "Green Horizon",
    industry: "Renewable Energy",
    health: 59,
    index: { value: 62, delta: 11 },
    scan: { status: "diagnosed", baselineIndex: 39, targetIndex: 90 },
    domains: {
      web: D("assembling", 42, 65),
      sales: D("assembling", 40, 61),
      crm: D("not_operating", 34, null),
      operations: D("assembling", 44, 63),
      delivery: D("assembling", 46, 64),
      analytics: D("not_operating", 31, null),
      ai: D("not_operating", 26, null),
    },
    signals: { detected: 7, validated: 3, prioritized: 2, archived: 3 },
    insights: { generated: 7, endorsed: 3, dismissed: 1 },
    recommendations: { proposed: 6, adjusted: 1, accepted: 2, rejected: 0 },
    recommendationsStale: 2,
    approvals: { pending: 5, approved: 3, rejected: 0 },
    moves: { planned: 5, approved: 1, executing: 1, completed: 1, measured: 0 },
    executions: { running: 1, completed: 2, failed: 0 },
    measurements: 4,
    learnings: 1,
    knowledge: 8,
    risks: { total: 4, criticalOpen: 1 },
    findings: [
      { domainKey: "crm", finding: "Leads captured in email, no system of record", baseline: "Email", priority: "high" },
      { domainKey: "web", finding: "Site has no instrumentation or conversion tracking", baseline: "None", priority: "high" },
      { domainKey: "ai", finding: "Proposal drafting is fully manual", baseline: "Manual", priority: "medium" },
    ],
    activity: [
      { entity: "insight", entityId: "in_grz_14", from: "generated", to: "endorsed", actor: "Marcus Hale", minutesAgo: 88 },
      { entity: "signal", entityId: "sg_grz_63", from: "detected", to: "validated", actor: "Amara Chen", minutesAgo: 300 },
    ],
  },
] as const;

/** A stable seeded created-at (kept constant so demo rows don't churn). */
const DEMO_EPOCH = "2026-06-01T09:00:00.000Z";

/* ---- pure derivations ----------------------------------------------------- */

function mergeCounts(pick: (o: DemoOrg) => Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const org of DEMO_ORGS) {
    for (const [k, v] of Object.entries(pick(org))) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** All demo domains as `Domain[]` (portfolio System Map input). */
export function demoAllDomains(): Domain[] {
  const rows: Domain[] = [];
  for (const org of DEMO_ORGS) {
    for (const key of DOMAIN_KEYS) {
      const p = org.domains[key];
      rows.push({
        id: `dm_${org.id}_${key}`,
        clientId: org.id,
        key,
        status: p.status,
        baselineScore: p.baseline,
        currentScore: p.current,
        createdAt: DEMO_EPOCH,
      });
    }
  }
  return rows;
}

/** One org's domains (per-org System Map input). Empty if the id is unknown. */
export function demoDomainsFor(clientId: string): Domain[] {
  return demoAllDomains().filter((d) => d.clientId === clientId);
}

export function demoOrg(clientId: string): DemoOrg | undefined {
  return DEMO_ORGS.find((o) => o.id === clientId);
}

/** The latest scan for an org (Business Scan demo). */
export function demoScanFor(clientId: string): BusinessScan | null {
  const org = demoOrg(clientId);
  if (!org) return null;
  return {
    id: `sc_${org.id}`,
    clientId: org.id,
    status: org.scan.status,
    baselineIndex: org.scan.baselineIndex,
    targetIndex: org.scan.targetIndex,
    createdBy: "demo_operator",
    createdAt: DEMO_EPOCH,
  };
}

/** A scan's findings (Business Scan ledger demo). */
export function demoFindingsForScan(scanId: string): ScanFinding[] {
  const org = DEMO_ORGS.find((o) => `sc_${o.id}` === scanId);
  if (!org) return [];
  return org.findings.map((f, i) => ({
    id: `fd_${org.id}_${i}`,
    scanId,
    clientId: org.id,
    domainKey: f.domainKey,
    finding: f.finding,
    baseline: f.baseline,
    priority: f.priority,
    createdAt: DEMO_EPOCH,
  }));
}

function buildActivity(orgs: readonly DemoOrg[], now: number): DashboardActivity[] {
  const items: DashboardActivity[] = [];
  for (const org of orgs) {
    for (const a of org.activity) {
      items.push({
        id: `${org.id}_${a.entityId}`,
        entity: a.entity,
        entityId: a.entityId,
        from: a.from,
        to: a.to,
        actor: a.actor,
        at: new Date(now - a.minutesAgo * 60_000).toISOString(),
      });
    }
  }
  return items.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

/** Aggregate portfolio snapshot across all demo orgs. `now` seeds the feed. */
export function demoPortfolioSnapshot(now: number): DashboardSnapshot {
  const healthAvg = Math.round(DEMO_ORGS.reduce((a, o) => a + o.health, 0) / DEMO_ORGS.length);
  const indexAvg = Math.round(DEMO_ORGS.reduce((a, o) => a + o.index.value, 0) / DEMO_ORGS.length);
  return {
    businessHealth: { score: healthAvg },
    transformationIndex: { value: indexAvg, delta: null },
    orgsTracked: DEMO_ORGS.length,
    signals: mergeCounts((o) => o.signals),
    insights: mergeCounts((o) => o.insights),
    recommendations: mergeCounts((o) => o.recommendations),
    recommendationsStale: DEMO_ORGS.reduce((a, o) => a + o.recommendationsStale, 0),
    approvals: mergeCounts((o) => o.approvals),
    moves: mergeCounts((o) => o.moves),
    executions: mergeCounts((o) => o.executions),
    measurements: DEMO_ORGS.reduce((a, o) => a + o.measurements, 0),
    learnings: DEMO_ORGS.reduce((a, o) => a + o.learnings, 0),
    risks: {
      total: DEMO_ORGS.reduce((a, o) => a + o.risks.total, 0),
      criticalOpen: DEMO_ORGS.reduce((a, o) => a + o.risks.criticalOpen, 0),
    },
    knowledge: DEMO_ORGS.reduce((a, o) => a + o.knowledge, 0),
    activity: buildActivity(DEMO_ORGS, now),
  };
}

/** One org's snapshot (client-scope Console / portal). Falls back to null-ish. */
export function demoOrgSnapshot(clientId: string, now: number): DashboardSnapshot {
  const org = demoOrg(clientId);
  if (!org) {
    return {
      businessHealth: null,
      transformationIndex: null,
      orgsTracked: null,
      signals: {},
      insights: {},
      recommendations: {},
      recommendationsStale: 0,
      approvals: {},
      moves: {},
      executions: {},
      measurements: 0,
      learnings: 0,
      risks: { total: 0, criticalOpen: 0 },
      knowledge: 0,
      activity: [],
    };
  }
  return {
    businessHealth: { score: org.health },
    transformationIndex: { value: org.index.value, delta: org.index.delta },
    orgsTracked: null,
    signals: org.signals,
    insights: org.insights,
    recommendations: org.recommendations,
    recommendationsStale: org.recommendationsStale,
    approvals: org.approvals,
    moves: org.moves,
    executions: org.executions,
    measurements: org.measurements,
    learnings: org.learnings,
    risks: org.risks,
    knowledge: org.knowledge,
    activity: buildActivity([org], now),
  };
}

/* ---- Analytics (acquisition funnel + KPIs + event stream) ----------------- */

export interface DemoAnalytics {
  readonly assessments: number;
  readonly proposalsAccepted: number;
  readonly contractsSigned: number;
  readonly activations: number;
  readonly leads: number;
  readonly projects: number;
  /** Server event name → count (the state-truth stream). */
  readonly byName: Readonly<Record<string, number>>;
}

/** Believable analytics for Demo Mode — a healthy funnel with real-looking drop-off. */
export function demoAnalytics(): DemoAnalytics {
  return {
    assessments: 128,
    proposalsAccepted: 61,
    contractsSigned: 34,
    activations: 27,
    leads: 214,
    projects: 41,
    byName: {
      "lead.captured": 214,
      "assessment.completed": 128,
      "proposal.sent": 88,
      "proposal.accepted": 61,
      "contract.signed": 34,
      "client.activated": 27,
      "project.milestone.reached": 96,
      "invoice.paid": 52,
      "deliverable.approved": 73,
      "automation.deployed": 19,
    },
  };
}

/* ---- Signals (the one complete transformation module — real list/detail) --- */

/** Demo team members (Auxion operators) — createdBy id → display name. */
export const DEMO_ACTORS: Readonly<Record<string, string>> = {
  u_amara: "Amara Chen",
  u_devon: "Devon Reyes",
  u_priya: "Priya Nair",
  u_marcus: "Marcus Hale",
  u_tobias: "Tobias Grant",
  u_sofia: "Sofia Marin",
  u_lena: "Lena Fisher",
};

interface DemoSignalSeed {
  readonly id: string;
  readonly clientId: string;
  readonly title: string;
  readonly detail: string;
  readonly status: SignalStatus;
  readonly sourceRef: string;
  readonly createdBy: string;
  readonly daysAgo: number;
  readonly evidence: readonly EvidenceItem[];
}

/**
 * Representative signals across the portfolio. Detail carries the executive
 * narrative (severity · confidence · impact · recommended action) WITHIN the
 * existing schema — Demo Mode never invents columns the model doesn't have.
 */
const DEMO_SIGNAL_SEEDS: readonly DemoSignalSeed[] = [
  {
    id: "sg_onx_101", clientId: "demo_onixus", title: "Expansion revenue accelerating in mid-market", status: "prioritized",
    sourceRef: "metric:mrr.expansion", createdBy: "u_amara", daysAgo: 2,
    detail:
      "Severity: opportunity · Confidence: high (0.86). Net expansion in the 50–200 seat band is up 22% QoQ, outpacing new logo growth. Impact: an estimated $180k of incremental ARR is addressable this quarter. Recommended action: stand up a dedicated expansion play for the segment before renewal season.",
    evidence: [
      { kind: "metric", ref: "mrr.expansion.midmarket", label: "Expansion MRR", detail: "+22% QoQ" },
      { kind: "observation", ref: "obs.qbr.notes", label: "QBR pattern", detail: "3 of 5 accounts asked about added seats" },
    ],
  },
  {
    id: "sg_onx_102", clientId: "demo_onixus", title: "Onboarding-to-activation handoff dropping tickets", status: "validated",
    sourceRef: "workflow:onboarding.handoff", createdBy: "u_devon", daysAgo: 6,
    detail:
      "Severity: medium · Confidence: medium (0.71). Manual handoff between onboarding and customer success is losing context on ~1 in 6 accounts. Impact: slower time-to-value and avoidable escalations. Recommended action: automate the handoff with a shared checklist tied to the CRM stage.",
    evidence: [{ kind: "observation", ref: "obs.handoff.audit", label: "Handoff audit", detail: "17% context loss" }],
  },
  {
    id: "sg_onx_103", clientId: "demo_onixus", title: "AI layer lacks a unified customer data model", status: "detected",
    sourceRef: "scan:ai.readiness", createdBy: "u_amara", daysAgo: 1,
    detail:
      "Severity: high · Confidence: high (0.82). Customer data is fragmented across three systems, blocking reliable AI-assisted insights. Impact: caps the ROI of the AI layer. Recommended action: consolidate to a single customer record before further AI investment.",
    evidence: [{ kind: "document", ref: "doc.scan.ai", label: "Scan finding", detail: "AI domain assembling (71/100)" }],
  },
  {
    id: "sg_vfc_201", clientId: "demo_verdant", title: "Seasonal demand spike detected for outdoor range", status: "prioritized",
    sourceRef: "metric:sales.category.outdoor", createdBy: "u_priya", daysAgo: 1,
    detail:
      "Severity: opportunity · Confidence: high (0.88). Outdoor category sell-through is 31% above the seasonal baseline. Impact: risk of stockout on top SKUs within 3 weeks. Recommended action: pull forward the next reorder and feature the range in this week's campaign.",
    evidence: [{ kind: "metric", ref: "sales.outdoor.sellthrough", label: "Sell-through", detail: "+31% vs baseline" }],
  },
  {
    id: "sg_vfc_202", clientId: "demo_verdant", title: "Repeat customers not segmented for retention", status: "validated",
    sourceRef: "crm:segmentation.gap", createdBy: "u_marcus", daysAgo: 4,
    detail:
      "Severity: medium · Confidence: medium (0.68). The customer list is flat — no repeat-buyer segment exists for targeted offers. Impact: leaving repeat-purchase revenue on the table. Recommended action: build a returning-customer segment and a simple win-back flow.",
    evidence: [{ kind: "observation", ref: "obs.crm.review", label: "CRM review", detail: "No segments configured" }],
  },
  {
    id: "sg_vfc_203", clientId: "demo_verdant", title: "Weekly sales reporting is spreadsheet-bound", status: "detected",
    sourceRef: "analytics:reporting.cadence", createdBy: "u_priya", daysAgo: 9,
    detail:
      "Severity: medium · Confidence: high (0.79). Reporting refreshes weekly by hand, so decisions lag the numbers. Impact: slow reaction to demand shifts. Recommended action: connect POS to an automated daily dashboard.",
    evidence: [{ kind: "observation", ref: "obs.reporting", label: "Cadence", detail: "Manual, weekly" }],
  },
  {
    id: "sg_acm_301", clientId: "demo_acme", title: "Bid follow-up is ad hoc — pipeline leaking", status: "prioritized",
    sourceRef: "sales:pipeline.stages", createdBy: "u_tobias", daysAgo: 3,
    detail:
      "Severity: high · Confidence: medium (0.74). Bids have no defined follow-up stages, so warm opportunities go cold. Impact: estimated 15–20% of winnable bids lost to silence. Recommended action: introduce a 3-touch follow-up sequence with owner accountability.",
    evidence: [{ kind: "observation", ref: "obs.bid.audit", label: "Bid audit", detail: "No follow-up on 40% of bids" }],
  },
  {
    id: "sg_acm_302", clientId: "demo_acme", title: "Project margins only reconciled at close-out", status: "validated",
    sourceRef: "analytics:margin.timing", createdBy: "u_lena", daysAgo: 7,
    detail:
      "Severity: high · Confidence: high (0.83). Margins are visible only after a job closes, too late to correct overruns. Impact: recurring margin erosion on long projects. Recommended action: track committed cost vs budget weekly.",
    evidence: [{ kind: "metric", ref: "margin.variance", label: "Margin variance", detail: "Discovered post-hoc" }],
  },
  {
    id: "sg_kng_401", clientId: "demo_kingston", title: "On-time delivery slipping on two lanes", status: "prioritized",
    sourceRef: "ops:otd.by_lane", createdBy: "u_sofia", daysAgo: 2,
    detail:
      "Severity: high · Confidence: high (0.85). OTD on the two busiest lanes fell to 91% this month. Impact: SLA credits and churn risk on anchor accounts. Recommended action: rebalance capacity and add a lane-level OTD alert.",
    evidence: [{ kind: "metric", ref: "otd.lane.a", label: "OTD lane A", detail: "91% (target 96%)" }],
  },
  {
    id: "sg_kng_402", clientId: "demo_kingston", title: "Route optimization still rules-based", status: "detected",
    sourceRef: "scan:ai.routing", createdBy: "u_sofia", daysAgo: 11,
    detail:
      "Severity: medium · Confidence: medium (0.66). Routing uses static rules; model-assisted optimization is untapped. Impact: excess miles and fuel cost. Recommended action: pilot model-assisted routing on one region.",
    evidence: [{ kind: "document", ref: "doc.scan.routing", label: "Scan finding", detail: "AI routing not started" }],
  },
  {
    id: "sg_grz_501", clientId: "demo_greenhorizon", title: "Leads captured in email with no system of record", status: "prioritized",
    sourceRef: "crm:system.gap", createdBy: "u_marcus", daysAgo: 1,
    detail:
      "Severity: critical · Confidence: high (0.9). Inbound leads live in an inbox — no CRM, no ownership, no follow-up. Impact: direct revenue loss from dropped leads. Recommended action: stand up a lightweight CRM and route new leads automatically.",
    evidence: [{ kind: "observation", ref: "obs.lead.flow", label: "Lead flow", detail: "Email-only, untracked" }],
  },
  {
    id: "sg_grz_502", clientId: "demo_greenhorizon", title: "Website has no conversion instrumentation", status: "validated",
    sourceRef: "web:analytics.gap", createdBy: "u_amara", daysAgo: 5,
    detail:
      "Severity: high · Confidence: high (0.81). The site has no analytics or conversion tracking, so marketing spend is unmeasured. Impact: no basis to optimize acquisition. Recommended action: instrument the funnel and define primary conversions.",
    evidence: [{ kind: "observation", ref: "obs.web.audit", label: "Site audit", detail: "No tracking present" }],
  },
  {
    id: "sg_grz_503", clientId: "demo_greenhorizon", title: "Proposal drafting is fully manual", status: "detected",
    sourceRef: "scan:ai.proposals", createdBy: "u_marcus", daysAgo: 14,
    detail:
      "Severity: medium · Confidence: medium (0.7). Every proposal is written from scratch, slowing sales response. Impact: longer sales cycles. Recommended action: template proposals and add AI-assisted drafting.",
    evidence: [{ kind: "document", ref: "doc.scan.proposals", label: "Scan finding", detail: "Manual drafting" }],
  },
  {
    id: "sg_onx_104", clientId: "demo_onixus", title: "Legacy churn signal resolved", status: "archived",
    sourceRef: "metric:churn.q1", createdBy: "u_devon", daysAgo: 40,
    detail:
      "Severity: resolved · Confidence: high. A Q1 churn-risk signal in the SMB tier was addressed via a proactive success campaign; retention recovered. Kept for the audit trail.",
    evidence: [{ kind: "metric", ref: "churn.smb", label: "SMB churn", detail: "Recovered to baseline" }],
  },
];

function signalRow(seed: DemoSignalSeed, now: number): Signal {
  return {
    id: seed.id,
    clientId: seed.clientId,
    title: seed.title,
    detail: seed.detail,
    status: seed.status,
    sourceRef: seed.sourceRef,
    evidence: [...seed.evidence],
    createdBy: seed.createdBy,
    createdAt: new Date(now - seed.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
  };
}

function demoOrgNames(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of DEMO_ORGS) out[o.id] = o.name;
  return out;
}

/** Organizations for the Signals org filter. */
export function demoOrgOptions(): { id: string; name: string }[] {
  return DEMO_ORGS.map((o) => ({ id: o.id, name: o.name }));
}

/** All demo signals (optionally one org), newest-first, with createdAt seeded from `now`. */
export function demoSignalRows(now: number, clientId?: string | null): Signal[] {
  return DEMO_SIGNAL_SEEDS.filter((s) => !clientId || s.clientId === clientId)
    .map((s) => signalRow(s, now))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Paginated/filtered/sorted list data for the Signals module. */
export function demoSignalList(query: SignalListQuery, now: number): SignalListData {
  let rows = demoSignalRows(now, query.clientId);

  if (query.status === "open") rows = rows.filter((s) => s.status !== "archived");
  else if (query.status !== "all") rows = rows.filter((s) => s.status === query.status);

  const term = query.search.trim().toLowerCase();
  if (term) {
    const names = demoOrgNames();
    rows = rows.filter(
      (s) =>
        s.title.toLowerCase().includes(term) ||
        (s.detail ?? "").toLowerCase().includes(term) ||
        (s.sourceRef ?? "").toLowerCase().includes(term) ||
        (names[s.clientId] ?? "").toLowerCase().includes(term),
    );
  }

  if (query.sort === "oldest") rows.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  else if (query.sort === "title") rows.sort((a, b) => a.title.localeCompare(b.title));
  // "newest" is already applied by demoSignalRows.

  const total = rows.length;
  const offset = (query.page - 1) * SIGNAL_PAGE_SIZE;
  const paged = rows.slice(offset, offset + SIGNAL_PAGE_SIZE);

  return { signals: paged, total, orgNames: demoOrgNames(), actorNames: DEMO_ACTORS };
}

/** Workspace summary counts for the Signals module. */
export function demoSignalSummary(now: number, clientId: string | null): SignalSummary {
  const rows = demoSignalRows(now, clientId);
  const cutoff = now - SIGNAL_RECENT_DAYS * 24 * 60 * 60 * 1000;
  return {
    open: rows.filter((s) => s.status !== "archived").length,
    prioritized: rows.filter((s) => s.status === "prioritized").length,
    archived: rows.filter((s) => s.status === "archived").length,
    recent: rows.filter((s) => Date.parse(s.createdAt) >= cutoff).length,
  };
}

/** A believable transition history for a signal, derived from its current status. */
export function demoSignalTransitions(id: string, now: number): SignalTransition[] {
  const seed = DEMO_SIGNAL_SEEDS.find((s) => s.id === id);
  if (!seed) return [];
  const order: SignalStatus[] = ["detected", "validated", "prioritized", "archived"];
  const target = order.indexOf(seed.status);
  const actor = DEMO_ACTORS[seed.createdBy] ?? null;
  const out: SignalTransition[] = [];
  // A signal is CREATED as "detected"; only state changes are transitions, so the
  // history runs from the first real move (detected→validated) — never from null,
  // matching the live transition_log. A just-detected signal has no transitions.
  for (let i = 1; i <= target; i++) {
    const daysAgo = seed.daysAgo + (target - i);
    out.push({
      from: order[i - 1]!,
      to: order[i]!,
      actorName: actor,
      at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      reason: null,
    });
  }
  return out.reverse(); // newest-first, matching the live adapter
}

/** Full detail payload for the Signals detail page. Null for an unknown id. */
export function demoSignalDetail(id: string, now: number): SignalDetailData | null {
  const seed = DEMO_SIGNAL_SEEDS.find((s) => s.id === id);
  if (!seed) return null;
  const signal = signalRow(seed, now);
  return {
    signal,
    orgName: demoOrgNames()[signal.clientId] ?? "Unknown org",
    createdByName: DEMO_ACTORS[seed.createdBy] ?? null,
    transitions: demoSignalTransitions(id, now),
  };
}
