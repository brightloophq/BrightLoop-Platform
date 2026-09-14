/* =============================================================================
 * Prospect scan → Business Scan diagnosis.
 *
 * WHAT A PROSPECT SCAN ACTUALLY PERSISTS
 * --------------------------------------
 * The bridge reads the `internal_intelligence_report` artifact, whose envelope
 * is built by `toInternalReportEnvelope` (application/pipeline/report-adapter).
 * That envelope keys its scores by MATURITY CATEGORY — thirteen of them —
 * alongside `risks` (severity + risk category) and, in the sibling `findings`
 * artifact, the observed strengths and weaknesses.
 *
 * This file previously read a DIFFERENT report shape: the scan engine's
 * `pipelineReportSchema`, whose summaries are keyed `domain` over the ten
 * Business Health Index dimensions. Nothing in the prospect pipeline writes
 * that envelope, so every lookup missed, every import came back empty, and the
 * UI reported "no scored dimension mapped to a domain" for scans that were full
 * of scores. Both vocabularies are mapped here now, so either report imports.
 *
 * THREE VOCABULARIES, SEVEN DOMAINS
 * ---------------------------------
 * The System Map has seven fixed domains. The maturity categories, the index
 * dimensions and the risk categories each describe a different cut of the same
 * business, so the bridge is a real translation and the honest parts of it are
 * the gaps: a term with no domain is DROPPED, never filed under a neighbour,
 * and a domain nothing measures comes back unscored exactly as if nobody had
 * typed a number.
 *
 * NOTHING IS INVENTED TO FILL A GAP. A fabricated score would be
 * indistinguishable from a measured one the moment it was written.
 *
 * Pure and unit-tested: no I/O, no clock, no ids.
 * ========================================================================== */

import {
  DOMAIN_KEYS,
  DOMAIN_META,
  type DomainKey,
  type FindingPriority,
  type FindingSource,
  type IndexDimension,
  type MaturityCategory,
  type ProspectRiskCategory,
} from "@brightloop/schema";

/**
 * Maturity category → System Map domain. This is the map that matters: it is
 * the vocabulary a prospect scan actually scores.
 *
 * Seven of the thirteen land on Digital because a crawl of a website observes
 * the web surface most directly — that is what the instrument can see, and
 * spreading them across domains to look balanced would move a measurement of
 * the site onto a domain the site says nothing about.
 */
export const CATEGORY_TO_DOMAIN: Record<MaturityCategory, DomainKey | null> = {
  // The public surface: the site itself and how it reads.
  website: "web",
  seo: "web",
  branding: "web",
  trust: "web",
  accessibility: "web",
  content: "web",
  performance: "web",
  // Demand and conversion.
  social_presence: "sales",
  lead_capture: "sales",
  // What happens to a customer once captured.
  customer_journey: "crm",
  operations: "operations",
  analytics: "analytics",
  automation: "ai",
};

/**
 * Index dimension → System Map domain, for the scan engine's report shape.
 *
 * `growth`, `risk` and `opportunity` stay unmapped: they describe the business
 * rather than a domain of its system, and folding any of them into a domain
 * would distort the baseline it is supposed to measure.
 */
export const DIMENSION_TO_DOMAIN: Record<IndexDimension, DomainKey | null> = {
  digital_presence: "web",
  brand: "web",
  sales: "sales",
  marketing: "sales",
  customer_experience: "crm",
  operations: "operations",
  automation: "ai",
  growth: null,
  risk: null,
  opportunity: null,
};

/** Risk category → System Map domain, for the report's `risks` section. */
export const RISK_CATEGORY_TO_DOMAIN: Record<ProspectRiskCategory, DomainKey | null> = {
  technical: "web",
  trust: "web",
  seo: "web",
  accessibility: "web",
  content: "web",
  marketing: "sales",
  operational: "operations",
  compliance: "operations",
  automation: "ai",
};

/**
 * The domain a scan term names, across every vocabulary, or null for none.
 *
 * The three maps agree wherever they overlap (`operations`, `automation`,
 * `content`…), so a single lookup is unambiguous and a report may mix them.
 */
export function domainForTerm(term: string | undefined | null): DomainKey | null {
  if (typeof term !== "string" || term.length === 0) return null;
  const maps: Record<string, DomainKey | null>[] = [
    CATEGORY_TO_DOMAIN,
    DIMENSION_TO_DOMAIN,
    RISK_CATEGORY_TO_DOMAIN,
  ];
  for (const map of maps) {
    if (Object.hasOwn(map, term)) return map[term] ?? null;
  }
  return null;
}

/** System Map domains no scan can score — stated, not silently skipped. */
export const UNREACHABLE_DOMAINS: DomainKey[] = DOMAIN_KEYS.filter(
  (d) =>
    !Object.values(CATEGORY_TO_DOMAIN).includes(d) &&
    !Object.values(DIMENSION_TO_DOMAIN).includes(d),
);

