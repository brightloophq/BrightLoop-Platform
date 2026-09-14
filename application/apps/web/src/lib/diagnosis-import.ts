/* =============================================================================
 * Prospect scan → Business Scan diagnosis.
 *
 * Two vocabularies meet here, and they are NOT the same shape:
 *
 *   the scan engine scores TEN Business Health Index dimensions
 *   the Business Scan has SEVEN System Map domains
 *
 * So the bridge is a real translation, not a rename, and the honest parts of it
 * are the gaps. Three engine dimensions describe the business rather than a
 * system domain — `growth` is an outcome, `risk` is scored inversely upstream,
 * `opportunity` is forward-looking — and folding any of them into a domain
 * would distort the baseline it is supposed to measure. Two System Map domains,
 * Delivery and Analytics, have no engine dimension that speaks to them at all.
 *
 * NOTHING IS INVENTED TO FILL THOSE GAPS. An unmapped domain comes back
 * unscored, exactly as if nobody had typed a number, and the UI says which ones
 * a scan cannot reach. A fabricated score would be indistinguishable from a
 * measured one the moment it was written.
 *
 * Pure and unit-tested: no I/O, no clock, no ids.
 * ========================================================================== */

import {
  DOMAIN_META,
  type DomainKey,
  type FindingPriority,
  type IndexDimension,
} from "@brightloop/schema";

/** Where each engine dimension lands on the System Map, or null for none. */
export const DIMENSION_TO_DOMAIN: Record<IndexDimension, DomainKey | null> = {
  // The public-facing surface: the site and how the brand reads on it.
  digital_presence: "web",
  brand: "web",
  // Demand creation and conversion both sit under Sales on the map.
  sales: "sales",
  marketing: "sales",
  // How customers are captured, tracked and looked after.
  customer_experience: "crm",
  operations: "operations",
  // The AI Layer is the automation the business runs on.
  automation: "ai",
  // Deliberately unmapped — see the header. These describe the business, not a
  // domain of its system, and must not be folded into one.
  growth: null,
  risk: null,
  opportunity: null,
};

/** System Map domains no scan can score — stated, not silently skipped. */
export const UNREACHABLE_DOMAINS: DomainKey[] = (
  ["web", "sales", "crm", "operations", "delivery", "analytics", "ai"] as DomainKey[]
).filter((d) => !Object.values(DIMENSION_TO_DOMAIN).includes(d));

/** Human list for the UI, e.g. "Delivery and Analytics". */
export function unreachableDomainLabels(): string {
  const labels = UNREACHABLE_DOMAINS.map((d) => DOMAIN_META[d].label);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export interface DomainSummaryInput {
  domain: string;
  score?: number | null;
  summary?: string;
}

export interface ImportedScore {
  key: DomainKey;
  score: number;
  /** Which engine dimensions produced it — shown so the number is traceable. */
  from: IndexDimension[];
}

/**
 * Baseline scores from a report's domain summaries.
 *
 * A domain fed by several dimensions (Digital ← digital_presence + brand;
 * Sales ← sales + marketing) takes their MEAN, over the dimensions that
 * actually carry a score. A dimension scored `null` is missing data, not a
 * zero, so it is left out of the average rather than dragging it down — the
 * same rule the manual form uses for a blank field.
 */
export function baselineScoresFromSummaries(
  summaries: readonly DomainSummaryInput[],
): ImportedScore[] {
  const collected = new Map<DomainKey, { scores: number[]; from: IndexDimension[] }>();

  for (const summary of summaries) {
    const dimension = summary.domain as IndexDimension;
    const key = DIMENSION_TO_DOMAIN[dimension];
    if (!key) continue;

    const score = summary.score;
    if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) continue;

    const entry = collected.get(key) ?? { scores: [], from: [] };
    entry.scores.push(score);
    entry.from.push(dimension);
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

export interface PipelineFindingInput {
  title: string;
  domain: string;
  severity?: string;
  businessImpact?: string;
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

/** Length caps from `scanFindingCreateInputSchema` — enforced here so a long
 *  machine-written finding is truncated visibly rather than rejected. */
const FINDING_MAX = 500;
const BASELINE_MAX = 120;

function clamp(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Findings from a report's ledger, for the domains the map can reach.
 *
 * A finding whose dimension does not map is DROPPED rather than filed under a
 * neighbouring domain — attributing a marketing finding to Operations because
 * there was nowhere else to put it is worse than not importing it.
 */
export function findingsFromLedger(
  ledger: readonly PipelineFindingInput[],
): ImportedFinding[] {
  const out: ImportedFinding[] = [];

  for (const finding of ledger) {
    const domainKey = DIMENSION_TO_DOMAIN[finding.domain as IndexDimension];
    if (!domainKey) continue;

    const title = clamp(finding.title ?? "", FINDING_MAX);
    if (title.length === 0) continue;

    const impact = finding.businessImpact ? clamp(finding.businessImpact, BASELINE_MAX) : "";

    out.push({
      domainKey,
      finding: title,
      baseline: impact.length > 0 ? impact : null,
      priority: priorityFromSeverity(finding.severity),
    });
  }

  return out;
}
