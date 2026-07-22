/* =============================================================================
 * ProviderAttemptService (Phase B · Sprint 13C) — the provider ledger.
 *
 * Records WHAT HAPPENED on each attempt: which opaque provider, how long, what
 * it cost, how many tokens, whether usage was estimated or measured, and how it
 * ended.
 *
 * IT NEVER RECORDS THE MODEL'S OUTPUT. `rawResponseRef` is a reference to
 * storage held elsewhere — the table has no column for completion text, so raw
 * output and chain-of-thought are structurally unstorable rather than merely
 * discouraged. The input type below deliberately offers no field for them.
 * ========================================================================== */

import type {
  RuntimeProviderAttempt,
  RuntimeProviderAttemptStatus,
  RuntimeRetryDisposition,
} from "@brightloop/schema";
import type { ProviderAttemptRepository } from "../repository.js";
import type { RuntimeResult } from "../results.js";
import type { EventService } from "./event.service.js";
import { AGGREGATE, providerAttemptKey, RUNTIME_EVENTS, type RuntimeServiceContext } from "./support.js";

export interface RecordAttemptInput {
  reasoningJobId: string;
  runId: string;
  clientId: string | null;
  scanId: string;
  /** Opaque id. Domain code never branches on a vendor name. */
  providerId: string;
  attempt: number;
  status: RuntimeProviderAttemptStatus;
  retryDisposition?: RuntimeRetryDisposition | null;
  latencyMs?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  usageEstimated?: boolean;
  /** A REFERENCE to stored raw output. Never the output itself. */
  rawResponseRef?: string | null;
  lastError?: string | null;
}

export class ProviderAttemptService {
  constructor(
    private readonly repo: ProviderAttemptRepository,
    private readonly events: EventService,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Append an attempt. Keyed on (job, attempt), so a retry that re-reports the
   * same attempt number replays instead of inflating the cost ledger — which
   * matters, because these rows are what budget accounting reads.
   */
  async record(input: RecordAttemptInput): Promise<RuntimeResult<RuntimeProviderAttempt>> {
    const record: RuntimeProviderAttempt = {
      id: this.ctx.ids("pa"),
      reasoningJobId: input.reasoningJobId,
      runId: input.runId,
      clientId: input.clientId,
      scanId: input.scanId,
      providerId: input.providerId,
      attempt: input.attempt,
      status: input.status,
      retryDisposition: input.retryDisposition ?? null,
      latencyMs: input.latencyMs ?? null,
      estimatedCost: input.estimatedCost ?? null,
      actualCost: input.actualCost ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      usageEstimated: input.usageEstimated ?? true,
      rawResponseRef: input.rawResponseRef ?? null,
      lastError: input.lastError ?? null,
      idempotencyKey: providerAttemptKey(input.reasoningJobId, input.attempt),
      createdAt: this.ctx.clock(),
    };

    const result = await this.repo.recordProviderAttempt(record);
    if (result.ok && result.code === "created") {
      await this.events.emit({
        eventType: RUNTIME_EVENTS.providerAttempted,
        aggregateType: AGGREGATE.reasoning,
        aggregateId: input.reasoningJobId,
        clientId: input.clientId,
        runId: input.runId,
        scanId: input.scanId,
        // provider id and outcome only — no response content of any kind
        payload: { providerId: input.providerId, attempt: input.attempt, status: input.status },
      });
    }
    return result;
  }

  async list(reasoningJobId: string): Promise<RuntimeResult<RuntimeProviderAttempt[]>> {
    return this.repo.listProviderAttempts(reasoningJobId);
  }

  /**
   * Total spend recorded for a job. Prefers measured `actualCost` and falls back
   * to `estimatedCost`, so budget accounting degrades gracefully when a provider
   * does not report usage.
   */
  async totalCost(reasoningJobId: string): Promise<RuntimeResult<number>> {
    const listed = await this.repo.listProviderAttempts(reasoningJobId);
    if (!listed.ok) return listed;
    const total = listed.value.reduce((sum, a) => sum + (a.actualCost ?? a.estimatedCost ?? 0), 0);
    return { ok: true, code: "found", value: total };
  }
}
