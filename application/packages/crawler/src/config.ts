/* =============================================================================
 * Crawler configuration (Phase C · Sprint C3 §12/§13) — typed, non-secret.
 *
 * Resolves a typed `CrawlerConfig` from the environment. Disabled by default:
 * with `AUXION_CRAWLER_ENABLED` unset (or not "true"), `enabled` is false and NO
 * outbound HTTP request is ever made — the discovery executor blocks with a
 * stable `crawler_disabled` reason instead. Every optional value has a
 * conservative default. There is no secret here, so a value can never carry a
 * credential into a log line.
 * ========================================================================== */

type Env = Record<string, string | undefined>;

/** The stable block reason emitted when the crawler is disabled. */
export const CRAWLER_DISABLED_REASON = "crawler_disabled" as const;

/** Default bot user-agent. Overridable via env; never impersonates a browser. */
export const DEFAULT_CRAWLER_USER_AGENT = "AuxionBot/1.0 (+https://auxion.co/bot)";

export interface CrawlerConfig {
  /** Global kill switch — false unless AUXION_CRAWLER_ENABLED=true. */
  enabled: boolean;
  userAgent: string;
  /** Hard cap on pages fetched per crawl. */
  maxPages: number;
  /** Maximum crawl-plan depth. */
  maxDepth: number;
  /** Per-request timeout (ms). */
  timeoutMs: number;
  /** Total crawl deadline across all pages (ms). */
  totalDeadlineMs: number;
  /** Maximum bytes read from any single response before it is rejected. */
  maxResponseBytes: number;
  /** Concurrent in-flight page fetches. */
  concurrency: number;
  /** Maximum redirects followed per page (each target re-checked for SSRF). */
  maxRedirects: number;
  /** Maximum characters of sanitized visible text retained per page. */
  maxTextChars: number;
}

const DEFAULTS: Omit<CrawlerConfig, "enabled" | "userAgent"> = {
  maxPages: 10,
  maxDepth: 2,
  timeoutMs: 15_000,
  totalDeadlineMs: 120_000,
  maxResponseBytes: 2_500_000, // 2.5 MB
  concurrency: 2,
  maxRedirects: 3,
  maxTextChars: 20_000,
};

function isTrue(value: string | undefined): boolean {
  return value === "true";
}

/** Parse a positive integer env var, falling back to a conservative default. */
function posInt(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * `enabled` requires `AUXION_CRAWLER_ENABLED=true`. Everything else is a bounded,
 * conservative default when unset or malformed. No `NEXT_PUBLIC_` variable is
 * read — this configuration is server-only.
 */
export function loadCrawlerConfig(env: Env = process.env): CrawlerConfig {
  return {
    enabled: isTrue(env["AUXION_CRAWLER_ENABLED"]),
    userAgent: env["AUXION_CRAWLER_USER_AGENT"] ?? DEFAULT_CRAWLER_USER_AGENT,
    maxPages: posInt(env["AUXION_CRAWLER_MAX_PAGES"], DEFAULTS.maxPages),
    maxDepth: (() => {
      const raw = env["AUXION_CRAWLER_MAX_DEPTH"];
      if (raw === undefined) return DEFAULTS.maxDepth;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 ? n : DEFAULTS.maxDepth;
    })(),
    timeoutMs: posInt(env["AUXION_CRAWLER_TIMEOUT_MS"], DEFAULTS.timeoutMs),
    totalDeadlineMs: posInt(env["AUXION_CRAWLER_TOTAL_DEADLINE_MS"], DEFAULTS.totalDeadlineMs),
    maxResponseBytes: posInt(env["AUXION_CRAWLER_MAX_RESPONSE_BYTES"], DEFAULTS.maxResponseBytes),
    concurrency: posInt(env["AUXION_CRAWLER_CONCURRENCY"], DEFAULTS.concurrency),
    maxRedirects: (() => {
      const raw = env["AUXION_CRAWLER_MAX_REDIRECTS"];
      if (raw === undefined) return DEFAULTS.maxRedirects;
      const n = Number(raw);
      return Number.isInteger(n) && n >= 0 ? n : DEFAULTS.maxRedirects;
    })(),
    maxTextChars: posInt(env["AUXION_CRAWLER_MAX_TEXT_CHARS"], DEFAULTS.maxTextChars),
  };
}
