/* =============================================================================
 * Provider execution contract + adapter boundary (Sprint 7 §1/§2/§8 · AIS-001 §13).
 *
 * The runtime seam between the deterministic orchestrator and a concrete provider.
 * Adapters expose OPAQUE ids and declare capabilities; the domain never names a
 * vendor and never contains model-specific logic. Everything here is an interface
 * or a pure runtime primitive (cancellation token, typed error) — no SDK, no I/O.
 * ========================================================================== */

import type {
  ProviderCapability,
  HealthStatus,
  TokenEstimate,
  ExecutionRequest,
  ExecutionEvent,
  FinishReason,
  ModelMetadata,
  ReasoningFailureKind,
  CancellationSource,
} from "@brightloop/schema";

/* ---- cancellation token (§8) ---------------------------------------------- */
/** Mutable runtime signal shared with an in-flight execution. Pure primitive. */
export interface CancellationToken {
  cancelled: boolean;
  source: CancellationSource | null;
}

export function newCancellationToken(): CancellationToken {
  return { cancelled: false, source: null };
}

/** Idempotently mark a token cancelled — the FIRST source wins (deterministic). */
export function cancel(token: CancellationToken, source: CancellationSource): void {
  if (token.cancelled) return;
  token.cancelled = true;
  token.source = source;
}

/* ---- execution control (per-call runtime context) ------------------------- */
export interface ExecutionControl {
  signal: CancellationToken;
  timeoutMs: number; // hard per-attempt timeout ceiling
  deadline: string | null; // absolute ISO deadline for the whole job
  now: string; // supplied clock reading — determinism, no wall clock in domain
  /** Optional progress sink — the adapter/orchestrator may stream runtime-safe events. */
  onProgress?: (event: ExecutionEvent) => void;
}

/* ---- raw provider output (pre-validation, untrusted) ---------------------- */
/**
 * What an adapter returns from a successful call. `output` is UNTRUSTED until the
 * orchestrator validates it against the requested schema + grounding guards. Usage
 * is optional — a provider that omits it triggers the estimated-usage fallback.
 */
export interface RawProviderOutput {
  output: unknown;
  finishReason: FinishReason;
  usage: { inputTokens?: number; outputTokens?: number };
  latencyMs: number;
  model: ModelMetadata;
  warnings?: string[];
  /** A reference/pointer to the stored raw response — NEVER the raw content itself. */
  rawResponseRef?: string;
}

/* ---- typed failure (§6 retry classification) ------------------------------ */
/**
 * SAFE failure telemetry an adapter may attach to a `ProviderExecutionError`.
 * Classification + counts ONLY — never raw output, prompts, evidence, or secrets.
 * Every field is optional/nullable when the value is unavailable.
 */
export interface ProviderExecutionTelemetry {
  /** The provider's raw stop-reason string (a fixed enum value, e.g. "max_tokens"). */
  stopReason?: string | null;
  /** How the output parser resolved the body: invalid_json | non_object_json. */
  parserOutcome?: string | null;
  /** The adapter's stable error classification (category), never a raw message. */
  providerErrorCode?: string | null;
  /** Character length of the response body (a count, never the body). */
  responseLength?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
}

/** A provider failure carrying its retry classification. Thrown by adapters. */
export class ProviderExecutionError extends Error {
  readonly kind: ReasoningFailureKind;
  readonly finishReason: FinishReason;
  /** Safe telemetry about the failure (classification + counts only), or null. */
  readonly telemetry: ProviderExecutionTelemetry | null;
  constructor(kind: ReasoningFailureKind, message: string, finishReason: FinishReason = "error", telemetry: ProviderExecutionTelemetry | null = null) {
    super(message);
    this.name = "ProviderExecutionError";
    this.kind = kind;
    this.finishReason = finishReason;
    this.telemetry = telemetry;
  }
}

export interface ProviderHealthReport {
  providerId: string;
  status: HealthStatus;
  detail: string | null;
}

/* ---- 1/2 · the provider adapter boundary ---------------------------------- */
/**
 * A provider adapter. Implemented per vendor at the composition root; the domain
 * depends only on this interface. Must declare capabilities, health, structured-
 * output support, token estimation, execution, cancellation, timeout, and usage.
 * `execute` throws `ProviderExecutionError` (classified) on failure, honours the
 * cancellation token + timeout, and returns untrusted `RawProviderOutput`.
 */
export interface ReasoningProviderAdapter {
  readonly providerId: string; // opaque
  capabilities(): ProviderCapability[];
  supportsStructuredOutput(): boolean;
  healthCheck(): Promise<ProviderHealthReport>;
  estimateTokens(request: ExecutionRequest): TokenEstimate;
  execute(request: ExecutionRequest, control: ExecutionControl): Promise<RawProviderOutput>;
}

/** True when the adapter declares every capability the request/job requires. Pure. */
export function adapterMeetsCapabilities(adapter: ReasoningProviderAdapter, required: readonly ProviderCapability[]): boolean {
  const have = new Set(adapter.capabilities());
  return required.every((c) => have.has(c));
}
