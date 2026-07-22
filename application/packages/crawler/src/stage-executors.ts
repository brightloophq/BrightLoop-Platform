/* =============================================================================
 * Discovery stage executors (Phase C · Sprint C3 §10) — the C2.1 driver seam.
 *
 * Registers the discovery stages the crawler can execute, resolved by the C2.1
 * `StageExecutorRegistry` shape so the controlled runtime driver drives them ONE
 * AT A TIME. Real pipeline stages (there is no `discovery_execution` /
 * `evidence_collection` stage):
 *
 *   discovery_planning     → validate + plan the crawl surface (no artifact)
 *   discovery_completion   → run the crawl → `discovery_manifest` artifact
 *   evidence_normalization → map crawled pages → `evidence_ingress` artifact
 *
 * When the crawler is disabled every discovery stage returns a stable
 * `crawler_disabled` block — no outbound request, no fabricated artifact, no fake
 * success. The executors perform no reasoning and enqueue nothing themselves; the
 * driver owns the lease, the downstream enqueue, and the one-turn boundary.
 * ========================================================================== */

import { StageBlockedError, normalizeUrl, evaluateSsrf, type RuntimeServices, type StageExecutor, type StageWork } from "@brightloop/domain";
import { discoveryRequestSchema, discoveryResultSchema, type DiscoveryRequest, type DiscoveryResult, type PipelineRunStage, type RuntimeRun } from "@brightloop/schema";
import { CRAWLER_DISABLED_REASON, type CrawlerConfig } from "./config.js";
import { runCrawl, type CrawlObservability, type PageRecord } from "./crawl.js";
import type { DnsResolver } from "./dns.js";
import { toCrawledEvidence } from "./evidence.js";
import type { HttpTransport } from "./transport.js";

/** The discovery stages the crawler owns. */
export const DISCOVERY_STAGE_KEYS: ReadonlySet<PipelineRunStage> = new Set<PipelineRunStage>([
  "discovery_planning",
  "discovery_completion",
  "evidence_normalization",
]);

export type DiscoveryStageSupport =
  | { kind: "executable"; execute: StageExecutor }
  | { kind: "blocked"; reason: string };

export interface DiscoveryStageRegistry {
  resolve(stage: PipelineRunStage, run: RuntimeRun): DiscoveryStageSupport;
}

export interface DiscoveryStageDeps {
  config: CrawlerConfig;
  /** null when disabled — the executor blocks before it is ever read. */
  transport: HttpTransport | null;
  resolver: DnsResolver | null;
  runtime: RuntimeServices;
  clock: () => string;
  /** Resolve the crawl request for a run (default: read `metadata.rootUrl`). */
  resolveRequest?: (run: RuntimeRun, config: CrawlerConfig) => DiscoveryRequest | null;
  /** Safe crawl observability sink — the driver/route reads it after the turn. */
  onObserve?: (observability: CrawlObservability) => void;
}

/** Default request resolution: the target URL travels in the run metadata. */
export function defaultResolveRequest(run: RuntimeRun, config: CrawlerConfig): DiscoveryRequest | null {
  const meta = run.metadata as Record<string, unknown>;
  const rootUrl = typeof meta["rootUrl"] === "string" ? meta["rootUrl"] : typeof meta["targetUrl"] === "string" ? (meta["targetUrl"] as string) : null;
  if (rootUrl === null) return null;
  const customPaths = Array.isArray(meta["customPaths"]) ? (meta["customPaths"] as unknown[]).filter((p): p is string => typeof p === "string") : [];
  return discoveryRequestSchema.parse({
    scanId: run.scanId,
    clientId: run.clientId,
    rootUrl,
    maxPages: config.maxPages,
    maxDepth: config.maxDepth,
    userAgent: config.userAgent,
    customPaths,
  });
}

function requireLiveDeps(deps: DiscoveryStageDeps): { transport: HttpTransport; resolver: DnsResolver } {
  if (!deps.config.enabled || deps.transport === null || deps.resolver === null) {
    throw new StageBlockedError(CRAWLER_DISABLED_REASON);
  }
  return { transport: deps.transport, resolver: deps.resolver };
}

function resolveRequestOrThrow(deps: DiscoveryStageDeps, run: RuntimeRun): DiscoveryRequest {
  const resolve = deps.resolveRequest ?? defaultResolveRequest;
  const request = resolve(run, deps.config);
  if (request === null) throw new Error("missing_target_url");
  const normalized = normalizeUrl(request.rootUrl);
  if (!normalized.valid) throw new Error(`invalid_url:${normalized.reason ?? "invalid"}`);
  if (!evaluateSsrf(request.rootUrl).allowed) throw new Error("ssrf_blocked");
  return request;
}

