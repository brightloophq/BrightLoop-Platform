/* =============================================================================
 * Prospect Scanner view models (Phase C · Sprint C4) — PURE, allowlist-only.
 *
 * The single place a runtime artifact envelope becomes something the operator UI
 * renders. Every view is built by EXPLICITLY PICKING known fields and coercing
 * them — an envelope is never spread, never passed through, and never rendered
 * as markup. That is what makes "no raw HTML, no raw provider output, no secret"
 * a property of this module rather than a habit of each component.
 *
 * Pure and dependency-free (no React, no fetch, no server-only), so the safety
 * rules are exhaustively unit-testable.
 * ========================================================================== */

import { PIPELINE_STAGE_ORDER } from "@brightloop/domain";
import type { ScanDTO, TimelineEntryDTO, ArtifactDTO } from "@brightloop/application";

/* ---- primitives -------------------------------------------------------------- */

/** Stages the C3 crawler implements. */
export const DISCOVERY_STAGES: ReadonlySet<string> = new Set(["discovery_planning", "discovery_completion", "evidence_normalization"]);
/** The one stage the C2 provider implements. */
export const REASONING_STAGE = "provider_execution";

const STAGE_LABELS: Record<string, string> = {
  discovery_planning: "Discovery planning",
  discovery_completion: "Discovery crawl",
  evidence_normalization: "Evidence normalization",
  evidence_validation: "Evidence validation",
  graph_assembly: "Graph assembly",
  graph_snapshot: "Graph snapshot",
  reasoning_job_creation: "Reasoning job creation",
  provider_routing: "Provider routing",
  provider_execution: "Reasoning execution",
  grounding_validation: "Grounding validation",
  finding_synthesis: "Finding synthesis",
  recommendation_candidates: "Recommendation candidates",
  report_assembly: "Report assembly",
};

export function stageLabel(stage: string | null): string {
  if (stage === null) return "Not started";
  return STAGE_LABELS[stage] ?? stage.replace(/_/g, " ");
}

/** A tag-like sequence has no place in extracted text; strip defensively. */
const TAGGISH = /<[^>]*>?/g;
// Matching control characters is the POINT here — this strips them out of
// untrusted page text — so the usual "did you mean this?" rule is disabled.
// eslint-disable-next-line no-control-regex
const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]", "g");

/**
 * Coerce ANY value to bounded, tag-free, control-free plain text.
 *
 * React already escapes text nodes, so this is defence in depth: even if an
 * upstream envelope carried markup, it can never reach the DOM as markup, and
 * the length cap keeps a hostile page from flooding the operator view.
 */
