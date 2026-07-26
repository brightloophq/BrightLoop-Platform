/* =============================================================================
 * Indexing use-cases (Phase E · Sprint E2).
 *
 * `queueEmbedding` records a pending job; `indexDocument` runs it: load the
 * document's chunks → embed via the provider port (batched) → persist embedding
 * vectors + upsert to the vector store → complete the job (chunk count, duration,
 * cost). On provider failure the job records `failed` with a retry increment.
 * Business logic never calls an embedding SDK — only the port.
 * ========================================================================== */

import { buildEmbeddingJob, transitionJob } from "@brightloop/domain";
import type { EmbeddingProviderKind, EmbeddingVector } from "@brightloop/schema";
import {
  authorize, requireKnowledge, requireEmbeddingProviders, requireVectorStore, KNOWLEDGE_EMBED_CAP, type AppContext,
} from "../context.js";
import { ConflictError, NotFoundError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { unwrap } from "../runtime-result.js";
import { requireId } from "../validate.js";
import { toEmbeddingJobDTO, type EmbeddingJobDTO } from "./dto.js";

export interface QueueEmbeddingInput { provider?: EmbeddingProviderKind; model?: string; }

export async function queueEmbedding(ctx: AppContext, rawDocumentId: unknown, input: QueueEmbeddingInput = {}): Promise<EmbeddingJobDTO> {
  const documentId = requireId(rawDocumentId, "documentId");
  const kb = requireKnowledge(ctx);
  const document = unwrap(await kb.documents.getById(documentId));
  if (document === null) throw new NotFoundError("document");
  authorize(ctx.actor, KNOWLEDGE_EMBED_CAP, document.clientId);
  if (document.status === "deleted") throw new ConflictError("Cannot embed a deleted document");

  const providers = requireEmbeddingProviders(ctx);
  const provider = input.provider ?? (Object.keys(providers)[0] as EmbeddingProviderKind | undefined);
  if (provider === undefined || providers[provider] === undefined) throw new RuntimeUnavailableError("No embedding provider is configured");
  const model = input.model ?? "text-embedding-3-small";
  const job = buildEmbeddingJob({ id: ctx.ids("kjob"), documentId, documentVersion: document.currentVersion, collectionId: document.collectionId, workspaceId: document.workspaceId, clientId: document.clientId, provider, model, now: ctx.clock() });
  unwrap(await kb.jobs.create(job));
  return toEmbeddingJobDTO(job);
}

export interface IndexDocumentOptions { sleep?: (ms: number) => Promise<void>; }

/** Run a queued (or reindex) embedding job to completion. */
export async function indexDocument(ctx: AppContext, rawJobId: unknown): Promise<EmbeddingJobDTO> {
  const jobId = requireId(rawJobId, "jobId");
  const kb = requireKnowledge(ctx);
  const providers = requireEmbeddingProviders(ctx);
  const vectorStore = requireVectorStore(ctx);

  const job = unwrap(await kb.jobs.getById(jobId));
  if (job === null) throw new NotFoundError("embedding job");
  authorize(ctx.actor, KNOWLEDGE_EMBED_CAP, job.clientId);
  const provider = providers[job.provider];
  if (provider === undefined) throw new RuntimeUnavailableError(`Embedding provider ${job.provider} is not configured`);

  // pending | reindex | failed → processing
  const toProcessing = transitionJob(job, { status: "processing" }, ctx.clock());
  if (!toProcessing.ok) throw new ConflictError(`Cannot process a ${job.status} job`);
  const processing = unwrap(await kb.jobs.save(toProcessing.value, job.version));

  const chunks = unwrap(await kb.chunks.listByDocument(job.documentId));
  if (chunks.length === 0) throw new ValidationError("The document has no chunks to embed");

  const startedAt = ctx.clock();
  const outcome = await provider.embed(chunks.map((c) => c.content), job.model);
  if (!outcome.ok) {
    const failed = transitionJob(processing, { status: "failed", error: outcome.message, incrementRetry: true }, ctx.clock());
    if (failed.ok) unwrap(await kb.jobs.save(failed.value, processing.version));
    throw new RuntimeUnavailableError(`Embedding failed: ${outcome.message}`);
  }

  const now = ctx.clock();
  const vectors: EmbeddingVector[] = chunks.map((chunk, i) => ({
    id: ctx.ids("kvec"), chunkId: chunk.id, documentId: chunk.documentId, collectionId: chunk.collectionId,
    workspaceId: chunk.workspaceId, clientId: chunk.clientId, provider: job.provider, model: outcome.value.model,
    dimensions: outcome.value.dimensions, embedding: outcome.value.vectors[i] ?? [], createdAt: now,
  }));
  // Replace any prior vectors for this document, then store the fresh set.
  unwrap(await kb.vectors.deleteByDocument(job.documentId));
  unwrap(await kb.vectors.appendMany(vectors));
  await vectorStore.upsert(vectors);

  const durationMs = Math.max(0, Date.parse(now) - Date.parse(startedAt));
  const cost = provider.estimateCost(outcome.value.tokens, job.model);
  const completed = transitionJob(processing, { status: "completed", chunkCount: vectors.length, durationMs, cost }, now);
  if (!completed.ok) throw new ConflictError("Job could not be completed");
  return toEmbeddingJobDTO(unwrap(await kb.jobs.save(completed.value, processing.version)));
}
