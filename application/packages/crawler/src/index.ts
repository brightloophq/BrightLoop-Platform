/* =============================================================================
 * @brightloop/crawler (Phase C · Sprint C3) — the discovery/crawler runtime.
 *
 * Infrastructure: server-only. It fetches real websites behind the pure Phase-A
 * discovery contracts (SSRF, robots, plan, manifest, evidence ingress) and drives
 * the discovery stages through the C2.1 controlled runtime driver ONE stage at a
 * time. Never import from a client bundle — it pulls Node networking + DNS.
 *
 * No browser automation, no JS execution, no authenticated crawl, no broad web
 * search, no competitor discovery, no permanent worker, no scheduler.
 * ========================================================================== */

export { loadCrawlerConfig, CRAWLER_DISABLED_REASON, DEFAULT_CRAWLER_USER_AGENT, type CrawlerConfig } from "./config.js";
export {
  FetchHttpTransport,
  type HttpTransport,
  type HttpRequest,
  type HttpResponse,
  type HttpFetchResult,
  type HttpTransportError,
} from "./transport.js";
export { NodeDnsResolver, classifyIp, guardResolvedHost, type DnsResolver, type IpRejectReason, type ResolvedHostVerdict } from "./dns.js";
export { guardFetchUrl, type FetchGuardVerdict } from "./ssrf.js";
export { fetchRobots, type RobotsRetrieval } from "./robots.js";
export { fetchPage, isHtmlContentType, type PageFetch, type PageFetchOutcome } from "./fetcher.js";
export { extractPage, type PageExtract, type SeoSignals, type AccessibilitySignals, type PageForm } from "./extract.js";
export {
  stripActiveMarkup,
  htmlToText,
  cleanInline,
  normalizeWhitespace,
  removeControlChars,
  contentChecksum,
  detectInjectionMarkers,
} from "./sanitize.js";
export { runCrawl, type CrawlOutcome, type CrawlDeps, type PageRecord, type CrawlObservability, type PageReliability } from "./crawl.js";
export { toCrawledEvidence, type CrawledEvidence, type CrawledEvidenceItem } from "./evidence.js";
export {
  createDiscoveryStageRegistry,
  defaultResolveRequest,
  DISCOVERY_STAGE_KEYS,
  type DiscoveryStageRegistry,
  type DiscoveryStageSupport,
  type DiscoveryStageDeps,
} from "./stage-executors.js";
export { FakeHttpTransport, FakeDnsResolver, type ScriptedResponse, type ScriptedRoute } from "./testing/fake-transport.js";
