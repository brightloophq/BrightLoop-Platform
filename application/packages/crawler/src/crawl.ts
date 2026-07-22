/* =============================================================================
 * Crawl orchestrator (Phase C · Sprint C3 §4/§8) — plan → robots → fetch.
 *
 * Ties the pieces together for ONE crawl: it plans the session (pure Phase-A
 * `planSession`), fetches + applies robots, filters planned targets through SSRF
 * (string) + robots + duplicate rules (pure `buildResult`), then FETCHES each
 * allowed target — re-checking SSRF at fetch time (DNS), enforcing per-request
 * and total-deadline limits and concurrency — and extracts a bounded, sanitized
 * page record. It performs no reasoning and produces no recommendations.
 * ========================================================================== */

import { planSession, buildResult } from "@brightloop/domain";
import type { CrawlPathKind, DiscoveryRequest, DiscoveryResult, DiscoveryTarget } from "@brightloop/schema";
import type { CrawlerConfig } from "./config.js";
import type { DnsResolver } from "./dns.js";
import { extractPage, type PageExtract } from "./extract.js";
import { fetchPage, type PageFetchOutcome } from "./fetcher.js";
import { fetchRobots, type RobotsRetrieval } from "./robots.js";
import { contentChecksum } from "./sanitize.js";
import type { HttpTransport } from "./transport.js";

export type PageReliability = "observed" | "inferred" | "unavailable";

/** A single crawled page — safe, bounded metadata plus a sanitized extract. */
export interface PageRecord {
  targetId: string;
  requestedUrl: string;
  finalUrl: string;
  status: number | null;
  kind: CrawlPathKind;
  outcome: PageFetchOutcome;
  reason: string | null;
  contentType: string | null;
  bytes: number;
  redirects: number;
  truncated: boolean;
  /** Checksum of the sanitized visible text (null when nothing was extracted). */
  checksum: string | null;
  collectedAt: string;
  /** `Last-Modified` header when present — a freshness hint. */
  lastModified: string | null;
  reliability: PageReliability;
  extract: PageExtract | null;
}

/** Safe, aggregate crawl metrics — no content, no headers, no secrets. */
export interface CrawlObservability {
  sessionId: string;
  scanId: string;
  planned: number;
  allowed: number;
  fetched: number;
  excluded: number;
  failed: number;
  robotsBlocked: number;
  ssrfBlocked: number;
  duplicates: number;
  bytesFetched: number;
  durationMs: number;
  redirectCount: number;
  robotsFetched: boolean;
  injectionFlaggedPages: number;
  contentTypes: Record<string, number>;
}

export interface CrawlOutcome {
  result: DiscoveryResult;
  robots: RobotsRetrieval;
  pages: PageRecord[];
  observability: CrawlObservability;
}

export interface CrawlDeps {
  transport: HttpTransport;
  resolver: DnsResolver;
  config: CrawlerConfig;
  /** ISO clock for timestamps AND total-deadline math (Date.parse). */
  clock: () => string;
}

function reliabilityFor(outcome: PageFetchOutcome): PageReliability {
  return outcome === "ok" ? "observed" : "unavailable";
}

/** Run one crawl end to end and return the discovery result + bounded page records. */
export async function runCrawl(request: DiscoveryRequest, deps: CrawlDeps): Promise<CrawlOutcome> {
  const startedAt = deps.clock();
  const startMs = Date.parse(startedAt);

  const session = planSession(request, startedAt);
  const robots = await fetchRobots(session.plan.root, deps);
  const withRobots = { ...session, robots: robots.policy };

  // Pure filtering: SSRF (string) + robots + duplicates over the planned targets.
  const result = buildResult(withRobots, startedAt);

  const targets = result.targets.slice(0, deps.config.maxPages);
  const pages: PageRecord[] = [];
  const contentTypes: Record<string, number> = {};
  let bytesFetched = 0;
  let redirectCount = 0;
  let injectionFlaggedPages = 0;

  const overDeadline = () => Date.parse(deps.clock()) - startMs >= deps.config.totalDeadlineMs;

  // Bounded concurrency, deterministic ordering (results re-sorted by targetId).
  const batchSize = Math.max(1, deps.config.concurrency);
  for (let i = 0; i < targets.length; i += batchSize) {
    if (overDeadline()) {
      for (const t of targets.slice(i)) pages.push(deadlinePage(t, deps.clock()));
      break;
    }
    const batch = targets.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map((t) => crawlOne(t, deps)));
    for (const rec of settled) {
      pages.push(rec);
      bytesFetched += rec.bytes;
      redirectCount += rec.redirects;
      if (rec.extract && rec.extract.injectionMarkers.length > 0) injectionFlaggedPages += 1;
      const ct = rec.contentType?.split(";")[0]?.trim().toLowerCase() ?? "none";
      contentTypes[ct] = (contentTypes[ct] ?? 0) + 1;
    }
  }

  pages.sort((a, b) => (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0));

  const fetched = pages.filter((p) => p.outcome === "ok").length;
  const excludedPages = pages.filter((p) => p.outcome === "excluded").length;
  const failed = pages.filter((p) => p.outcome === "failed").length;

  return {
    result,
    robots,
    pages,
    observability: {
      sessionId: session.id,
      scanId: request.scanId,
      planned: result.summary.totalPlanned,
      allowed: result.summary.allowed,
      fetched,
      excluded: result.summary.excluded + excludedPages,
      failed,
      robotsBlocked: result.summary.blockedByRobots,
      ssrfBlocked: result.summary.ssrfBlocked,
      duplicates: result.summary.duplicates,
      bytesFetched,
      durationMs: Math.max(0, Date.parse(deps.clock()) - startMs),
      redirectCount,
      robotsFetched: robots.fetched,
      injectionFlaggedPages,
      contentTypes,
    },
  };
}

async function crawlOne(target: DiscoveryTarget, deps: CrawlDeps): Promise<PageRecord> {
  const collectedAt = deps.clock();
  const fetchResult = await fetchPage(target.url, deps);
  const extract = fetchResult.outcome === "ok" && fetchResult.body !== null
    ? extractPage(fetchResult.body, fetchResult.finalUrl, deps.config.maxTextChars)
    : null;

  return {
    targetId: target.id,
    requestedUrl: target.url,
    finalUrl: fetchResult.finalUrl,
    status: fetchResult.status,
    kind: target.kind,
    outcome: fetchResult.outcome,
    reason: fetchResult.reason,
    contentType: fetchResult.contentType,
    bytes: fetchResult.bytes,
    redirects: fetchResult.redirects,
    truncated: fetchResult.truncated,
    checksum: extract === null ? null : contentChecksum(extract.visibleText),
    collectedAt,
    lastModified: fetchResult.lastModified,
    reliability: reliabilityFor(fetchResult.outcome),
    extract,
  };
}

function deadlinePage(target: DiscoveryTarget, collectedAt: string): PageRecord {
  return {
    targetId: target.id,
    requestedUrl: target.url,
    finalUrl: target.url,
    status: null,
    kind: target.kind,
    outcome: "failed",
    reason: "deadline_exceeded",
    contentType: null,
    bytes: 0,
    redirects: 0,
    truncated: false,
    checksum: null,
    collectedAt,
    lastModified: null,
    reliability: "unavailable",
    extract: null,
  };
}
