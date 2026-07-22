import "server-only";

import {
  createDiscoveryStageRegistry,
  loadCrawlerConfig,
  FetchHttpTransport,
  NodeDnsResolver,
  DISCOVERY_STAGE_KEYS,
  type DiscoveryStageRegistry,
} from "@brightloop/crawler";
import type { RuntimeServices } from "@brightloop/domain";

/**
 * Discovery/crawler composition root (Phase C · Sprint C3 §11).
 *
 * The ONLY place the app assembles the live crawler. `server-only` keeps Node's
 * networking + DNS out of any client bundle. Live crawling is gated by
 * `loadCrawlerConfig().enabled` (AUXION_CRAWLER_ENABLED=true). When disabled — the
 * default — no transport or resolver is constructed, and the discovery stages
 * block with a stable `crawler_disabled` reason: no outbound HTTP request is made.
 */

/** Build the request-scoped discovery stage registry bound to the runtime. */
export function buildDiscoveryRegistry(runtime: RuntimeServices): DiscoveryStageRegistry {
  const config = loadCrawlerConfig();
  // No transport/resolver unless enabled — the executors block before reading them.
  const transport = config.enabled ? new FetchHttpTransport() : null;
  const resolver = config.enabled ? new NodeDnsResolver() : null;

  return createDiscoveryStageRegistry({
    config,
    transport,
    resolver,
    runtime,
    clock: () => new Date().toISOString(),
  });
}

export { DISCOVERY_STAGE_KEYS };