/** Human list for the UI, e.g. "Delivery" or "Delivery and Analytics". */
export function unreachableDomainLabels(): string {
  const labels = UNREACHABLE_DOMAINS.map((d) => DOMAIN_META[d].label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/* ---- reading the envelope ------------------------------------------------ */

function row(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.map(row).filter((r): r is Record<string, unknown> => r !== null);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export interface ImportedScore {
  key: DomainKey;
  score: number;
  /** Which scan terms produced it — shown so the number is traceable. */
  from: string[];
}

/**
 * Baseline scores from a report's domain summaries.
 *
 * A domain fed by several terms (Digital ← seven categories) takes their MEAN,
 * over the terms that actually carry a score. A term scored `null` is missing
 * data, not a zero, so it is left out of the average rather than dragging it
 * down — the same rule the manual form uses for a blank field.
 *
 * Reads `category` (the prospect report) or `domain` (the engine report),
 * whichever the row carries.
 */
export function baselineScoresFromSummaries(summaries: unknown): ImportedScore[] {
  const collected = new Map<DomainKey, { scores: number[]; from: string[] }>();

  for (const summary of rows(summaries)) {
    const term = text(summary["category"]) || text(summary["domain"]);
    const key = domainForTerm(term);
    if (!key) continue;

    const score = summary["score"];
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) continue;

    const entry = collected.get(key) ?? { scores: [], from: [] };
    entry.scores.push(score);
    entry.from.push(term);
    collected.set(key, entry);
  }

  const out: ImportedScore[] = [];
  for (const [key, { scores, from }] of collected) {
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    // The System Map stores integers; round once, at the end.
    out.push({ key, score: Math.round(mean), from });
  }
  return out;
}

export interface ImportedFinding {
  domainKey: DomainKey;
  finding: string;
  baseline: string | null;
  priority: FindingPriority;
}

/**
 * Severity (four levels, engine) → priority (three, Business Scan).
 *
 * `critical` and `high` both become `high`: the ledger has no level above it,
 * and quietly demoting a critical finding to medium to preserve a one-to-one
 * shape would hide the most important thing the scan found.
 */
export function priorityFromSeverity(severity: string | undefined): FindingPriority {
  switch (severity) {
    case "critical":
    case "high":
      return "high";
    case "low":
      return "low";
    default:
      return "medium";
  }
}

/**
 * Observed 0–100 score → priority, for a weakness that carries no severity.
 *
 * The bands are the reading of a measured number, not a new judgement: a
 * category the scan scored in the twenties is a worse problem than one it
 * scored in the sixties, and the ledger has three levels to say so with.
 */
export function priorityFromObservedScore(score: number | undefined): FindingPriority {
  if (typeof score !== "number" || !Number.isFinite(score)) return "medium";
  if (score < 40) return "high";
  if (score < 70) return "medium";
  return "low";
}

/** Length caps from `scanFindingCreateInputSchema` — enforced here so a long
 *  machine-written finding is truncated visibly rather than rejected. */
const FINDING_MAX = 500;
const BASELINE_MAX = 120;

function clamp(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Findings from the scan engine's `findingsLedger`, for the domains the map can
 * reach. Retained for reports written in that shape.
 */
export function findingsFromLedger(ledger: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];

  for (const finding of rows(ledger)) {
    const domainKey = domainForTerm(text(finding["domain"]) || text(finding["category"]));
    if (!domainKey) continue;

    const title = clamp(text(finding["title"]), FINDING_MAX);
    if (title.length === 0) continue;

    const impact = clamp(text(finding["businessImpact"]), BASELINE_MAX);

    out.push({
      domainKey,
      finding: title,
      baseline: impact.length > 0 ? impact : null,
      priority: priorityFromSeverity(text(finding["severity"]) || undefined),
    });
  }

  return out;
}

/**
 * Findings from the report's `risks` section.
 *
 * The risk's own description is the baseline — what is true now — clamped to
 * the column rather than dropped, so the ledger row says more than its title.
 */
export function findingsFromRisks(risks: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];

  for (const risk of rows(risks)) {
    const domainKey = domainForTerm(text(risk["category"]));
    if (!domainKey) continue;

    const title = clamp(text(risk["title"]), FINDING_MAX);
    if (title.length === 0) continue;

    const description = clamp(text(risk["description"]), BASELINE_MAX);

    out.push({
      domainKey,
      finding: title,
      baseline: description.length > 0 ? description : null,
      priority: priorityFromSeverity(text(risk["severity"]) || undefined),
    });
  }

  return out;
}

/**
 * Findings from the `findings` artifact's weaknesses.
 *
 * Strengths are deliberately skipped: the ledger is a list of gaps to close,
 * and a strength filed as a finding would read as a problem. The weakness's
 * `observedScore` becomes the baseline — a measured number is exactly what
 * that column is for.
 */
export function findingsFromWeaknesses(findings: unknown): ImportedFinding[] {
  const out: ImportedFinding[] = [];

  for (const finding of rows(findings)) {
    if (text(finding["kind"]) !== "weakness") continue;

    const domainKey = domainForTerm(text(finding["category"]));
    if (!domainKey) continue;

    const title = clamp(text(finding["title"]), FINDING_MAX);
    if (title.length === 0) continue;

    const observed = finding["observedScore"];
    const score = typeof observed === "number" && Number.isFinite(observed) ? observed : undefined;

    out.push({
      domainKey,
      finding: title,
      baseline: score === undefined ? null : `Observed ${Math.round(score)}/100`,
      priority: priorityFromObservedScore(score),
    });
  }

  return out;
}

export interface ImportSources {
  /** The `internal_intelligence_report` envelope. */
  report: Record<string, unknown> | null;
  /** The `findings` envelope, which carries the category a weakness belongs to. */
  findings?: Record<string, unknown> | null;
}

export interface ImportedDiagnosis {
  scores: ImportedScore[];
  findings: ImportedFinding[];
  /** True when the report carried scored rows but none named a mappable domain. */
  summariesSeen: number;
}

/**
 * Everything one scan can contribute to a Business Scan, from the artifacts as
 * they are actually persisted.
 *
 * Weaknesses and risks describe the same business from two angles and regularly
 * name the same problem, so the combined list is deduplicated BY TITLE rather
 * than by title-and-domain. A risk carries only a broad risk category while the
 * weakness it restates knows the maturity category it came from, so the two can
 * land on different domains — deduplicating on the pair would let the same
 * sentence into the ledger twice under two headings. Weaknesses are collected
 * first and the first entry wins, so the more specific attribution is the one
 * that survives.
 */
export function importedDiagnosis({ report, findings }: ImportSources): ImportedDiagnosis {
  const content = report ?? {};

  const scores = baselineScoresFromSummaries(content["domainSummaries"]);

  const collected = [
    ...findingsFromWeaknesses(findings?.["weaknesses"]),
    ...findingsFromRisks(content["risks"]),
    ...findingsFromLedger(content["findingsLedger"]),
  ];

  const seen = new Set<string>();
  const deduped: ImportedFinding[] = [];
  for (const finding of collected) {
    const key = finding.finding.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return {
    scores,
    findings: deduped,
    summariesSeen: rows(content["domainSummaries"]).length,
  };
}

/* ---- reconciling the ledger against a newer scan -------------------------- */

/** An existing ledger row, as far as reconciling cares. */
export interface LedgerRow {
  id: string;
  domainKey: DomainKey;
  finding: string;
  source: FindingSource;
}

export interface LedgerPlan {
  /** Findings in the new scan that are not already in the ledger. */
  add: ImportedFinding[];
  /** Ids of imported rows the new scan no longer reports. */
  remove: string[];
  /** Rows the new scan still reports, or that a person wrote. */
  keep: number;
}

const rowKey = (domainKey: string, finding: string): string =>
  JSON.stringify([domainKey, finding.trim().toLowerCase()]);

/**
 * What importing a newer scan should do to the ledger already there.
 *
 * REPLACE, NOT ACCUMULATE. Before this, an import only ever added: a client
 * whose site had since been fixed showed a Sales score of 81 directly above
 * "Minimal social footprint · Observed 0/100" — two scans presented as one
 * diagnosis, with nothing on the page admitting it.
 *
 * A MANUAL FINDING IS NEVER REMOVED. Somebody typed it; no scan is evidence
 * that it stopped being true, because no scan is what put it there. Only rows
 * an import wrote are retired, and only when the newer scan does not report
 * them again.
 *
 * Matching is on the pair a reader would call the same finding, case- and
 * whitespace-insensitively, so a re-import of the same scan is a no-op rather
 * than a churn of deletes and inserts.
 */
export function reconcileLedger(
  existing: readonly LedgerRow[],
  incoming: readonly ImportedFinding[],
): LedgerPlan {
  const incomingKeys = new Set(incoming.map((f) => rowKey(f.domainKey, f.finding)));
  const existingKeys = new Set(existing.map((r) => rowKey(r.domainKey, r.finding)));

  const add = incoming.filter((f) => !existingKeys.has(rowKey(f.domainKey, f.finding)));

  const remove: string[] = [];
  let keep = 0;
  for (const row of existing) {
    const stale = row.source === "import" && !incomingKeys.has(rowKey(row.domainKey, row.finding));
    if (stale) remove.push(row.id);
    else keep += 1;
  }

  return { add, remove, keep };
}
