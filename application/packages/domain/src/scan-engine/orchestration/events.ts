/* =============================================================================
 * Orchestration · engine EVENTS (PDF 27 §18 — observable/measurable).
 *
 * Every job, call, and stage emits telemetry. These are the canonical engine
 * events as a discriminated union — the audit + observability substrate. Pure
 * data; a sink implementation (log/store) is out of scope for the skeleton.
 * ========================================================================== */

import type { EngineStage } from "@brightloop/schema";

interface Base {
  scanId: string;
  at: string; // ISO timestamp, supplied by the emitter (no clock in domain)
}

export type EngineEvent =
  | ({ type: "stage_started"; stage: EngineStage } & Base)
  | ({ type: "stage_completed"; stage: EngineStage; artifactId: string | null } & Base)
  | ({ type: "stage_failed"; stage: EngineStage; error: string; willRetry: boolean } & Base)
  | ({ type: "evidence_collected"; source: string; state: string; count: number } & Base)
  | ({ type: "index_computed"; value: number; coverage: number } & Base)
  | ({ type: "move_recommended"; moveId: string; tier: string } & Base)
  | ({ type: "provider_selected"; provider: string; task: string } & Base)
  | ({ type: "provider_failed_over"; from: string; to: string } & Base)
  | ({ type: "operator_override"; operatorId: string; detail: string } & Base);

export type EngineEventType = EngineEvent["type"];

/** A sink receives every emitted event (audit log, telemetry, store). */
export interface EngineEventSink {
  emit(event: EngineEvent): void;
}

/** No-op sink — a safe default; real sinks are wired at the composition root. */
export const nullEventSink: EngineEventSink = { emit: () => {} };
