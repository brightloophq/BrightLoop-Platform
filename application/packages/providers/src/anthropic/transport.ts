/* =============================================================================
 * Anthropic transport (Phase C · Sprint C2 §2).
 *
 * The ONLY module that imports the Anthropic SDK. Everything above it speaks the
 * narrow `AnthropicTransport` interface — no SDK object, type, or raw response
 * ever crosses this boundary. That containment is what keeps the domain and
 * application layers free of vendor coupling.
 *
 * Responsibilities: send a request, receive a response, surface the metadata
 * normalization needs (usage, model, stop reason, request id), support timeout
 * and cancellation via an `AbortSignal`, and classify transport/protocol errors
 * into a stable `TransportError` category — WITHOUT ever placing a secret-bearing
 * header or request body into an error.
 * ========================================================================== */

import Anthropic from "@anthropic-ai/sdk";

/** A transport-level request. Plain data — no SDK types. */
export interface TransportRequest {
  model: string;
  system: string;
  userContent: string;
  maxOutputTokens: number;
  /** Hard per-call timeout the SDK enforces in addition to the abort signal. */
  timeoutMs: number;
  /** Aborts the in-flight request; the adapter owns it and decides the reason. */
  signal: AbortSignal;
  /** Correlation metadata passed through where the provider supports it. */
  metadata?: { traceId?: string };
}

/** A normalized transport response. The raw SDK response never leaves this file. */
export interface TransportResult {
  /** The concatenated text content — untrusted until the adapter/domain validate it. */
  text: string;
  stopReason: string | null;
  usage: { inputTokens?: number; outputTokens?: number };
  model: string;
  /** A safe reference (the provider request id), never the response content. */
  requestId: string | null;
  latencyMs: number;
}

/** Stable transport error categories, mapped to failure kinds in `errors.ts`. */
export type TransportErrorCategory =
  | "authentication"
  | "permission"
  | "invalid_request"
  | "context_too_large"
  | "rate_limit"
  | "overloaded"
  | "server_error"
  | "timeout"
  | "aborted"
  | "network"
  | "malformed_response"
  | "unknown";

/**
 * A sanitized transport error. Carries only a category, an HTTP status, and a
 * SAFE message (never the request body, headers, or the API key). Retry-after is
 * surfaced when the provider returns it.
 */
export class TransportError extends Error {
  readonly category: TransportErrorCategory;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  constructor(category: TransportErrorCategory, message: string, status: number | null = null, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "TransportError";
    this.category = category;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface AnthropicTransport {
  /** Send one message request. Throws `TransportError` on any failure. */
  send(request: TransportRequest): Promise<TransportResult>;
  /** A lightweight liveness probe — never a full reasoning call. */
  health(timeoutMs: number): Promise<{ ok: boolean; category: TransportErrorCategory | null }>;
}

export interface RealTransportOptions {
  apiKey: string;
  baseUrl: string;
  apiVersion: string;
  model: string;
  /** Monotonic-ish clock reading in ms, injected for deterministic latency in tests. */
  nowMs?: () => number;
}

/** A minimal shape for the SDK error fields we read — avoids leaking SDK types outward. */
interface SdkErrorLike {
  status?: number;
  headers?: Record<string, string> | Headers;
  error?: { error?: { type?: string; message?: string } };
}

function retryAfterFrom(err: SdkErrorLike): number | null {
  const h = err.headers;
  const raw = h instanceof Headers ? h.get("retry-after") : h?.["retry-after"];
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Translate an SDK error into a sanitized `TransportError`. Reads only the status
 * and the provider's error `type` — never the request that produced it, so no
 * secret-bearing header or body can escape.
 */
export function classifySdkError(err: unknown): TransportError {
  if (err instanceof Anthropic.APIUserAbortError) {
    return new TransportError("aborted", "request aborted");
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new TransportError("timeout", "request timed out");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new TransportError("network", "network connection failed");
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return new TransportError("authentication", "authentication failed", 401);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new TransportError("permission", "permission denied", 403);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new TransportError("rate_limit", "rate limited", 429, retryAfterFrom(err as unknown as SdkErrorLike));
  }
  if (err instanceof Anthropic.BadRequestError) {
    const type = (err as unknown as SdkErrorLike).error?.error?.type ?? "";
    // Context/length overflow surfaces as a 400 with a request-too-large flavour.
    const tooLarge = /too.?large|exceed|context|token/i.test((err as Error).message ?? "");
    return new TransportError(tooLarge || type === "request_too_large" ? "context_too_large" : "invalid_request", "invalid request", 400);
  }
  if (err instanceof Anthropic.InternalServerError) {
    const status = (err as unknown as SdkErrorLike).status ?? 500;
    return new TransportError(status === 529 ? "overloaded" : "server_error", "provider server error", status);
  }
  if (err instanceof Anthropic.APIError) {
    return new TransportError("unknown", "provider API error", (err as unknown as SdkErrorLike).status ?? null);
  }
  return new TransportError("unknown", "unexpected transport error");
}

/** The production transport. Wraps the official SDK; contains every SDK type. */
export class SdkAnthropicTransport implements AnthropicTransport {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly nowMs: () => number;

  constructor(opts: RealTransportOptions) {
    // The key is handed straight to the SDK and never stored on `this`.
    this.client = new Anthropic({ apiKey: opts.apiKey, baseURL: opts.baseUrl });
    this.model = opts.model;
    this.nowMs = opts.nowMs ?? (() => Date.now());
  }

  async send(request: TransportRequest): Promise<TransportResult> {
    const startedAt = this.nowMs();
    try {
      // `.withResponse()` gives the typed provider request id alongside the body.
      const { data: response, request_id } = await this.client.messages
        .create(
          {
            model: request.model,
            max_tokens: request.maxOutputTokens,
            system: request.system,
            messages: [{ role: "user", content: request.userContent }],
            ...(request.metadata?.traceId ? { metadata: { user_id: request.metadata.traceId } } : {}),
          },
          { signal: request.signal, timeout: request.timeoutMs },
        )
        .withResponse();

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        text,
        stopReason: response.stop_reason ?? null,
        usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        model: response.model,
        requestId: request_id ?? null,
        latencyMs: Math.max(0, this.nowMs() - startedAt),
      };
    } catch (err) {
      throw classifySdkError(err);
    }
  }

  async health(timeoutMs: number): Promise<{ ok: boolean; category: TransportErrorCategory | null }> {
    try {
      // Lightweight liveness: a Models API lookup, NOT a reasoning call — it
      // exercises auth + connectivity without spending output tokens.
      await this.client.models.retrieve(this.model, undefined, { timeout: timeoutMs });
      return { ok: true, category: null };
    } catch (err) {
      return { ok: false, category: classifySdkError(err).category };
    }
  }
}
