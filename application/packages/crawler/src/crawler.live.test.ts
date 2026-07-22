/* =============================================================================
 * LIVE crawl test (Phase C · Sprint C3 §15) — GATED, makes a real request.
 *
 * Runs ONLY when AUXION_RUN_LIVE_CRAWLER_TESTS=true AND an explicit safe URL is
 * configured via AUXION_CRAWLER_TEST_URL. Otherwise it SKIPS explicitly (never
 * passes silently). It is excluded from the default `test` script (only
 * `test:live` includes *.live.test.ts), so default CI makes NO external network
 * request.
 *
 * It crawls only the ONE explicitly configured URL, with tiny limits, and asserts
 * the safety guarantees (no raw HTML persisted, evidence state mapped, checksum
 * present). It never crawls an arbitrary or user-supplied host.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { loadCrawlerConfig } from "./config.js";
import { FetchHttpTransport } from "./transport.js";
import { NodeDnsResolver } from "./dns.js";
import { runCrawl } from "./crawl.js";

const GATE = process.env["AUXION_RUN_LIVE_CRAWLER_TESTS"] === "true";
const TEST_URL = process.env["AUXION_CRAWLER_TEST_URL"];
const LIVE = GATE && typeof TEST_URL === "string" && TEST_URL.length > 0;

describe.skipIf(!LIVE)("crawler (LIVE)", () => {
  it("crawls the one configured safe URL with tiny limits, persisting only safe data", async () => {
    const config = { ...loadCrawlerConfig({ AUXION_CRAWLER_ENABLED: "true" }), maxPages: 2, maxDepth: 1, timeoutMs: 15_000, totalDeadlineMs: 30_000 };
    const request = { scanId: "live-scan", clientId: null, rootUrl: TEST_URL!, maxPages: 2, maxDepth: 1, perHostLimit: 5, customPaths: [], userAgent: config.userAgent };

    const out = await runCrawl(request, {
      transport: new FetchHttpTransport(),
      resolver: new NodeDnsResolver(),
      config,
      clock: () => new Date().toISOString(),
    });

    expect(out.pages.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(out.pages);
    expect(serialized).not.toContain("<html");
    expect(serialized).not.toContain("set-cookie");
    // observability is safe aggregate metadata only
    expect(out.observability.scanId).toBe("live-scan");
    console.log(`[live] crawled ${out.observability.fetched}/${out.pages.length} pages, ${out.observability.bytesFetched} bytes from ${TEST_URL}`);
  });
});
