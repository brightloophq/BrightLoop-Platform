/* =============================================================================
 * Scan engine — PROVIDER PORTS (interfaces only; no implementation).
 *
 * The domain layer speaks to external intelligence through these ports. Domain
 * services NEVER contain model-specific logic — a provider adapter (OpenAI,
 * Anthropic, Google, DeepSeek, a crawler vendor, a benchmark API) implements the
 * port and is selected at the composition root. One orchestrator contract with
 * STRUCTURED OUTPUT covers every LLM vendor.
 *
 * Everything here is deferred: no adapter is built in this task. These are the
 * seams the future engine plugs into.
 * ========================================================================== */

import type {
  ScanEvidenceItem,
  CompetitorCandidate,
  CompetitorBenchmark,
  DomainDiagnosis,
  ModelInvocation,
  ScanJob,
  ScanRequest,
  ScanSource,
} from "@brightloop/schema";

/** A structured-output request to an LLM. `schema` is a JSON Schema the provider
 *  must satisfy; the domain passes the shape it wants, never a raw prompt-only call. */
export interface OrchestrationRequest<T> {
  task: string; // stable task id, e.g. "diagnose-domain"
  system: string;
  input: unknown; // normalized evidence — NOT raw crawled HTML
  schema: unknown; // JSON Schema for the structured output
  /** Parses/validates the provider's raw structured output into T (e.g. a Zod parse). */
  parse: (raw: unknown) => T;
}

export interface OrchestrationResult<T> {
  output: T; // structured, validated
  invocation: ModelInvocation; // provider/model/version + token/latency metadata (audit)
}

/**
 * The single AI seam. Any vendor (OpenAI/Anthropic/Google/DeepSeek) implements
 * this; the domain is vendor-agnostic. Returns structured output + audit metadata.
 * Implementations MUST NOT return or persist hidden chain-of-thought.
 */
export interface AiOrchestrator {
  readonly provider: string;
  run<T>(request: OrchestrationRequest<T>): Promise<OrchestrationResult<T>>;
}

/** Fetches + returns UNTRUSTED evidence for a target. Adapter owns SSRF/private-network guards. */
export interface CrawlerProvider {
  readonly providerId: string;
  /** MUST reject private/link-local/loopback targets and enforce allow-lists. */
  crawl(source: ScanSource, scanId: string): Promise<ScanEvidenceItem[]>;
}

export interface SearchProvider {
  readonly providerId: string;
  discoverCompetitors(targetUrl: string, scanId: string): Promise<CompetitorCandidate[]>;
}

/** Performance/SEO/benchmark data. Observed facts, provenance attached by the adapter. */
export interface BenchmarkProvider {
  readonly providerId: string;
  benchmark(scanId: string, competitorUrls: string[]): Promise<CompetitorBenchmark[]>;
}

/** Turns normalized evidence + benchmarks into per-domain inference via the orchestrator. */
export interface DiagnosisSynthesizer {
  synthesize(input: { scanId: string; evidence: ScanEvidenceItem[]; benchmarks: CompetitorBenchmark[] }): Promise<DomainDiagnosis[]>;
}

/* ---- async job queue port ------------------------------------------------- */
export interface ScanJobQueue {
  enqueue(request: ScanRequest): Promise<ScanJob>;
  /** A worker claims the next job; returns null when the queue is empty. */
  claim(): Promise<ScanJob | null>;
  update(job: ScanJob): Promise<ScanJob>;
  get(jobId: string): Promise<ScanJob | null>;
}

/** Registry of the adapters wired at the composition root (all optional until built). */
export interface ScanProviderRegistry {
  orchestrator?: AiOrchestrator;
  crawler?: CrawlerProvider;
  search?: SearchProvider;
  benchmark?: BenchmarkProvider;
  synthesizer?: DiagnosisSynthesizer;
}
