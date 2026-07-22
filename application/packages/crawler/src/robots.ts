/* =============================================================================
 * Robots retrieval (Phase C · Sprint C3 §3) — fetch + Phase-A parse.
 *
 * Fetches `<root>/robots.txt` through the transport (SSRF-guarded like any other
 * request) and parses it with the pure Phase-A `parseRobots`. A missing file
 * (404 / non-2xx), a fetch failure, or an empty body yields an ALLOW-ALL policy;
 * a malformed file degrades gracefully (`parseRobots` keeps only the directives
 * it understands). The crawler later consults `isPathAllowed` per target.
 * ========================================================================== */

import { parseRobots } from "@brightloop/domain";
import type { RobotsPolicy } from "@brightloop/schema";
import type { CrawlerConfig } from "./config.js";
import type { DnsResolver } from "./dns.js";
import { guardFetchUrl } from "./ssrf.js";
import type { HttpTransport } from "./transport.js";

export interface RobotsRetrieval {
  policy: RobotsPolicy;
  /** True when a 2xx robots body was actually parsed. */
  fetched: boolean;
  status: number | null;
  /** Why robots was not fetched (ssrf / non-2xx / transport error), when applicable. */
  note: string | null;
}

/** The permissive default when robots is absent or unreadable. */
function allowAll(): RobotsPolicy {
  return parseRobots("");
}

export interface RobotsDeps {
  transport: HttpTransport;
  resolver: DnsResolver;
  config: CrawlerConfig;
}

export async function fetchRobots(root: string, deps: RobotsDeps): Promise<RobotsRetrieval> {
  const url = `${root}/robots.txt`;

  const guard = await guardFetchUrl(url, deps.resolver);
  if (!guard.allowed) {
    return { policy: allowAll(), fetched: false, status: null, note: `ssrf:${guard.reasons.join(",")}` };
  }

  const result = await deps.transport.fetch({
    url,
    headers: { "user-agent": deps.config.userAgent, accept: "text/plain" },
    timeoutMs: deps.config.timeoutMs,
    maxBytes: Math.min(deps.config.maxResponseBytes, 512_000),
  });

  if (!result.ok) {
    return { policy: allowAll(), fetched: false, status: null, note: `transport:${result.error.kind}` };
  }
  const res = result.response;
  if (res.status < 200 || res.status >= 300 || res.body.trim() === "") {
    return { policy: allowAll(), fetched: false, status: res.status, note: `status:${res.status}` };
  }

  return { policy: parseRobots(res.body, deps.config.userAgent), fetched: true, status: res.status, note: null };
}
