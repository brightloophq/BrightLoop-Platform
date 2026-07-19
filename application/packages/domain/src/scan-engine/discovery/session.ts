/* =============================================================================
 * Discovery session orchestration (PDF 27 §04) — PURE.
 *
 * Ties the pieces together: plan a session from a request, then build a
 * deterministic DiscoveryResult by filtering planned targets through SSRF,
 * robots, and duplicate rules — with a checksummed manifest, a summary, metrics,
 * and the EvidenceIngress handoff into the Evidence Engine. No fetching.
 * ========================================================================== */

import {
  discoverySessionSchema,
  discoveryResultSchema,
  discoveryManifestSchema,
  evidenceIngressSchema,
  type DiscoveryRequest,
  type DiscoverySession,
  type DiscoveryTarget,
  type DiscoveryResult,
  type ExcludedTarget,
  type EvidenceIngress,
  type EvidenceIngressItem,
  type CrawlPathKind,
  type EvidenceSource,
} from "@brightloop/schema";
import { hashContent } from "../evidence/hash.js";
import { normalizeUrl } from "./url.js";
import { generatePlan } from "./plan.js";
import { evaluateSsrf } from "./security.js";
import { isPathAllowed } from "./robots.js";
import { newCheckpoint } from "./statemachine.js";
import { discoveryRetryPolicySchema } from "@brightloop/schema";

const sessionId = (scanId: string) => `disc:${scanId}`;
const targetId = (sid: string, kind: string, path: string) => `t:${sid}:${kind}:${path}`;
const absoluteUrl = (root: string, path: string) => (path === "/" ? root : `${root}${path}`);
const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Which evidence source a crawl target feeds (§05). */
export function sourceForKind(kind: CrawlPathKind): EvidenceSource {
  return kind === "homepage" ? "website" : "pages";
}

/** Plan a discovery session from a request (pending checkpoint over all targets). */
export function planSession(request: DiscoveryRequest, now: string): DiscoverySession {
  const root = normalizeUrl(request.rootUrl).canonicalRoot ?? request.rootUrl;
  const plan = generatePlan(root, { maxPages: request.maxPages, maxDepth: request.maxDepth, perHostLimit: request.perHostLimit, customPaths: request.customPaths });
  const sid = sessionId(request.scanId);
  const targetIds = plan.targets.map((t) => targetId(sid, t.kind, t.path));
  return discoverySessionSchema.parse({
    id: sid,
    scanId: request.scanId,
    clientId: request.clientId,
    request,
    plan,
    robots: null,
    retryPolicy: discoveryRetryPolicySchema.parse({}),
    checkpoint: newCheckpoint(sid, targetIds, now),
  });
}

/** Build the deterministic result: SSRF + robots + duplicate filtering. */
export function buildResult(session: DiscoverySession, now: string): DiscoveryResult {
  const targets: DiscoveryTarget[] = [];
  const excluded: ExcludedTarget[] = [];
  const seen = new Set<string>();
  let ssrfBlocked = 0;
  let blockedByRobots = 0;
  let duplicates = 0;
  const byKind: Record<string, number> = {};

  for (const t of session.plan.targets) {
    const url = absoluteUrl(session.plan.root, t.path);
    const ssrf = evaluateSsrf(url);
    if (!ssrf.allowed) {
      excluded.push({ url, reason: ssrf.reasons.join(",") });
      ssrfBlocked += 1;
      continue;
    }
    if (session.robots && !isPathAllowed(session.robots, t.path)) {
      excluded.push({ url, reason: "robots_disallow" });
      blockedByRobots += 1;
      continue;
    }
    const key = normalizeUrl(url).normalized ?? url;
    if (seen.has(key)) {
      excluded.push({ url, reason: "duplicate" });
      duplicates += 1;
      continue;
    }
    seen.add(key);
    targets.push({ id: targetId(session.id, t.kind, t.path), url, kind: t.kind, priority: t.priority, depth: t.depth });
    byKind[t.kind] = (byKind[t.kind] ?? 0) + 1;
  }

  const sortedTargets = [...targets].sort(byId);
  const manifest = discoveryManifestSchema.parse({
    sessionId: session.id,
    scanId: session.scanId,
    targets: sortedTargets,
    checksum: hashContent({ sessionId: session.id, targets: sortedTargets }),
    generatedAt: now,
  });

  const hosts = new Set(targets.map((t) => normalizeUrl(t.url).host).filter(Boolean));

  return discoveryResultSchema.parse({
    sessionId: session.id,
    scanId: session.scanId,
    state: session.checkpoint.state,
    targets: sortedTargets,
    excluded,
    manifest,
    summary: {
      totalPlanned: session.plan.targets.length,
      allowed: targets.length,
      excluded: excluded.length,
      blockedByRobots,
      ssrfBlocked,
      duplicates,
      byKind,
    },
    metrics: {
      plannedPages: session.plan.targets.length,
      maxDepth: session.plan.maxDepth,
      uniqueHosts: hosts.size,
      duplicateUrls: duplicates,
    },
  });
}

/** The handoff into the Evidence Engine — one ingress item per allowed target. */
export function toEvidenceIngress(result: DiscoveryResult): EvidenceIngress {
  const items: EvidenceIngressItem[] = result.targets.map((t) => ({
    targetId: t.id,
    url: t.url,
    kind: t.kind,
    source: sourceForKind(t.kind),
    provenanceHint: { origin: t.url, method: "crawl" as const, stage: "discovery" as const },
  }));
  return evidenceIngressSchema.parse({ scanId: result.scanId, items });
}
