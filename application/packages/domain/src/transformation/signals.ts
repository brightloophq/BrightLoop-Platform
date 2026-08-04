/* =============================================================================
 * Signals read model + workspace logic (Sprint 5) — pure, UI- and DB-free.
 *
 * The Signals module is the intake + triage surface of the transformation cycle.
 * Writes flow through TransformationService (createSignal / transitionSignal) so
 * capability, lifecycle guards, transition audit and events are all enforced in
 * one place. This file owns the READ side: URL-driven query parsing, list/detail
 * view shaping, and which lifecycle actions are currently legal.
 *
 * Canonical vocabulary only (Product Bible Ch 09): a Signal is Detected →
 * Validated → Prioritized → Archived. "Priority" is the Prioritized state, not a
 * separate field; ownership is by role; there is no assignee or update timestamp.
 * ========================================================================== */

import { nextStates, toneFor, type Signal } from "@brightloop/schema";
import type { Actor } from "../capabilities.js";
import { assertCapability } from "../capabilities.js";

// NOTE: the schema widens machine enums to `string` (statusEnum), so `SignalStatus`
// is `string` at the type level. The canonical values live in SIGNAL_STATUSES and
// the label maps below; lookups go through the safe accessors so an unexpected
// value degrades to the raw string rather than `undefined`.
export type SignalStatus = Signal["status"];

/** Canonical statuses, in lifecycle order. */
export const SIGNAL_STATUSES: readonly SignalStatus[] = ["detected", "validated", "prioritized", "archived"];

const STATUS_LABELS = {
  detected: "Detected",
  validated: "Validated",
  prioritized: "Prioritized",
  archived: "Archived",
} as const;
/** Canonical status → display label map (kept for callers that iterate it). */
export const SIGNAL_STATUS_LABEL: Record<string, string> = STATUS_LABELS;
/** Safe status label accessor. */
export function signalStatusLabel(status: string): string {
  return STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
}

/* ---- authorization -------------------------------------------------------- */

export const SIGNAL_READ_CAP = "transformation.read";
export const SIGNAL_WRITE_CAP = "transformation.signals.write";

/** Assert the actor may read signals. Signals are internal-only (RLS enforces it). */
export function assertSignalsRead(actor: Actor): void {
  assertCapability(actor, SIGNAL_READ_CAP);
}

/** Non-throwing check: may the actor create/transition signals? Drives UI affordances. */
export function canWriteSignals(actor: Actor): boolean {
  // Mirror hasCapability wildcard behaviour without importing it: owner/admin hold
  // transformation.*/*, team_member holds the exact write cap.
  return actor.role === "owner" || actor.role === "admin" || actor.role === "team_member";
}

/* ---- list query (URL-driven, fail-safe) ----------------------------------- */

export type SignalStatusFilter = "all" | "open" | SignalStatus;
// Sorts map to real, indexed columns. "Priority" is not a sort — it is the
// Prioritized status (use the status filter); the schema has no priority column.
export type SignalSort = "newest" | "oldest" | "title";

export const SIGNAL_STATUS_FILTERS: readonly SignalStatusFilter[] = [
  "open",
  "all",
  "detected",
  "validated",
  "prioritized",
  "archived",
];
export const SIGNAL_SORTS: readonly SignalSort[] = ["newest", "oldest", "title"];

const STATUS_FILTER_LABELS = {
  all: "All statuses",
  open: "Open",
  detected: "Detected",
  validated: "Validated",
  prioritized: "Prioritized",
  archived: "Archived",
} as const;
export const SIGNAL_STATUS_FILTER_LABEL: Record<string, string> = STATUS_FILTER_LABELS;
export function signalStatusFilterLabel(filter: string): string {
  return STATUS_FILTER_LABELS[filter as keyof typeof STATUS_FILTER_LABELS] ?? filter;
}

const SORT_LABELS = {
  newest: "Newest first",
  oldest: "Oldest first",
  title: "Title A–Z",
} as const;
export const SIGNAL_SORT_LABEL: Record<string, string> = SORT_LABELS;
export function signalSortLabel(sort: string): string {
  return SORT_LABELS[sort as keyof typeof SORT_LABELS] ?? sort;
}