/** discovery_planning — validate the target + establish the plan. No artifact. */
function planningExecutor(deps: DiscoveryStageDeps): StageExecutor {
  return async (_stage: PipelineRunStage, run: RuntimeRun): Promise<StageWork> => {
    requireLiveDeps(deps);
    resolveRequestOrThrow(deps, run); // throws on missing/invalid/ssrf target
    return { envelope: null, kind: null };
  };
}

/** discovery_completion — run the crawl and produce the discovery_manifest. */
function completionExecutor(deps: DiscoveryStageDeps): StageExecutor {
  return async (_stage: PipelineRunStage, run: RuntimeRun): Promise<StageWork> => {
    const { transport, resolver } = requireLiveDeps(deps);
    const request = resolveRequestOrThrow(deps, run);

    const outcome = await runCrawl(request, { transport, resolver, config: deps.config, clock: deps.clock });
    deps.onObserve?.(outcome.observability);

    return {
      envelope: {
        kind: "discovery_manifest",
        manifest: outcome.result.manifest,
        summary: outcome.result.summary,
        metrics: outcome.result.metrics,
        excluded: outcome.result.excluded,
        robots: { fetched: outcome.robots.fetched, status: outcome.robots.status, note: outcome.robots.note },
        observability: outcome.observability,
        pages: outcome.pages.map(safePage),
      },
      kind: "discovery_manifest",
      sourceArtifactIds: [],
    };
  };
}

/** evidence_normalization — map the crawled pages into evidence_ingress. */
function evidenceExecutor(deps: DiscoveryStageDeps): StageExecutor {
  return async (_stage: PipelineRunStage, run: RuntimeRun): Promise<StageWork> => {
    requireLiveDeps(deps);

    const manifest = await deps.runtime.artifacts.latest(run.id, "discovery_manifest");
    if (!manifest.ok || manifest.value === null) {
      // The gate guarantees this artifact exists; if not, block rather than fabricate.
      throw new StageBlockedError("discovery_manifest_missing");
    }
    const result = reconstructResult(run.scanId, manifest.value.envelope);
    const pages = reviveCrawl(manifest.value.envelope["pages"]);
    const evidence = toCrawledEvidence(result, pages);

    return {
      envelope: {
        kind: "evidence_ingress",
        scanId: run.scanId,
        items: evidence.items,
        ingressCount: evidence.items.length,
        observed: evidence.items.filter((i) => i.state === "observed").length,
        unavailable: evidence.items.filter((i) => i.state === "unavailable").length,
      },
      kind: "evidence_ingress",
      sourceArtifactIds: manifest.value.id === undefined ? [] : [manifest.value.id],
    };
  };
}

/** Build the discovery stage registry: executable when enabled, else blocked. */
export function createDiscoveryStageRegistry(deps: DiscoveryStageDeps): DiscoveryStageRegistry {
  const planning = planningExecutor(deps);
  const completion = completionExecutor(deps);
  const evidence = evidenceExecutor(deps);

  return {
    resolve(stage: PipelineRunStage): DiscoveryStageSupport {
      if (!DISCOVERY_STAGE_KEYS.has(stage)) return { kind: "blocked", reason: `stage '${stage}' is not a discovery stage` };
      if (!deps.config.enabled) return { kind: "blocked", reason: CRAWLER_DISABLED_REASON };
      if (stage === "discovery_planning") return { kind: "executable", execute: planning };
      if (stage === "discovery_completion") return { kind: "executable", execute: completion };
      return { kind: "executable", execute: evidence };
    },
  };
}

/* ---- safe artifact shaping -------------------------------------------------- */

/** A page record trimmed for artifact storage — bounded text, no raw HTML/headers. */
function safePage(p: PageRecord) {
  return {
    targetId: p.targetId,
    requestedUrl: p.requestedUrl,
    finalUrl: p.finalUrl,
    status: p.status,
    kind: p.kind,
    outcome: p.outcome,
    reason: p.reason,
    contentType: p.contentType,
    bytes: p.bytes,
    redirects: p.redirects,
    truncated: p.truncated,
    checksum: p.checksum,
    collectedAt: p.collectedAt,
    lastModified: p.lastModified,
    reliability: p.reliability,
    extract: p.extract,
  };
}

function reviveCrawl(pages: unknown): PageRecord[] {
  return Array.isArray(pages) ? (pages as PageRecord[]) : [];
}

/** Rebuild the validated DiscoveryResult from the stored manifest envelope. */
function reconstructResult(scanId: string, envelope: Record<string, unknown>): DiscoveryResult {
  const manifest = envelope["manifest"] as { sessionId?: string; targets?: unknown };
  return discoveryResultSchema.parse({
    sessionId: manifest?.sessionId ?? `disc:${scanId}`,
    scanId,
    state: "completed",
    targets: manifest?.targets ?? [],
    excluded: envelope["excluded"] ?? [],
    manifest,
    summary: envelope["summary"],
    metrics: envelope["metrics"],
  });
}
