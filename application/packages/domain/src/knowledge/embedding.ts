/* =============================================================================
 * Embedding provider PORT + job state machine (Phase E · Sprint E2).
 *
 * Embedding providers are SEPARATE from LLM providers. Every provider (OpenAI /
 * Gemini / future local) implements the same contract; business code never calls
 * an embedding SDK — it goes through this port. The embedding-job state machine is
 * PURE. Adapters (incl. a deterministic no-network default) live in `@brightloop/data`.
 * ========================================================================== */

import type { EmbeddingJob, EmbeddingJobStatus, EmbeddingProviderKind } from "@brightloop/schema";

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimensions: number;
  /** Total tokens the provider billed (estimate for the mock). */
  tokens: number;
}

export type EmbeddingOutcome =
  | { ok: true; value: EmbeddingResult }
  | { ok: false; reason: "network" | "timeout" | "rate_limit" | "provider_unavailable" | "invalid_input"; message: string; retryable: boolean };

/** The embedding provider contract. `embed` is io; the rest are pure/cheap probes. */
export interface EmbeddingProviderPort {
  readonly kind: EmbeddingProviderKind;
  /** Embed a batch of texts. Batch size is the caller's concern. */
  embed(texts: readonly string[], model?: string): Promise<EmbeddingOutcome>;
  /** The vector dimensionality for a model. */
  dimensions(model?: string): number;
  health(): Promise<"healthy" | "degraded" | "unavailable">;
  /** Estimated cost for embedding `tokenCount` tokens. */
  estimateCost(tokenCount: number, model?: string): number;
}

export type EmbeddingProviderRegistry = Partial<Record<EmbeddingProviderKind, EmbeddingProviderPort>>;

/* ---- job state machine ----------------------------------------------------- */

export const EMBEDDING_JOB_TRANSITIONS: Record<EmbeddingJobStatus, readonly EmbeddingJobStatus[]> = {
  pending: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: ["reindex"],
  failed: ["pending", "reindex"],
  reindex: ["processing", "failed"],
};
export function canTransitionJob(from: EmbeddingJobStatus, to: EmbeddingJobStatus): boolean {
  return EMBEDDING_JOB_TRANSITIONS[from].includes(to);
}

export interface BuildJobInput {
  id: string; documentId: string; documentVersion: number; collectionId: string;
  workspaceId: string; clientId: string | null; provider: EmbeddingProviderKind; model: string;
  strategy?: EmbeddingJob["strategy"]; now: string;
}
export function buildEmbeddingJob(input: BuildJobInput): EmbeddingJob {
  return {
    id: input.id, documentId: input.documentId, documentVersion: input.documentVersion, collectionId: input.collectionId,
    workspaceId: input.workspaceId, clientId: input.clientId, status: "pending", provider: input.provider, model: input.model,
    strategy: input.strategy ?? "paragraph_aware", chunkCount: 0, retryCount: 0, durationMs: 0, cost: 0, currency: "USD",
    error: null, version: 1, createdAt: input.now, updatedAt: input.now,
  };
}

export interface JobTransition { status: EmbeddingJobStatus; chunkCount?: number; durationMs?: number; cost?: number; error?: string | null; incrementRetry?: boolean; }
export type JobTransitionOutcome = { ok: true; value: EmbeddingJob } | { ok: false; reason: "illegal_transition" };

/** Apply a transition to an embedding job (bumps version). Pure. */
export function transitionJob(job: EmbeddingJob, patch: JobTransition, now: string): JobTransitionOutcome {
  if (!canTransitionJob(job.status, patch.status)) return { ok: false, reason: "illegal_transition" };
  return {
    ok: true,
    value: {
      ...job,
      status: patch.status,
      chunkCount: patch.chunkCount ?? job.chunkCount,
      durationMs: patch.durationMs ?? job.durationMs,
      cost: patch.cost ?? job.cost,
      error: patch.error === undefined ? job.error : patch.error,
      retryCount: patch.incrementRetry ? job.retryCount + 1 : job.retryCount,
      version: job.version + 1,
      updatedAt: now,
    },
  };
}
