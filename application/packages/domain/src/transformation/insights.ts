/* =============================================================================
 * Insights read model + workspace logic (Sprint 6) — pure, UI- and DB-free.
 *
 * The Insights module is the interpretation surface of the transformation cycle:
 * an Insight interprets a Signal (Signal → Insight). Writes flow through
 * TransformationService (createInsight / transitionInsight) so capability,
 * lifecycle guards, transition audit and events are all enforced in one place.
 * This file owns the READ side: URL-driven query parsing, list/detail view
 * shaping, confidence presentation, and which lifecycle actions are legal.
 *
 * Canonical vocabulary only (Product Bible Ch 09): an Insight is Generated →
 * Endorsed / Dismissed (both terminal). Confidence is a calibrated 0..1 value
 * (nullable — a human-authored insight may leave it unrated); it is NOT AI here.
 * Sprint 6 explicitly excludes AI generation/scoring — confidence is a manual,
 * optional field the operator sets. No assignee or update timestamp exists.
 * ========================================================================== */

import { nextStates, toneFor, type Insight } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { assertCapability } from "../capabilities.js";

// NOTE: the schema widens machine enums to `string` (statusEnum), so `InsightStatus`
// is `string` at the type level. The canonical values live in INSIGHT_STATUSES and
// the label maps below; lookups go through the safe accessors so an unexpected
// value degrades to the raw string rather than `undefined`.
export type InsightStatus = Insight["status"];

/** Canonical statuses, in lifecycle order. */
export const INSIGHT_STATUSES: readonly InsightStatus[] = ["generated", "endorsed", "dismissed"];

