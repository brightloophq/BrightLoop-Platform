/* =============================================================================
 * EventService (Phase B · Sprint 13C) — the ONLY way a service emits.
 *
 * Runtime events are APPEND-ONLY. This service exposes no update and no delete,
 * mirroring `RuntimeEventRepository`, which itself mirrors a database that has
 * UPDATE/DELETE revoked plus an immutability trigger. Three layers, same rule.
 *
 * Sequence allocation belongs to the repository (it is a concurrency concern);
 * this service owns the VOCABULARY and the payload discipline.
 * ========================================================================== */

import type { RuntimeEvent } from "@brightloop/schema";
import type { ListEventsQuery, RuntimeEventRepository } from "../repository.js";
import type { RuntimeResult } from "../results.js";
import { AGGREGATE, type RuntimeEventName, type RuntimeServiceContext } from "./support.js";

export interface EmitInput {
  eventType: RuntimeEventName;
  aggregateType: string;
  aggregateId: string;
  clientId: string | null;
  runId?: string | null;
  scanId?: string | null;
  stage?: string | null;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  causationId?: string | null;
}

export class EventService {
  constructor(
    private readonly repo: RuntimeEventRepository,
    private readonly ctx: RuntimeServiceContext,
  ) {}

  /**
   * Append one event. The repository allocates the next per-aggregate sequence,
   * so ordering is decided by the database rather than by a racy read-then-write
   * in application code.
   */
  async emit(input: EmitInput): Promise<RuntimeResult<RuntimeEvent>> {
    return this.repo.appendRuntimeEvent({
      event: {
        id: this.ctx.ids("evt"),
        eventType: input.eventType,
        runId: input.runId ?? null,
        stage: input.stage ?? null,
        aggregateId: input.aggregateId,
        aggregateType: input.aggregateType,
        clientId: input.clientId,
        scanId: input.scanId ?? null,
        payload: input.payload ?? {},
        occurredAt: this.ctx.clock(),
        correlationId: input.correlationId ?? null,
        causationId: input.causationId ?? null,
        actor: this.ctx.actorId ?? null,
        schemaVersion: "1.0",
      },
    });
  }

  /** Convenience: an event about a run, sequenced on the run aggregate. */
  async emitRunEvent(
    eventType: RuntimeEventName,
    run: { id: string; clientId: string | null; scanId: string },
    payload: Record<string, unknown> = {},
    stage: string | null = null,
  ): Promise<RuntimeResult<RuntimeEvent>> {
    return this.emit({
      eventType,
      aggregateType: AGGREGATE.run,
      aggregateId: run.id,
      clientId: run.clientId,
      runId: run.id,
      scanId: run.scanId,
      stage,
      payload,
    });
  }

  /** The ordered event log for one aggregate — the Runtime Event Timeline source. */
  async list(query: ListEventsQuery): Promise<RuntimeResult<RuntimeEvent[]>> {
    return this.repo.listRuntimeEvents(query);
  }
}
