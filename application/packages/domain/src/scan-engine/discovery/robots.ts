/* =============================================================================
 * Robots policy (PDF 27 §04) — PURE, no fetching.
 *
 * Parses a SUPPLIED robots.txt string (the crawler fetches it later; this layer
 * only interprets text) into a structured policy, and answers path-allow
 * questions against it. Also models sitemap + noindex/nofollow hints. Deterministic.
 * ========================================================================== */

import { robotsPolicySchema, type RobotsPolicy } from "@brightloop/schema";

/**
 * Parse robots.txt for a user-agent. Merges the `*` group with the named group
 * (named directives win on conflict). Pure — no network, no fetching.
 */
export function parseRobots(text: string, userAgent = "AuxionBot"): RobotsPolicy {
  const blocked: string[] = [];
  const allowed: string[] = [];
  const sitemaps: string[] = [];
  const noindex: string[] = [];
  const nofollow: string[] = [];
  let crawlDelay: number | null = null;

  let activeAgents: string[] = [];
  const ua = userAgent.toLowerCase();
  const applies = () => activeAgents.includes("*") || activeAgents.includes(ua);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      activeAgents = [value.toLowerCase()];
      continue;
    }
    if (field === "sitemap") {
      sitemaps.push(value); // sitemaps are global
      continue;
    }
    if (!applies()) continue;
    if (field === "disallow" && value !== "") blocked.push(value);
    else if (field === "allow" && value !== "") allowed.push(value);
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (!Number.isNaN(n)) crawlDelay = n;
    } else if (field === "noindex" && value !== "") noindex.push(value);
    else if (field === "nofollow" && value !== "") nofollow.push(value);
  }

  return robotsPolicySchema.parse({
    allowAll: blocked.length === 0,
    blockedPaths: [...new Set(blocked)].sort(),
    allowedPaths: [...new Set(allowed)].sort(),
    sitemaps: [...new Set(sitemaps)].sort(),
    crawlDelaySeconds: crawlDelay,
    noindexPaths: [...new Set(noindex)].sort(),
    nofollowPaths: [...new Set(nofollow)].sort(),
  });
}

/** Whether a path is crawlable under a policy. Longest matching rule wins;
 *  an Allow rule of equal-or-greater specificity overrides a Disallow. Pure. */
export function isPathAllowed(policy: RobotsPolicy, path: string): boolean {
  if (policy.allowAll && policy.blockedPaths.length === 0) return true;
  const bestBlock = policy.blockedPaths.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  if (bestBlock === undefined) return true;
  const bestAllow = policy.allowedPaths.filter((p) => path.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  return bestAllow !== undefined && bestAllow.length >= bestBlock.length;
}
