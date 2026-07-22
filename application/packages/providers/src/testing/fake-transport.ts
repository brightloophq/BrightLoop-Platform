/* =============================================================================
 * FakeAnthropicTransport (Phase C · Sprint C2 §15) — deterministic test double.
 *
 * Implements `AnthropicTransport` with no SDK and no network, so the adapter's
 * translation, normalization, classification, cancellation, and timeout can be
 * tested reproducibly. A scripted queue drives outcomes; the last step repeats.
 *
 * It is abort-aware: in `awaitAbort` mode it rejects the moment the adapter's
 * `AbortSignal` fires, which is how the in-flight cancellation/timeout paths are
 * exercised without real timers doing the work.
 * ========================================================================== */

import { TransportError, type AnthropicTransport, type TransportErrorCategory, type TransportRequest, type TransportResult } from "../anthropic/transport.js";

export interface ScriptedTransportReturn {
  text: string;
  stopReason?: string | null;
  usage?: { inputTokens?: number; outputTokens?: number };
  model?: string;
  requestId?: string | null;
  latencyMs?: number;
}
export interface ScriptedTransportThrow {
  throw: TransportErrorCategory;
  status?: number | null;
}
/** Reject when the request's signal aborts (exercises in-flight cancel/timeout). */
export interface ScriptedTransportAwaitAbort {
  awaitAbort: true;
}
export type ScriptedTransportStep = ScriptedTransportReturn | ScriptedTransportThrow | ScriptedTransportAwaitAbort;

export interface FakeTransportOptions {
  script?: ScriptedTransportStep[];
  health?: { ok: boolean; category: TransportErrorCategory | null };
}

export class FakeAnthropicTransport implements AnthropicTransport {
  readonly sent: TransportRequest[] = [];
  private readonly script: ScriptedTransportStep[];
  private readonly healthResult: { ok: boolean; category: TransportErrorCategory | null };
  private index = 0;

  constructor(options: FakeTransportOptions = {}) {
    this.script = options.script ?? [{ text: "{}" }];
    this.healthResult = options.health ?? { ok: true, category: null };
  }

  async send(request: TransportRequest): Promise<TransportResult> {
    this.sent.push(request);
    const step = this.script[Math.min(this.index, this.script.length - 1)]!;
    this.index += 1;

    if ("throw" in step) {
      throw new TransportError(step.throw, `scripted ${step.throw}`, step.status ?? null);
    }
    if ("awaitAbort" in step) {
      return new Promise<TransportResult>((_resolve, reject) => {
        if (request.signal.aborted) return reject(new TransportError("aborted", "aborted"));
        request.signal.addEventListener("abort", () => reject(new TransportError("aborted", "aborted")), { once: true });
      });
    }
    return {
      text: step.text,
      stopReason: step.stopReason ?? "end_turn",
      usage: step.usage ?? { inputTokens: 100, outputTokens: 40 },
      model: step.model ?? "claude-opus-4-8",
      requestId: step.requestId ?? "req_test_1",
      latencyMs: step.latencyMs ?? 12,
    };
  }

  async health(): Promise<{ ok: boolean; category: TransportErrorCategory | null }> {
    return this.healthResult;
  }
}
