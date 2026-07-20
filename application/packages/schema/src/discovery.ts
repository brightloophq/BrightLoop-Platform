/* =============================================================================
 * Discovery & Crawl Orchestration — CONTRACTS (PDF 27 §04 · L1/L2).
 *
 * Pure ORCHESTRATION shapes: how a scan discovers, plans, and sequences a
 * crawlable surface — with SSRF, robots, checkpoint/resume, and retry policy.
 * NO networking, HTTP, DNS, browser automation, or fetching anywhere; the logic
 * (@brightloop/domain/scan-engine/discovery/*) is pure + deterministic. Extends
 * the Sprint-1 DiscoveryEngine port; the crawler adapter (deferred) executes it.
 * ========================================================================== */

import { z } from "zod";
import { evidenceSourceSchema } from "./engine.js";

/* ---- URL normalization ---------------------------------------------------- */
export const urlRejectReasonSchema = z.enum(["empty", "invalid_url", "unsupported_scheme"]);
export type UrlRejectReason = z.infer<typeof urlRejectReasonSchema>;

export const normalizedUrlSchema = z.object({
  input: z.string(),
  valid: z.boolean(),
  normalized: z.string().nullable(), // canonical form, null when invalid
  scheme: z.string().nullable(),
  host: z.string().nullable(), // lower-cased, www-stripped
  port: z.number().int().nullable(),
  pathname: z.string().nullable(),
  canonicalRoot: z.string().nullable(), // scheme://host[:port]
  reason: urlRejectReasonSchema.nullable().default(null),
});
export type NormalizedUrl = z.infer<typeof normalizedUrlSchema>;

/* ---- domain resolution (no DNS) ------------------------------------------- */
export const domainScopeSchema = z.object({
  host: z.string(),
  apex: z.string(), // naive eTLD+1 (last two labels; no PSL — documented limitation)
  subdomain: z.string().nullable(),
  pathRoot: z.string(), // first path segment or "/"
  tenantScope: z.string().nullable(), // subdomain used as a tenant marker, when present
});
export type DomainScope = z.infer<typeof domainScopeSchema>;

/* ---- SSRF security contracts (no networking) ------------------------------ */
export const ssrfReasonSchema = z.enum([
  "localhost",
  "loopback",
  "private_rfc1918",
  "link_local",
  "unspecified_address",
  "unsupported_scheme",
  "file_scheme",
  "ftp_scheme",
  "credentials_in_url",
]);
export type SsrfReason = z.infer<typeof ssrfReasonSchema>;

export const ssrfVerdictSchema = z.object({
  url: z.string(),
  allowed: z.boolean(),
  reasons: z.array(ssrfReasonSchema).default([]),
});
export type SsrfVerdict = z.infer<typeof ssrfVerdictSchema>;

/* ---- crawl plan ----------------------------------------------------------- */
export const crawlPathKindSchema = z.enum([
  "homepage",
  "about",
  "contact",
  "services",
  "pricing",
  "blog",
  "legal",
  "careers",
  "resources",
  "custom",
]);
export type CrawlPathKind = z.infer<typeof crawlPathKindSchema>;

/** A plan template entry (relative path). */
export const crawlTargetSchema = z.object({
  kind: crawlPathKindSchema,
  path: z.string(), // relative, leading "/"
  priority: z.number().int(), // lower = crawled first
  depth: z.number().int().nonnegative(),
});
export type CrawlTarget = z.infer<typeof crawlTargetSchema>;

export const crawlPlanSchema = z.object({
  root: z.string(), // canonical root
  targets: z.array(crawlTargetSchema).default([]),
  maxPages: z.number().int().positive(),
  maxDepth: z.number().int().nonnegative(),
  perHostLimit: z.number().int().positive(),
});
export type CrawlPlan = z.infer<typeof crawlPlanSchema>;

/* ---- robots policy (parsed from supplied text; no fetching) --------------- */
export const robotsPolicySchema = z.object({
  allowAll: z.boolean().default(true),
  blockedPaths: z.array(z.string()).default([]), // Disallow
  allowedPaths: z.array(z.string()).default([]), // Allow overrides
  sitemaps: z.array(z.string()).default([]),
  crawlDelaySeconds: z.number().nonnegative().nullable().default(null),
  noindexPaths: z.array(z.string()).default([]),
  nofollowPaths: z.array(z.string()).default([]),
});
export type RobotsPolicy = z.infer<typeof robotsPolicySchema>;

/* ---- retry policy --------------------------------------------------------- */
export const discoveryRetryPolicySchema = z.object({
  maxRetries: z.number().int().nonnegative().default(3),
  backoffBaseMs: z.number().int().positive().default(1_000),
  timeoutMs: z.number().int().positive().default(30_000),
  fatalCodes: z.array(z.string()).default(["ssrf_blocked", "unsupported_scheme", "invalid_url", "robots_disallow"]),
});
export type DiscoveryRetryPolicy = z.infer<typeof discoveryRetryPolicySchema>;