export function boundedText(value: unknown, max = 280): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "string" ? value : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  const clean = raw.replace(TAGGISH, " ").replace(CONTROLS, "").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max)}…`;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function obj(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/* ---- prospect identity (from scan metadata) --------------------------------- */

export interface ProspectIdentity {
  businessName: string | null;
  websiteUrl: string | null;
  contactName: string | null;
  email: string | null;
  industry: string | null;
  location: string | null;
  notes: string | null;
  maxPages: number | null;
  reasoningMode: string | null;
}

/** Read the operator-supplied prospect fields out of the scan metadata envelope. */
export function readIdentity(metadata: Record<string, unknown>): ProspectIdentity {
  const m = obj(metadata);
  return {
    businessName: str(boundedText(m["businessName"], 160)),
    websiteUrl: str(boundedText(m["rootUrl"] ?? m["targetUrl"], 300)),
    contactName: str(boundedText(m["contactName"], 120)),
    email: str(boundedText(m["email"], 200)),
    industry: str(boundedText(m["industry"], 120)),
    location: str(boundedText(m["location"], 160)),
    notes: str(boundedText(m["notes"], 1000)),
    maxPages: typeof m["maxPages"] === "number" ? m["maxPages"] : null,
    reasoningMode: str(boundedText(m["reasoningMode"], 40)),
  };
}

/* ---- kill switches ----------------------------------------------------------- */

export interface RuntimeFlags {
  crawlerEnabled: boolean;
  providerEnabled: boolean;
  modelId: string | null;
  maxOutputTokens: number | null;
  /** Upper-bound cost envelope for one reasoning turn, in USD. Null when unknown. */
  estimatedMaxCostUsd: number | null;
}

/* ---- next stage -------------------------------------------------------------- */

export type StageSupportState = "supported" | "crawler_disabled" | "provider_disabled" | "unsupported" | "complete";

export interface NextStageView {
  stage: string | null;
  label: string;
  support: StageSupportState;
  /** Why this stage cannot run, when it cannot. */
  reason: string | null;
  isReasoning: boolean;
  /** Position in the 13-stage pipeline, 1-based; 0 when not started. */
  position: number;
  total: number;
}

/** Resolve the stage a run-once turn would execute next, and whether it can run. */
export function nextStageView(scan: ScanDTO, flags: RuntimeFlags): NextStageView {
  const total = PIPELINE_STAGE_ORDER.length;
  const terminal = scan.lifecycle === "completed" || scan.lifecycle === "cancelled";
  const stage = scan.currentStage ?? (scan.lifecycle === "pending" ? PIPELINE_STAGE_ORDER[0] ?? null : null);
  const position = stage === null ? 0 : (PIPELINE_STAGE_ORDER as readonly string[]).indexOf(stage) + 1;
  const base = { stage, label: stageLabel(stage), isReasoning: stage === REASONING_STAGE, position, total };

  if (terminal) {
    return { ...base, support: "complete", reason: scan.lifecycle === "completed" ? "The scan is complete." : "The scan was cancelled." };
  }
  if (stage === null) return { ...base, support: "unsupported", reason: "No stage is queued for this scan." };

  if (DISCOVERY_STAGES.has(stage)) {
    return flags.crawlerEnabled
      ? { ...base, support: "supported", reason: null }
      : { ...base, support: "crawler_disabled", reason: "The crawler is disabled (AUXION_CRAWLER_ENABLED)." };
  }
  if (stage === REASONING_STAGE) {
    return flags.providerEnabled
      ? { ...base, support: "supported", reason: null }
      : { ...base, support: "provider_disabled", reason: "Live reasoning is disabled (AUXION_LIVE_AI_ENABLED / AUXION_ANTHROPIC_ENABLED)." };
  }
  return { ...base, support: "unsupported", reason: `${stageLabel(stage)} has no runtime implementation yet.` };
}

/* ---- discovery view ---------------------------------------------------------- */

export interface DiscoveryPageView {
  targetId: string;
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  kind: string;
  outcome: string;
  reason: string | null;
  title: string | null;
  checksum: string | null;
  /** Bounded, tag-free preview of the sanitized page text. Never raw HTML. */
  preview: string;
  contentType: string | null;
  bytes: number;
  redirects: number;
  reliability: string;
  injectionMarkers: string[];
}

export interface DiscoveryView {
  present: boolean;
  planned: number;
  allowed: number;
  fetched: number;
  excluded: number;
  robotsBlocked: number;
  ssrfBlocked: number;
  failed: number;
  duplicates: number;
  bytesFetched: number;
  redirectCount: number;
  durationMs: number;
  robotsFetched: boolean;
  injectionFlaggedPages: number;
  contentTypes: { type: string; count: number }[];
  pages: DiscoveryPageView[];
}

export const EMPTY_DISCOVERY: DiscoveryView = {
  present: false, planned: 0, allowed: 0, fetched: 0, excluded: 0, robotsBlocked: 0, ssrfBlocked: 0,
  failed: 0, duplicates: 0, bytesFetched: 0, redirectCount: 0, durationMs: 0, robotsFetched: false,
  injectionFlaggedPages: 0, contentTypes: [], pages: [],
};

/** Build the discovery view from a `discovery_manifest` artifact. */
export function buildDiscoveryView(artifact: ArtifactDTO | null, previewChars = 320): DiscoveryView {
  if (artifact === null) return EMPTY_DISCOVERY;
  const env = obj(artifact.content);
  const o = obj(env["observability"]);
  const summary = obj(env["summary"]);

  const pages: DiscoveryPageView[] = arr(env["pages"]).map((raw) => {
    const p = obj(raw);
    const extract = obj(p["extract"]);
    return {
      targetId: boundedText(p["targetId"], 200),
      requestedUrl: boundedText(p["requestedUrl"], 300),
      finalUrl: boundedText(p["finalUrl"], 300),
      status: typeof p["status"] === "number" ? p["status"] : null,
      kind: boundedText(p["kind"], 40) || "custom",
      outcome: boundedText(p["outcome"], 20) || "failed",
      reason: str(boundedText(p["reason"], 120)),
      title: str(boundedText(extract["title"], 160)),
      checksum: str(boundedText(p["checksum"], 80)),
      preview: boundedText(extract["visibleText"], previewChars),
      contentType: str(boundedText(p["contentType"], 80)),
      bytes: num(p["bytes"]),
      redirects: num(p["redirects"]),
      reliability: boundedText(p["reliability"], 20) || "unavailable",
      injectionMarkers: arr(extract["injectionMarkers"]).map((m) => boundedText(m, 60)).filter((m) => m !== ""),
    };
  });

  const contentTypes = Object.entries(obj(o["contentTypes"])).map(([type, count]) => ({
    type: boundedText(type, 60),
    count: num(count),
  }));

  return {
    present: true,
    planned: num(o["planned"], num(summary["totalPlanned"])),
    allowed: num(o["allowed"], num(summary["allowed"])),
    fetched: num(o["fetched"]),
    excluded: num(o["excluded"], num(summary["excluded"])),
    robotsBlocked: num(o["robotsBlocked"], num(summary["blockedByRobots"])),
    ssrfBlocked: num(o["ssrfBlocked"], num(summary["ssrfBlocked"])),
    failed: num(o["failed"]),
    duplicates: num(o["duplicates"], num(summary["duplicates"])),
    bytesFetched: num(o["bytesFetched"]),
    redirectCount: num(o["redirectCount"]),
    durationMs: num(o["durationMs"]),
    robotsFetched: bool(o["robotsFetched"]),
    injectionFlaggedPages: num(o["injectionFlaggedPages"]),
    contentTypes: contentTypes.sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : 1)),
    pages,
  };
}

/* ---- evidence view ----------------------------------------------------------- */

export interface EvidenceItemView {
  targetId: string;
  url: string;
  kind: string;
  source: string;
  state: string;
  status: number | null;
  checksum: string | null;
  collectedAt: string | null;
  freshness: string | null;
  reason: string | null;
}

export interface EvidenceView {
  present: boolean;
  total: number;
  observed: number;
  unavailable: number;
  /** Evidence sources with at least one observed item. */
  coveredSources: string[];
  /** Sources referenced but with no observed item — an explicit gap. */
  missingSources: string[];
  conflicts: number;
  limitations: string[];
  items: EvidenceItemView[];
}

export const EMPTY_EVIDENCE: EvidenceView = {
  present: false, total: 0, observed: 0, unavailable: 0, coveredSources: [], missingSources: [],
  conflicts: 0, limitations: [], items: [],
};

/** Build the evidence view from an `evidence_ingress` artifact. */
export function buildEvidenceView(artifact: ArtifactDTO | null): EvidenceView {
  if (artifact === null) return EMPTY_EVIDENCE;
  const env = obj(artifact.content);

  const items: EvidenceItemView[] = arr(env["items"]).map((raw) => {
    const i = obj(raw);
    return {
      targetId: boundedText(i["targetId"], 200),
      url: boundedText(i["url"], 300),
      kind: boundedText(i["kind"], 40) || "custom",
      source: boundedText(i["source"], 40) || "pages",
      state: boundedText(i["state"], 20) || "unavailable",
      status: typeof i["status"] === "number" ? i["status"] : null,
      checksum: str(boundedText(i["checksum"], 80)),
      collectedAt: str(boundedText(i["collectedAt"], 40)),
      freshness: str(boundedText(i["freshness"], 80)),
      reason: str(boundedText(i["reason"], 120)),
    };
  });

  const observedSources = new Set(items.filter((i) => i.state === "observed").map((i) => i.source));
  const allSources = new Set(items.map((i) => i.source));
  const missing = [...allSources].filter((s) => !observedSources.has(s));

  const limitations = items
    .filter((i) => i.state !== "observed" && i.reason !== null)
    .map((i) => `${i.kind}: ${i.reason}`)
    .filter((v, idx, a) => a.indexOf(v) === idx)
    .slice(0, 25);

  return {
    present: true,
    total: items.length,
    observed: num(env["observed"], items.filter((i) => i.state === "observed").length),
    unavailable: num(env["unavailable"], items.filter((i) => i.state === "unavailable").length),
    coveredSources: [...observedSources].sort(),
    missingSources: missing.sort(),
    conflicts: num(env["conflicts"]),
    limitations,
    items,
  };
}

/* ---- reasoning readiness ------------------------------------------------------ */

export type ReadinessState =
  | "ready"
  | "blocked_by_discovery"
  | "blocked_by_evidence"
  | "provider_disabled"
  | "provider_unavailable"
  | "budget_exhausted"
  | "deadline_exceeded"
  | "already_complete";

export interface ReadinessFactor {
  label: string;
  value: string;
  ok: boolean;
}

export interface ReasoningReadinessView {
  state: ReadinessState;
  label: string;
  /** A paid provider turn is permitted ONLY when this is true. */
  canExecute: boolean;
  explanation: string;
  factors: ReadinessFactor[];
}

const READINESS_LABEL: Record<ReadinessState, string> = {
  ready: "Ready",
  blocked_by_discovery: "Blocked by discovery",
  blocked_by_evidence: "Blocked by evidence",
  provider_disabled: "Provider disabled",
  provider_unavailable: "Provider unavailable",
  budget_exhausted: "Budget exhausted",
  deadline_exceeded: "Deadline exceeded",
  already_complete: "Already complete",
};

export interface ReadinessInput {
  scan: ScanDTO;
  flags: RuntimeFlags;
  discovery: DiscoveryView;
  evidence: EvidenceView;
  next: NextStageView;
  /** ISO now, injected for determinism. */
  now: string;
}

/**
 * Decide whether a controlled reasoning turn may run. Ordered most-terminal
 * first so the operator sees the single blocking reason, and `canExecute` is
 * true ONLY for `ready` — a paid provider call is never offered otherwise.
 */
export function computeReasoningReadiness(input: ReadinessInput): ReasoningReadinessView {
  const { scan, flags, discovery, evidence, next, now } = input;
  const deadlineRaw = obj(scan.metadata)["deadline"];
  const deadline = typeof deadlineRaw === "string" ? deadlineRaw : null;
  const budgetExhausted = bool(obj(scan.metadata)["budgetExhausted"]);

  const factors: ReadinessFactor[] = [
    { label: "Evidence items", value: String(evidence.total), ok: evidence.total > 0 },
    { label: "Observed evidence", value: String(evidence.observed), ok: evidence.observed > 0 },
    { label: "Unavailable evidence", value: String(evidence.unavailable), ok: evidence.unavailable === 0 },
    { label: "Conflicts", value: String(evidence.conflicts), ok: evidence.conflicts === 0 },
    { label: "Pages fetched", value: String(discovery.fetched), ok: discovery.fetched > 0 },
    { label: "Provider enabled", value: flags.providerEnabled ? "Yes" : "No", ok: flags.providerEnabled },
    { label: "Model configured", value: flags.modelId ?? "Not configured", ok: flags.modelId !== null },
    { label: "Deadline", value: deadline ?? "None set", ok: deadline === null || deadline > now },
    { label: "Stage supported", value: next.support === "supported" ? "Yes" : next.support, ok: next.support === "supported" },
  ];

  const decide = (): { state: ReadinessState; explanation: string } => {
    if (scan.lifecycle === "completed") return { state: "already_complete", explanation: "This scan already finished; there is nothing left to reason over." };
    if (deadline !== null && deadline <= now) return { state: "deadline_exceeded", explanation: "The scan deadline has passed. Start a new scan." };
    if (budgetExhausted) return { state: "budget_exhausted", explanation: "The reasoning budget for this scan is exhausted." };
    if (!flags.providerEnabled) return { state: "provider_disabled", explanation: "Live reasoning is switched off. Enable AUXION_LIVE_AI_ENABLED and AUXION_ANTHROPIC_ENABLED." };
    if (flags.modelId === null) return { state: "provider_unavailable", explanation: "No model is configured for the reasoning provider." };
    if (!discovery.present || discovery.fetched === 0) return { state: "blocked_by_discovery", explanation: "No pages were successfully crawled yet. Run the discovery stages first." };
    if (!evidence.present || evidence.observed === 0) return { state: "blocked_by_evidence", explanation: "No observed evidence yet. Run evidence normalization first." };
    if (next.support !== "supported" || !next.isReasoning) {
      return { state: "blocked_by_evidence", explanation: `The next stage is ${next.label}, not reasoning. Advance the pipeline first.` };
    }
    return { state: "ready", explanation: "Evidence is in place and the provider is live. One controlled turn may run." };
  };

  const { state, explanation } = decide();
  return { state, label: READINESS_LABEL[state], canExecute: state === "ready", explanation, factors };
}

/* ---- execution result -------------------------------------------------------- */

export interface ExecutionView {
  outcome: string;
  stage: string | null;
  stageLabel: string;
  providerId: string | null;
  modelId: string | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  usageEstimated: boolean | null;
  validationStatus: string | null;
  retryDisposition: string | null;
  blockedReason: string | null;
  failureCode: string | null;
  artifactIds: string[];
  checkpointId: string | null;
  downstreamJobId: string | null;
  durationMs: number;
  warnings: string[];
  tone: "success" | "warning" | "danger" | "neutral";
}

const OUTCOME_TONE: Record<string, ExecutionView["tone"]> = {
  completed: "success", advanced: "success",
  blocked: "warning", provider_disabled: "warning", no_job_available: "neutral", retried: "warning",
  failed: "danger", deadline_exceeded: "danger", budget_exhausted: "danger", cancelled: "neutral",
};

/**
 * Project a `DriverResult` into the operator view by EXPLICIT FIELD PICK.
 *
 * The driver result is already a safe DTO, but picking each field by name is what
 * guarantees a future field (or a hostile envelope) can never leak a prompt, a
 * raw response, or a key into the UI.
 */
export function buildExecutionView(raw: unknown): ExecutionView | null {
  if (raw === null || typeof raw !== "object") return null;
  const r = obj(raw);
  const usage = obj(r["usage"]);
  const outcome = boundedText(r["outcome"], 40) || "failed";
  const stage = str(boundedText(r["stage"], 60));

  return {
    outcome,
    stage,
    stageLabel: stageLabel(stage),
    providerId: str(boundedText(r["providerId"], 60)),
    modelId: str(boundedText(r["modelId"], 80)),
    latencyMs: typeof r["latencyMs"] === "number" ? r["latencyMs"] : null,
    inputTokens: typeof usage["inputTokens"] === "number" ? usage["inputTokens"] : null,
    outputTokens: typeof usage["outputTokens"] === "number" ? usage["outputTokens"] : null,
    usageEstimated: typeof usage["estimated"] === "boolean" ? usage["estimated"] : null,
    validationStatus: str(boundedText(r["validationStatus"], 40)),
    retryDisposition: str(boundedText(r["retryDisposition"], 40)),
    blockedReason: str(boundedText(r["blockedReason"], 200)),
    failureCode: str(boundedText(r["failureCode"], 200)),
    artifactIds: arr(r["artifactIds"]).map((a) => boundedText(a, 80)).filter((a) => a !== ""),
    checkpointId: str(boundedText(r["checkpointId"], 80)),
    downstreamJobId: str(boundedText(r["downstreamJobId"], 80)),
    durationMs: num(r["durationMs"]),
    warnings: arr(r["warnings"]).map((w) => boundedText(w, 200)).filter((w) => w !== ""),
    tone: OUTCOME_TONE[outcome] ?? "neutral",
  };
}

/* ---- timeline ---------------------------------------------------------------- */

export interface TimelineRowView {
  id: string;
  sequence: number;
  type: string;
  stage: string | null;
  stageLabel: string;
  at: string;
  /** A safe one-line summary derived from allowlisted detail keys only. */
  summary: string;
  emphasis: boolean;
}

/** Detail keys safe to surface. The rest of the payload is never rendered. */
const SAFE_DETAIL_KEYS = ["reason", "status", "detail", "outcome", "attempt", "artifactKind", "checkpointId", "artifactId", "code"];

/**
 * Map timeline entries to rows. The raw payload is NEVER rendered — only an
 * allowlist of scalar keys is summarized, so a prompt/response/DB row inside a
 * payload can never surface.
 */
export function buildTimelineRows(entries: TimelineEntryDTO[]): TimelineRowView[] {
  return entries.map((e) => {
    const detail = obj(e.detail);
    const parts: string[] = [];
    for (const key of SAFE_DETAIL_KEYS) {
      const value = detail[key];
      if (typeof value === "string" || typeof value === "number") {
        const text = boundedText(value, 120);
        if (text !== "") parts.push(`${key}: ${text}`);
      }
    }
    return {
      id: `${e.sequence}`,
      sequence: e.sequence,
      type: boundedText(e.type, 60),
      stage: e.stage,
      stageLabel: stageLabel(e.stage),
      at: e.at,
      summary: parts.join(" · "),
      emphasis: /fail|block|cancel|complete|retry/i.test(e.type),
    };
  });
}

/* ---- report / proposal -------------------------------------------------------- */

export interface ReportSection {
  key: string;
  label: string;
  /** Bounded plain-text lines. Never markup. */
  lines: string[];
}

export interface StructuredView {
  present: boolean;
  version: number | null;
  status: string | null;
  createdAt: string | null;
  sections: ReportSection[];
}

export const EMPTY_STRUCTURED: StructuredView = { present: false, version: null, status: null, createdAt: null, sections: [] };

/** Flatten an allowlisted envelope key into bounded text lines. */
function toLines(value: unknown, max = 25): string[] {
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === "object" && v !== null ? summarizeRecord(obj(v)) : boundedText(v, 300)))
      .filter((v) => v !== "")
      .slice(0, max);
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(obj(value))
      .map(([k, v]) => `${boundedText(k, 60)}: ${typeof v === "object" ? summarizeRecord(obj(v)) : boundedText(v, 240)}`)
      .filter((v) => !v.endsWith(": "))
      .slice(0, max);
  }
  const single = boundedText(value, 600);
  return single === "" ? [] : [single];
}

/** One-line summary of a nested record using its most descriptive scalar fields. */
function summarizeRecord(record: Record<string, unknown>): string {
  const preferred = ["title", "label", "name", "summary", "statement", "description", "finding", "recommendation", "id"];
  const parts: string[] = [];
  for (const key of preferred) {
    const text = boundedText(record[key], 160);
    if (text !== "") parts.push(text);
    if (parts.length >= 2) break;
  }
  if (parts.length === 0) {
    for (const [k, v] of Object.entries(record).slice(0, 3)) {
      const text = boundedText(v, 100);
      if (text !== "") parts.push(`${boundedText(k, 40)}: ${text}`);
    }
  }
  return parts.join(" — ");
}

/** Build a sectioned view from an artifact using an explicit key allowlist. */
export function buildStructuredView(artifact: ArtifactDTO | null, spec: { key: string; label: string }[]): StructuredView {
  if (artifact === null) return EMPTY_STRUCTURED;
  const env = obj(artifact.content);
  const sections = spec
    .map(({ key, label }) => ({ key, label, lines: toLines(env[key]) }))
    .filter((s) => s.lines.length > 0);
  return {
    present: true,
    version: artifact.version,
    status: boundedText(artifact.status, 40) || null,
    createdAt: artifact.createdAt,
    sections,
  };
}

/** Report sections (§10) — allowlisted keys, in operator reading order. */
export const REPORT_SECTIONS = [
  { key: "executiveOverview", label: "Executive overview" },
  { key: "businessProfile", label: "Business profile" },
  { key: "indexSummary", label: "Index summary" },
  { key: "domainSummaries", label: "Domain summaries" },
  { key: "findings", label: "Findings ledger" },
  { key: "risks", label: "Risks" },
  { key: "opportunities", label: "Opportunities" },
  { key: "evidenceCoverage", label: "Evidence coverage" },
  { key: "confidence", label: "Confidence summary" },
  { key: "conflicts", label: "Conflicts" },
  { key: "recommendationCandidates", label: "Recommendation candidates" },
  { key: "unavailableData", label: "Unavailable data" },
  { key: "limitations", label: "Limitations" },
  { key: "provenance", label: "Provenance summary" },
] as const satisfies readonly { key: string; label: string }[];

/** Proposal sections (§11) — no pricing key is ever read. */
export const PROPOSAL_SECTIONS = [
  { key: "clientContext", label: "Client context" },
  { key: "transformationStrategy", label: "Transformation strategy" },
  { key: "scope", label: "Scope" },
  { key: "deliverables", label: "Deliverables" },
  { key: "phases", label: "Phases" },
  { key: "milestones", label: "Milestones" },
  { key: "successMetrics", label: "Success metrics" },
  { key: "assumptions", label: "Assumptions" },
  { key: "risks", label: "Risks" },
  { key: "exclusions", label: "Exclusions" },
  { key: "optionPackages", label: "Option packages" },
  { key: "investmentStructure", label: "Investment inputs" },
] as const satisfies readonly { key: string; label: string }[];

/* ---- prospect summary --------------------------------------------------------- */

export interface ProspectSummaryView {
  prospectName: string;
  website: string | null;
  strongestIssue: string | null;
  strongestOpportunity: string | null;
  indexSummary: string | null;
  confidence: string | null;
  topRecommendations: string[];
  evidenceGaps: string[];
  nextHumanAction: string;
  reportReady: boolean;
  proposalReady: boolean;
}

export interface SummaryInput {
  scan: ScanDTO;
  identity: ProspectIdentity;
  discovery: DiscoveryView;
  evidence: EvidenceView;
  report: StructuredView;
  proposal: StructuredView;
  readiness: ReasoningReadinessView;
  next: NextStageView;
}

function firstLine(view: StructuredView, key: string): string | null {
  const section = view.sections.find((s) => s.key === key);
  return section?.lines[0] ?? null;
}

/**
 * The operator-only outreach preparation card. Every field is DERIVED from
 * structured artifacts — nothing is invented, and no sales copy is generated. A
 * value that is not evidenced stays null.
 */
export function buildProspectSummary(input: SummaryInput): ProspectSummaryView {
  const { scan, identity, discovery, evidence, report, proposal, readiness, next } = input;

  const gaps: string[] = [];
  if (evidence.missingSources.length > 0) gaps.push(`No observed evidence for: ${evidence.missingSources.join(", ")}`);
  if (discovery.present && discovery.failed > 0) gaps.push(`${discovery.failed} page(s) could not be fetched`);
  if (discovery.present && discovery.robotsBlocked > 0) gaps.push(`${discovery.robotsBlocked} page(s) blocked by robots.txt`);
  if (evidence.present && evidence.unavailable > 0) gaps.push(`${evidence.unavailable} evidence item(s) unavailable`);
  if (!discovery.present) gaps.push("Discovery has not run yet");
  if (!evidence.present) gaps.push("Evidence has not been normalized yet");

  const nextAction = (): string => {
    if (scan.lifecycle === "cancelled") return "This scan was cancelled. Start a new scan to continue.";
    if (scan.lifecycle === "failed") return `Review the failure at ${stageLabel(scan.failedStage)}, then retry if eligible.`;
    if (report.present) return "Review the report, then prepare outreach with the findings below.";
    if (readiness.state === "ready") return "Run the controlled reasoning turn to produce findings.";
    if (next.support === "supported") return `Execute the next stage: ${next.label}.`;
    return readiness.explanation;
  };

  return {
    prospectName: identity.businessName ?? identity.websiteUrl ?? scan.scanId,
    website: identity.websiteUrl,
    strongestIssue: firstLine(report, "risks") ?? firstLine(report, "findings"),
    strongestOpportunity: firstLine(report, "opportunities") ?? firstLine(report, "recommendationCandidates"),
    indexSummary: firstLine(report, "indexSummary"),
    confidence: firstLine(report, "confidence"),
    topRecommendations: (report.sections.find((s) => s.key === "recommendationCandidates")?.lines ?? []).slice(0, 3),
    evidenceGaps: gaps.slice(0, 6),
    nextHumanAction: nextAction(),
    reportReady: report.present,
    proposalReady: proposal.present,
  };
}

/* ---- formatting helpers ------------------------------------------------------- */

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m}m ${Math.round(s % 60)}s`;
}