const STATUS_LABELS = {
  generated: "Generated",
  endorsed: "Endorsed",
  dismissed: "Dismissed",
} as const;
/** Canonical status → display label map (kept for callers that iterate it). */
export const INSIGHT_STATUS_LABEL: Record<string, string> = STATUS_LABELS;
/** Safe status label accessor. */
export function insightStatusLabel(status: string): string {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

/* ---- authorization -------------------------------------------------------- */

export const INSIGHT_READ_CAP = "transformation.read";
export const INSIGHT_WRITE_CAP = "transformation.insights.write";

/** Assert the actor may read insights. Insights are internal-only (RLS enforces it). */
export function assertInsightsRead(actor: Actor): void {
  assertCapability(actor, INSIGHT_READ_CAP);
}

/** Non-throwing check: may the actor create/transition insights? Drives UI affordances. */
export function canWriteInsights(actor: Actor): boolean {
  // Mirror hasCapability wildcard behaviour without importing it: owner/admin hold
  // transformation.*/*, team_member holds the exact write cap.
  return actor.role === "owner" || actor.role === "admin" || actor.role === "team_member";
}

/* ---- confidence presentation ---------------------------------------------- */

export type ConfidenceBand = "unrated" | "low" | "medium" | "high";

const BAND_LABELS: Record<ConfidenceBand, string> = {
  unrated: "Unrated",
  low: "Low",
  medium: "Medium",
  high: "High",
};

/** Bucket a 0..1 confidence into a qualitative band. null → "unrated". */
export function confidenceBand(confidence: number | null): ConfidenceBand {
  if (confidence === null || Number.isNaN(confidence)) return "unrated";
  if (confidence >= 0.66) return "high";
  if (confidence >= 0.33) return "medium";
  return "low";
}

export function confidenceBandLabel(band: ConfidenceBand): string {
  return BAND_LABELS[band];
}

/** 0..1 → 0..100 integer percent, or null when unrated. */
export function confidencePercent(confidence: number | null): number | null {
  if (confidence === null || Number.isNaN(confidence)) return null;
  const clamped = Math.max(0, Math.min(1, confidence));
  return Math.round(clamped * 100);
}

/* ---- list query (URL-driven, fail-safe) ----------------------------------- */

export type InsightStatusFilter = "all" | "open" | InsightStatus;
// Sorts map to real columns. "confidence" ranks the most-confident insights first
// (unrated sort last). No "summary" sort — insights are triaged, not alphabetized.
export type InsightSort = "newest" | "oldest" | "confidence";

export const INSIGHT_STATUS_FILTERS: readonly InsightStatusFilter[] = [
  "open",
  "all",
  "generated",
  "endorsed",
  "dismissed",
];
export const INSIGHT_SORTS: readonly InsightSort[] = ["newest", "oldest", "confidence"];

const STATUS_FILTER_LABELS = {
  all: "All statuses",
  open: "Open",
  generated: "Generated",
  endorsed: "Endorsed",
  dismissed: "Dismissed",
} as const;
export const INSIGHT_STATUS_FILTER_LABEL: Record<string, string> = STATUS_FILTER_LABELS;
export function insightStatusFilterLabel(filter: string): string {
  return STATUS_FILTER_LABELS[filter as keyof typeof STATUS_FILTER_LABELS] ?? filter;
}

const SORT_LABELS = {
  newest: "Newest first",
  oldest: "Oldest first",
  confidence: "Highest confidence",
} as const;
export const INSIGHT_SORT_LABEL: Record<string, string> = SORT_LABELS;
export function insightSortLabel(sort: string): string {
  return SORT_LABELS[sort as keyof typeof SORT_LABELS] ?? sort;
}

export const INSIGHT_PAGE_SIZE = 20;
export const INSIGHT_SEARCH_MAX = 100;

export interface InsightListQuery {
  status: InsightStatusFilter;
  search: string; // "" when absent
  sort: InsightSort;
  page: number; // >= 1
  /** Organization filter (internal users read across orgs). null = all orgs. */
  clientId: string | null;
}

type RawParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Parse URL search params into a validated query. Every field fails safe — an
 * unknown/crafted value never throws and never widens tenant scope; it falls back
 * to a benign default.
 */
export function parseInsightListQuery(raw: RawParams): InsightListQuery {
  const statusRaw = first(raw["status"]);
  const status: InsightStatusFilter = (INSIGHT_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as InsightStatusFilter)
    : "open";

  const sortRaw = first(raw["sort"]);
  const sort: InsightSort = (INSIGHT_SORTS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as InsightSort)
    : "newest";

  const search = (first(raw["q"]) ?? "").trim().slice(0, INSIGHT_SEARCH_MAX);

  const pageNum = Number.parseInt(first(raw["page"]) ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;

  const clientRaw = first(raw["client"]);
  const clientId = clientRaw && clientRaw.length > 0 && clientRaw.length <= 64 ? clientRaw : null;

  return { status, search, sort, page, clientId };
}

/** Serialize a query to a canonical string, omitting defaults, for shareable URLs. */
export function buildInsightQuery(q: InsightListQuery): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => parts.push(`${k}=${encodeURIComponent(v)}`);
  if (q.status !== "open") add("status", q.status);
  if (q.sort !== "newest") add("sort", q.sort);
  if (q.search) add("q", q.search);
  if (q.clientId) add("client", q.clientId);
  if (q.page > 1) add("page", String(q.page));
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function insightsHref(q: InsightListQuery): string {
  return `/admin/insights${buildInsightQuery(q)}`;
}

export interface InsightActiveFilter {
  key: string;
  label: string;
  /** Query with this constraint removed — powers a "clear this" chip. */
  clearedQuery: InsightListQuery;
}

/** The filters currently narrowing the list (for the "active constraints" bar). */
export function activeInsightFilters(q: InsightListQuery, orgName?: string): InsightActiveFilter[] {
  const out: InsightActiveFilter[] = [];
  if (q.status !== "open") {
    out.push({
      key: "status",
      label: `Status: ${insightStatusFilterLabel(q.status)}`,
      clearedQuery: { ...q, status: "open", page: 1 },
    });
  }
  if (q.search) {
    out.push({ key: "q", label: `Search: "${q.search}"`, clearedQuery: { ...q, search: "", page: 1 } });
  }
  if (q.clientId) {
    out.push({
      key: "client",
      label: `Org: ${orgName ?? q.clientId}`,
      clearedQuery: { ...q, clientId: null, page: 1 },
    });
  }
  return out;
}

export function hasActiveInsightConstraints(q: InsightListQuery): boolean {
  return q.status !== "open" || q.search.length > 0 || q.clientId !== null;
}

/** The default (no-constraints) query. */
export function defaultInsightQuery(): InsightListQuery {
  return { status: "open", search: "", sort: "newest", page: 1, clientId: null };
}

/* ---- lifecycle actions ---------------------------------------------------- */

export interface InsightAction {
  to: InsightStatus;
  label: string;
  intent: "primary" | "neutral" | "danger";
  /** Terminal/irreversible transitions require an explicit confirmation. */
  confirm: boolean;
}

const ACTION_META = {
  endorsed: { label: "Endorse", intent: "primary", confirm: false },
  dismissed: { label: "Dismiss", intent: "danger", confirm: true },
} as const satisfies Record<string, Omit<InsightAction, "to">>;

/**
 * The lifecycle actions currently legal for an insight — derived from the
 * canonical state machine, gated by write capability. Returns [] for a terminal
 * insight (endorsed/dismissed) or a read-only actor. Never returns an illegal
 * transition. Both Endorse and Dismiss are terminal, so an insight offers actions
 * only while Generated.
 */
export function availableInsightActions(status: InsightStatus, canWrite: boolean): InsightAction[] {
  if (!canWrite) return [];
  const out: InsightAction[] = [];
  for (const to of nextStates("insight", status)) {
    const meta = ACTION_META[to as keyof typeof ACTION_META];
    if (meta) out.push({ to, label: meta.label, intent: meta.intent, confirm: meta.confirm });
  }
  return out;
}

/* ---- list view ------------------------------------------------------------ */

/** Raw list data the data adapter hands the builder (already tenant-scoped by RLS). */
export interface InsightListData {
  insights: readonly Insight[];
  total: number;
  orgNames: Readonly<Record<string, string>>; // clientId → company
  actorNames: Readonly<Record<string, string>>; // userId → name
  signalTitles: Readonly<Record<string, string>>; // signalId → signal title
}

export interface InsightListRow {
  id: string;
  summary: string;
  status: InsightStatus;
  statusLabel: string;
  tone: string;
  orgName: string;
  signalId: string;
  signalTitle: string;
  signalHref: string;
  confidence: number | null;
  confidencePercent: number | null;
  confidenceBand: ConfidenceBand;
  confidenceBandLabel: string;
  createdByName: string | null;
  createdAt: string;
  href: string;
}

export interface InsightListView {
  rows: InsightListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  query: InsightListQuery;
  activeFilters: InsightActiveFilter[];
  hasConstraints: boolean;
}

export function buildInsightListView(data: InsightListData, query: InsightListQuery): InsightListView {
  const rows: InsightListRow[] = data.insights.map((i) => {
    const band = confidenceBand(i.confidence);
    return {
      id: i.id,
      summary: i.summary,
      status: i.status,
      statusLabel: insightStatusLabel(i.status),
      tone: toneFor(i.status),
      orgName: data.orgNames[i.clientId] ?? "Unknown org",
      signalId: i.signalId,
      signalTitle: data.signalTitles[i.signalId] ?? "Unknown signal",
      signalHref: `/admin/signals/${i.signalId}`,
      confidence: i.confidence,
      confidencePercent: confidencePercent(i.confidence),
      confidenceBand: band,
      confidenceBandLabel: confidenceBandLabel(band),
      createdByName: i.createdBy ? (data.actorNames[i.createdBy] ?? null) : null,
      createdAt: i.createdAt,
      href: `/admin/insights/${i.id}`,
    };
  });

  return {
    rows,
    total: data.total,
    page: query.page,
    pageSize: INSIGHT_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(data.total / INSIGHT_PAGE_SIZE)),
    query,
    activeFilters: activeInsightFilters(query),
    hasConstraints: hasActiveInsightConstraints(query),
  };
}

/* ---- summary metrics ------------------------------------------------------ */

/** Canonical workspace summary. `open` = not dismissed; `endorsed` = accepted. */
export interface InsightSummary {
  open: number;
  endorsed: number;
  dismissed: number;
  recent: number; // created in the last 7 days
}

export const INSIGHT_RECENT_DAYS = 7;

/* ---- detail view ---------------------------------------------------------- */

export interface InsightTransition {
  from: string;
  to: string;
  actorName: string | null;
  at: string;
  reason: string | null;
}

export interface InsightDetailData {
  insight: Insight;
  orgName: string;
  createdByName: string | null;
  /** The Signal this insight interprets — the evidence link (Signal → Insight). */
  signalTitle: string;
  signalStatus: string;
  transitions: readonly InsightTransition[];
}

export interface InsightTimelineEntry {
  kind: "created" | "transition";
  from: string | null;
  to: string;
  toLabel: string;
  actorName: string | null;
  at: string;
  reason: string | null;
}

export interface InsightDetailView {
  insight: Insight;
  orgName: string;
  createdByName: string | null;
  statusLabel: string;
  tone: string;
  isTerminal: boolean;
  actions: InsightAction[];
  /** The parent Signal, presented as the originating evidence. */
  signalId: string;
  signalTitle: string;
  signalStatus: string;
  signalHref: string;
  confidence: number | null;
  confidencePercent: number | null;
  confidenceBand: ConfidenceBand;
  confidenceBandLabel: string;
  /** Reverse-chronological (newest first). Includes the canonical creation event. */
  timeline: InsightTimelineEntry[];
}

export function buildInsightDetailView(data: InsightDetailData, canWrite: boolean): InsightDetailView {
  const created: InsightTimelineEntry = {
    kind: "created",
    from: null,
    to: "generated",
    toLabel: insightStatusLabel("generated"),
    actorName: data.createdByName,
    at: data.insight.createdAt,
    reason: null,
  };
  const transitions: InsightTimelineEntry[] = data.transitions.map((t) => ({
    kind: "transition",
    from: t.from,
    to: t.to,
    toLabel: insightStatusLabel(t.to),
    actorName: t.actorName,
    at: t.at,
    reason: t.reason,
  }));

  const timeline = [...transitions, created].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const band = confidenceBand(data.insight.confidence);

  return {
    insight: data.insight,
    orgName: data.orgName,
    createdByName: data.createdByName,
    statusLabel: insightStatusLabel(data.insight.status),
    tone: toneFor(data.insight.status),
    isTerminal: data.insight.status === "endorsed" || data.insight.status === "dismissed",
    actions: availableInsightActions(data.insight.status, canWrite),
    signalId: data.insight.signalId,
    signalTitle: data.signalTitle,
    signalStatus: data.signalStatus,
    signalHref: `/admin/signals/${data.insight.signalId}`,
    confidence: data.insight.confidence,
    confidencePercent: confidencePercent(data.insight.confidence),
    confidenceBand: band,
    confidenceBandLabel: confidenceBandLabel(band),
    timeline,
  };
}
