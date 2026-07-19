/* =============================================================================
 * Business Intelligence Scan — ENGINE CONTRACTS (foundation only).
 *
 * These are the typed data contracts for the future asynchronous scan engine.
 * NOTHING here calls a model, a crawler, or a queue — the engine is deferred
 * (see docs + ENGINEERING_CONTEXT §"Scan engine"). This file defines the shapes
 * that the queued job, provider adapters, and AI orchestration will exchange, so
 * the persistence + provider layers can be built against a stable contract.
 *
 * INTEGRITY RULES baked into the shapes:
 *   • Observed facts (ScanEvidenceItem, CompetitorBenchmark) are SEPARATE from AI
 *     inference (DomainDiagnosis.inference) — never merged into one blob.
 *   • Every observed item carries provenance (sourceUrl + observedAt + provider).
 *   • Crawled/searched content is UNTRUSTED input (ScanEvidenceItem.trust).
 *   • Model calls log provider/model/version + structured-output metadata
 *     (ModelInvocation) — never hidden chain-of-thought.
 * ========================================================================== */

import { z } from "zod";
import { domainKeySchema } from "./domains.js";

/* ---- entitlement tiers (access levels) ------------------------------------ */
export const entitlementTierSchema = z.enum([
  "public_preview", // anonymous — teaser only
  "registered_lead", // email captured — partial report
  "internal_operator", // Auxion staff running a scan for a prospect
  "committed_client", // deposit/subscription/engagement active — full report
  "admin_owner", // unrestricted
]);
export type EntitlementTier = z.infer<typeof entitlementTierSchema>;

/* ---- async job lifecycle -------------------------------------------------- */
export const scanStageSchema = z.enum([
  "requested",
  "crawling",
  "normalizing",
  "competitor_discovery",
  "benchmarking",
  "ai_orchestration",
  "diagnosing",
  "synthesizing",
  "reporting",
  "complete",
]);
export type ScanStage = z.infer<typeof scanStageSchema>;

export const scanJobStatusSchema = z.enum([
  "queued",
  "running",
  "awaiting_provider", // blocked on an external adapter (crawler/LLM/benchmark)
  "succeeded",
  "failed",
  "cancelled",
]);
export type ScanJobStatus = z.infer<typeof scanJobStatusSchema>;

/* ---- provider metadata (logged on every external call) -------------------- */
export const providerKindSchema = z.enum(["ai", "crawler", "search", "performance", "seo", "benchmark"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

/** What ran, at what version, producing what structured output — for audit. Never stores chain-of-thought. */
export const modelInvocationSchema = z.object({
  provider: z.string(), // "anthropic" | "openai" | "google" | "deepseek" | crawler vendor …
  model: z.string(), // e.g. "claude-opus-4-8"
  version: z.string().nullable().default(null),
  kind: providerKindSchema,
  structuredOutputSchemaId: z.string().nullable().default(null),
  tokensIn: z.number().int().nonnegative().nullable().default(null),
  tokensOut: z.number().int().nonnegative().nullable().default(null),
  latencyMs: z.number().int().nonnegative().nullable().default(null),
  invokedAt: z.string(),
});
export type ModelInvocation = z.infer<typeof modelInvocationSchema>;

/* ---- confidence (attached to every inference) ----------------------------- */
export const scanConfidenceSchema = z.object({
  score: z.number().min(0).max(1), // 0..1
  method: z.enum(["heuristic", "model", "benchmark", "manual"]),
  basis: z.string().max(500).nullable().default(null), // human-readable why
  sampleSize: z.number().int().nonnegative().nullable().default(null),
});
export type ScanConfidence = z.infer<typeof scanConfidenceSchema>;

/* ---- scan request + job --------------------------------------------------- */
export const scanSourceSchema = z.object({
  kind: providerKindSchema,
  providerId: z.string(), // which adapter (registry key)
  target: z.string().max(2048).nullable().default(null), // url/query; validated + SSRF-guarded by the adapter
  config: z.record(z.string(), z.unknown()).default({}),
});
export type ScanSource = z.infer<typeof scanSourceSchema>;

export const scanRequestSchema = z.object({
  id: z.string(),
  clientId: z.string().nullable(), // null for a public/lead preview not yet tied to a client
  targetUrl: z.string().max(2048), // the business being scanned; adapters must SSRF-guard
  tier: entitlementTierSchema,
  requestedBy: z.string().nullable().default(null), // internal users.id (resolved), or null for anon
  sources: z.array(scanSourceSchema).default([]),
  createdAt: z.string(),
});
export type ScanRequest = z.infer<typeof scanRequestSchema>;

export const scanJobSchema = z.object({
  id: z.string(),
  scanRequestId: z.string(),
  clientId: z.string().nullable(),
  status: scanJobStatusSchema.default("queued"),
  stage: scanStageSchema.default("requested"),
  attempts: z.number().int().nonnegative().default(0),
  maxAttempts: z.number().int().positive().default(3),
  lastInvocation: modelInvocationSchema.nullable().default(null),
  error: z.string().nullable().default(null), // typed failure, never swallowed
  queuedAt: z.string(),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
});
export type ScanJob = z.infer<typeof scanJobSchema>;

/* ---- OBSERVED FACTS (untrusted, provenance-carrying) ---------------------- */
export const scanEvidenceItemSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  domainKey: domainKeySchema.nullable().default(null),
  kind: z.string(), // "page", "meta", "lighthouse-metric", "review", …
  sourceUrl: z.string().max(2048).nullable().default(null), // provenance
  providerId: z.string(),
  observedAt: z.string(),
  trust: z.literal("untrusted").default("untrusted"), // crawled/searched content is never trusted input
  value: z.record(z.string(), z.unknown()).default({}), // normalized observation
  raw: z.string().nullable().default(null), // optional raw snippet, sanitized before use
});
export type ScanEvidenceItem = z.infer<typeof scanEvidenceItemSchema>;