export const SIGNAL_PAGE_SIZE = 20;
export const SIGNAL_SEARCH_MAX = 100;

export interface SignalListQuery {
  status: SignalStatusFilter;
  search: string; // "" when absent
  sort: SignalSort;
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
export function parseSignalListQuery(raw: RawParams): SignalListQuery {
  const statusRaw = first(raw["status"]);
  const status: SignalStatusFilter = (SIGNAL_STATUS_FILTERS as readonly string[]).includes(statusRaw ?? "")
    ? (statusRaw as SignalStatusFilter)
    : "open";

  const sortRaw = first(raw["sort"]);
  const sort: SignalSort = (SIGNAL_SORTS as readonly string[]).includes(sortRaw ?? "")
    ? (sortRaw as SignalSort)
    : "newest";

  const search = (first(raw["q"]) ?? "").trim().slice(0, SIGNAL_SEARCH_MAX);

  const pageNum = Number.parseInt(first(raw["page"]) ?? "", 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;

  const clientRaw = first(raw["client"]);
  const clientId = clientRaw && clientRaw.length > 0 && clientRaw.length <= 64 ? clientRaw : null;

  return { status, search, sort, page, clientId };
}

/** Serialize a query to a canonical string, omitting defaults, for shareable URLs. */
export function buildSignalQuery(q: SignalListQuery): string {
  const parts: string[] = [];
  const add = (k: string, v: string) => parts.push(`${k}=${encodeURIComponent(v)}`);
  if (q.status !== "open") add("status", q.status);
  if (q.sort !== "newest") add("sort", q.sort);
  if (q.search) add("q", q.search);
  if (q.clientId) add("client", q.clientId);
  if (q.page > 1) add("page", String(q.page));
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

export function signalsHref(q: SignalListQuery): string {
  return `/admin/signals${buildSignalQuery(q)}`;
}

export interface ActiveFilter {
  key: string;
  label: string;
  /** Query with this constraint removed — powers a "clear this" chip. */
  clearedQuery: SignalListQuery;
}

/** The filters currently narrowing the list (for the "active constraints" bar). */
export function activeSignalFilters(q: SignalListQuery, orgName?: string): ActiveFilter[] {
  const out: ActiveFilter[] = [];
  if (q.status !== "open") {
    out.push({
      key: "status",
      label: `Status: ${signalStatusFilterLabel(q.status)}`,
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

export function hasActiveConstraints(q: SignalListQuery): boolean {
  return q.status !== "open" || q.search.length > 0 || q.clientId !== null;
}

/** The default (no-constraints) query. */
export function defaultSignalQuery(): SignalListQuery {
  return { status: "open", search: "", sort: "newest", page: 1, clientId: null };
}

/* ---- lifecycle actions ---------------------------------------------------- */

export interface SignalAction {
  to: SignalStatus;
  label: string;
  intent: "primary" | "neutral" | "danger";
  /** Terminal/irreversible transitions require an explicit confirmation. */
  confirm: boolean;
}

const ACTION_META = {
  detected: { label: "Reopen", intent: "neutral", confirm: false }, // unreachable — no transition leads to detected
  validated: { label: "Validate", intent: "primary", confirm: false },
  prioritized: { label: "Prioritize", intent: "primary", confirm: false },
  archived: { label: "Archive", intent: "danger", confirm: true },
} as const satisfies Record<string, Omit<SignalAction, "to">>;

/**
 * The lifecycle actions currently legal for a signal — derived from the canonical
 * state machine, gated by write capability. Returns [] for a terminal signal or a
 * read-only actor. Never returns an illegal transition.
 */
export function availableSignalActions(status: SignalStatus, canWrite: boolean): SignalAction[] {
  if (!canWrite) return [];
  const out: SignalAction[] = [];
  for (const to of nextStates("signal", status)) {
    const meta = ACTION_META[to as keyof typeof ACTION_META];
    if (meta) out.push({ to, label: meta.label, intent: meta.intent, confirm: meta.confirm });
  }
  return out;
}

/* ---- list view ------------------------------------------------------------ */

/** Raw list data the data adapter hands the builder (already tenant-scoped by RLS). */
export interface SignalListData {
  signals: readonly Signal[];
  total: number;
  orgNames: Readonly<Record<string, string>>; // clientId → company
  actorNames: Readonly<Record<string, string>>; // userId → name
}

export interface SignalListRow {
  id: string;
  title: string;
  status: SignalStatus;
  statusLabel: string;
  tone: string;
  orgName: string;
  source: string | null;
  createdByName: string | null;
  createdAt: string;
  href: string;
}

export interface SignalListView {
  rows: SignalListRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  query: SignalListQuery;
  activeFilters: ActiveFilter[];
  hasConstraints: boolean;
}

export function buildSignalListView(data: SignalListData, query: SignalListQuery): SignalListView {
  const rows: SignalListRow[] = data.signals.map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status,
    statusLabel: signalStatusLabel(s.status),
    tone: toneFor(s.status),
    orgName: data.orgNames[s.clientId] ?? "Unknown org",
    source: s.sourceRef,
    createdByName: s.createdBy ? (data.actorNames[s.createdBy] ?? null) : null,
    createdAt: s.createdAt,
    href: `/admin/signals/${s.id}`,
  }));

  return {
    rows,
    total: data.total,
    page: query.page,
    pageSize: SIGNAL_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(data.total / SIGNAL_PAGE_SIZE)),
    query,
    activeFilters: activeSignalFilters(query),
    hasConstraints: hasActiveConstraints(query),
  };
}

/* ---- summary metrics ------------------------------------------------------ */

/** Canonical workspace summary. `open` = not archived; `prioritized` = high-priority. */
export interface SignalSummary {
  open: number;
  prioritized: number;
  archived: number;
  recent: number; // created in the last 7 days
}

export const SIGNAL_RECENT_DAYS = 7;

/* ---- detail view ---------------------------------------------------------- */

export interface SignalTransition {
  from: string;
  to: string;
  actorName: string | null;
  at: string;
  reason: string | null;
}

export interface SignalDetailData {
  signal: Signal;
  orgName: string;
  createdByName: string | null;
  transitions: readonly SignalTransition[];
}

/**
 * The Signals read port. Implemented by the Supabase adapter (live) and the demo
 * adapter (Demo Mode); the page depends on this shape, never on a data source.
 */
export interface SignalsReadRepository {
  summary(clientId: string | null): Promise<SignalSummary>;
  list(query: SignalListQuery): Promise<SignalListData>;
  getById(id: string): Promise<SignalDetailData | null>;
  listTransitions(signalId: string): Promise<SignalTransition[]>;
  listOrganizations(): Promise<{ id: string; name: string }[]>;
}

export interface SignalTimelineEntry {
  kind: "created" | "transition";
  from: string | null;
  to: string;
  toLabel: string;
  actorName: string | null;
  at: string;
  reason: string | null;
}

export interface SignalDetailView {
  signal: Signal;
  orgName: string;
  createdByName: string | null;
  statusLabel: string;
  tone: string;
  isTerminal: boolean;
  actions: SignalAction[];
  /** Reverse-chronological (newest first). Includes the canonical creation event. */
  timeline: SignalTimelineEntry[];
}

export function buildSignalDetailView(data: SignalDetailData, canWrite: boolean): SignalDetailView {
  const created: SignalTimelineEntry = {
    kind: "created",
    from: null,
    to: "detected",
    toLabel: signalStatusLabel("detected"),
    actorName: data.createdByName,
    at: data.signal.createdAt,
    reason: null,
  };
  const transitions: SignalTimelineEntry[] = data.transitions.map((t) => ({
    kind: "transition",
    from: t.from,
    to: t.to,
    toLabel: signalStatusLabel(t.to),
    actorName: t.actorName,
    at: t.at,
    reason: t.reason,
  }));

  const timeline = [...transitions, created].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return {
    signal: data.signal,
    orgName: data.orgName,
    createdByName: data.createdByName,
    statusLabel: signalStatusLabel(data.signal.status),
    tone: toneFor(data.signal.status),
    isTerminal: data.signal.status === "archived",
    actions: availableSignalActions(data.signal.status, canWrite),
    timeline,
  };
}