/* ---- state machine + checkpoint ------------------------------------------- */
export const discoveryStateSchema = z.enum(["pending", "running", "paused", "completed", "failed", "cancelled"]);
export type DiscoveryState = z.infer<typeof discoveryStateSchema>;

export const discoveryEventSchema = z.enum(["start", "pause", "resume", "complete", "fail", "cancel"]);
export type DiscoveryEvent = z.infer<typeof discoveryEventSchema>;

export const discoveryCheckpointSchema = z.object({
  sessionId: z.string(),
  state: discoveryStateSchema.default("pending"),
  completedTargetIds: z.array(z.string()).default([]),
  pendingTargetIds: z.array(z.string()).default([]),
  attempt: z.number().int().nonnegative().default(0),
  lastError: z.string().nullable().default(null),
  updatedAt: z.string(),
});
export type DiscoveryCheckpoint = z.infer<typeof discoveryCheckpointSchema>;

/* ---- request / target / session ------------------------------------------- */
export const discoveryRequestSchema = z.object({
  scanId: z.string(),
  clientId: z.string().nullable(),
  rootUrl: z.string(),
  maxPages: z.number().int().positive().default(50),
  maxDepth: z.number().int().nonnegative().default(2),
  perHostLimit: z.number().int().positive().default(30),
  customPaths: z.array(z.string()).default([]),
  userAgent: z.string().default("AuxionBot"),
});
export type DiscoveryRequest = z.infer<typeof discoveryRequestSchema>;

/** A resolved, absolute crawl target. */
export const discoveryTargetSchema = z.object({
  id: z.string(),
  url: z.string(),
  kind: crawlPathKindSchema,
  priority: z.number().int(),
  depth: z.number().int().nonnegative(),
});
export type DiscoveryTarget = z.infer<typeof discoveryTargetSchema>;

export const discoverySessionSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  request: discoveryRequestSchema,
  plan: crawlPlanSchema,
  robots: robotsPolicySchema.nullable().default(null),
  retryPolicy: discoveryRetryPolicySchema,
  checkpoint: discoveryCheckpointSchema,
});
export type DiscoverySession = z.infer<typeof discoverySessionSchema>;

/* ---- outputs (handoff into the Evidence Engine) --------------------------- */
export const excludedTargetSchema = z.object({
  url: z.string(),
  reason: z.string(), // ssrf reason / robots_disallow / duplicate / invalid
});
export type ExcludedTarget = z.infer<typeof excludedTargetSchema>;

export const discoveryManifestSchema = z.object({
  sessionId: z.string(),
  scanId: z.string(),
  targets: z.array(discoveryTargetSchema).default([]),
  checksum: z.string(),
  generatedAt: z.string(),
});
export type DiscoveryManifest = z.infer<typeof discoveryManifestSchema>;

export const discoverySummarySchema = z.object({
  totalPlanned: z.number().int().nonnegative(),
  allowed: z.number().int().nonnegative(),
  excluded: z.number().int().nonnegative(),
  blockedByRobots: z.number().int().nonnegative(),
  ssrfBlocked: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  byKind: z.record(z.string(), z.number()),
});
export type DiscoverySummary = z.infer<typeof discoverySummarySchema>;

export const discoveryMetricsSchema = z.object({
  plannedPages: z.number().int().nonnegative(),
  maxDepth: z.number().int().nonnegative(),
  uniqueHosts: z.number().int().nonnegative(),
  duplicateUrls: z.number().int().nonnegative(),
});
export type DiscoveryMetrics = z.infer<typeof discoveryMetricsSchema>;

export const discoveryResultSchema = z.object({
  sessionId: z.string(),
  scanId: z.string(),
  state: discoveryStateSchema,
  targets: z.array(discoveryTargetSchema).default([]),
  excluded: z.array(excludedTargetSchema).default([]),
  manifest: discoveryManifestSchema,
  summary: discoverySummarySchema,
  metrics: discoveryMetricsSchema,
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;

/* ---- EvidenceIngress (the handoff into the Evidence Engine) ---------------- */
export const evidenceIngressItemSchema = z.object({
  targetId: z.string(),
  url: z.string(),
  kind: crawlPathKindSchema,
  source: evidenceSourceSchema, // which evidence source this target feeds
  provenanceHint: z.object({
    origin: z.string(),
    method: z.literal("crawl"),
    stage: z.literal("discovery"),
  }),
});
export type EvidenceIngressItem = z.infer<typeof evidenceIngressItemSchema>;

export const evidenceIngressSchema = z.object({
  scanId: z.string(),
  items: z.array(evidenceIngressItemSchema).default([]),
});
export type EvidenceIngress = z.infer<typeof evidenceIngressSchema>;