export const competitorCandidateSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  name: z.string(),
  url: z.string().max(2048).nullable().default(null),
  discoverySource: z.string(), // which search/AI adapter surfaced it
  relevance: z.number().min(0).max(1).nullable().default(null),
  confirmed: z.boolean().default(false), // an operator confirms before it enters the report
});
export type CompetitorCandidate = z.infer<typeof competitorCandidateSchema>;

export const competitorBenchmarkSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  competitorId: z.string().nullable().default(null), // null = category benchmark
  domainKey: domainKeySchema,
  metric: z.string(), // "conversion_rate", "page_speed", …
  value: z.number(),
  unit: z.string().nullable().default(null),
  providerId: z.string(),
  observedAt: z.string(),
});
export type CompetitorBenchmark = z.infer<typeof competitorBenchmarkSchema>;

/* ---- AI INFERENCE (kept separate from observed facts) --------------------- */
export const domainDiagnosisSchema = z.object({
  domainKey: domainKeySchema,
  baselineScore: z.number().int().min(0).max(100).nullable().default(null),
  summary: z.string().max(2000),
  evidenceIds: z.array(z.string()).default([]), // links inference → observed facts
  benchmarkIds: z.array(z.string()).default([]),
  confidence: scanConfidenceSchema,
  isInference: z.literal(true).default(true), // this is model/heuristic output, not an observed fact
});
export type DomainDiagnosis = z.infer<typeof domainDiagnosisSchema>;

export const scanResultSchema = z.object({
  scanId: z.string(),
  index: z.number().int().min(0).max(100).nullable().default(null),
  diagnoses: z.array(domainDiagnosisSchema).default([]),
  confidence: scanConfidenceSchema,
  invocation: modelInvocationSchema.nullable().default(null),
  generatedAt: z.string(),
});
export type ScanResult = z.infer<typeof scanResultSchema>;

/* ---- entitlement + proposal ----------------------------------------------- */
export const reportEntitlementSchema = z.object({
  tier: entitlementTierSchema,
  canViewIndex: z.boolean(),
  canViewDomainDetail: z.boolean(),
  canViewEvidence: z.boolean(),
  canViewCompetitors: z.boolean(),
  canGenerateProposal: z.boolean(),
  redactedDomains: z.array(domainKeySchema).default([]),
});
export type ReportEntitlement = z.infer<typeof reportEntitlementSchema>;

export const proposalGenerationRequestSchema = z.object({
  id: z.string(),
  scanId: z.string(),
  clientId: z.string().nullable(),
  requestedBy: z.string(), // internal users.id — internal-only capability
  tier: entitlementTierSchema,
  sections: z.array(z.string()).default([]), // which report sections to include
  createdAt: z.string(),
});
export type ProposalGenerationRequest = z.infer<typeof proposalGenerationRequestSchema>;
