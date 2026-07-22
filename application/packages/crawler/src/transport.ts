/* =============================================================================
 * HTTP transport (Phase C · Sprint C3 §5) — the narrow fetch seam.
 *
 * A single-hop transport: it performs ONE request and returns a normalized,
 * bounded response. It does NOT follow redirects (the fetcher re-checks SSRF on
 * every hop and drives the chain), send cookies, or attach credentials. The body
 * is read with a hard byte cap so an oversized response can never exhaust memory.
 *
 * The interface is transport-agnostic so tests inject a scripted fake and never
 * touch the network. `FetchHttpTransport` is the production adapter over Node's
 * global `fetch`.
 * ========================================================================== */

/** A single HTTP request. Only GET is supported this sprint (no auth, no body). */
export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  /** Hard cap on bytes read from the body before the response is rejected. */
  maxBytes: number;
}

/** A normalized single-hop response. `redirectLocation` is set for a 3xx. */
export interface HttpResponse {
  requestedUrl: string;
  status: number;
  /** Lower-cased, SAFE headers only (never set-cookie / authorization). */
  headers: Record<string, string>;
  contentType: string | null;
  bytes: number;
  /** Decoded text body (UTF-8), already truncated to `maxBytes`. Empty on non-text. */
  body: string;
  truncated: boolean;
  /** The `Location` header for a 3xx redirect, else null. */
  redirectLocation: string | null;
  /** Measured fetch duration; scripted (often 0) under a fake transport. */
  durationMs: number;
}

/** A transport error the fetcher classifies (dns / tls / timeout / connect). */
export interface HttpTransportError {
  kind: "timeout" | "dns" | "tls" | "connect" | "aborted" | "unknown";
  message: string;
}

export type HttpFetchResult =
  | { ok: true; response: HttpResponse }
  | { ok: false; error: HttpTransportError };

export interface HttpTransport {
  fetch(request: HttpRequest): Promise<HttpFetchResult>;
}

/* ---- production adapter ---------------------------------------------------- */

/** Response headers we retain — never cookies or authorization material. */
const SAFE_RESPONSE_HEADERS = new Set([
  "content-type",
  "content-length",
  "last-modified",
  "etag",
  "location",
  "server",
  "cache-control",
  "content-security-policy",
  "strict-transport-security",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
]);

function classifyError(cause: unknown): HttpTransportError {
  const message = cause instanceof Error ? cause.message : String(cause);
  const lower = message.toLowerCase();
  if (cause instanceof Error && cause.name === "AbortError") return { kind: "timeout", message: "request timed out" };
  if (lower.includes("enotfound") || lower.includes("eai_again") || lower.includes("getaddrinfo")) return { kind: "dns", message: "dns resolution failed" };
  if (lower.includes("cert") || lower.includes("tls") || lower.includes("ssl")) return { kind: "tls", message: "tls handshake failed" };
  if (lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("timeout")) return { kind: "connect", message: "connection failed" };
  return { kind: "unknown", message: "fetch failed" };
}

/**
 * Production transport over Node's global `fetch`. Single hop
 * (`redirect: "manual"`), UTF-8 decode, streamed read with a byte cap, timeout
 * via `AbortController`. Never sends cookies or credentials.
 */
export class FetchHttpTransport implements HttpTransport {
  async fetch(request: HttpRequest): Promise<HttpFetchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    const startedAt = Date.now();
    try {
      const res = await fetch(request.url, {
        method: "GET",
        headers: request.headers,
        redirect: "manual",
        signal: controller.signal,
        // Never attach ambient credentials/cookies.
        credentials: "omit",
        referrerPolicy: "no-referrer",
      });

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
      });
      const contentType = headers["content-type"] ?? null;

      const { body, bytes, truncated } = await readCapped(res, request.maxBytes);

      return {
        ok: true,
        response: {
          requestedUrl: request.url,
          status: res.status,
          headers,
          contentType,
          bytes,
          body,
          truncated,
          redirectLocation: headers["location"] ?? null,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (cause) {
      return { ok: false, error: classifyError(cause) };
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Read a response body as UTF-8, stopping once `maxBytes` is reached. */
async function readCapped(res: Response, maxBytes: number): Promise<{ body: string; bytes: number; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (reader === undefined) return { body: "", bytes: 0, truncated: false };

  const decoder = new TextDecoder("utf-8", { fatal: false });
  const chunks: string[] = [];
  let bytes = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value === undefined) continue;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      const room = value.byteLength - (bytes - maxBytes);
      if (room > 0) chunks.push(decoder.decode(value.subarray(0, room), { stream: true }));
      truncated = true;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(decoder.decode(value, { stream: true }));
  }
  chunks.push(decoder.decode());
  return { body: chunks.join(""), bytes: Math.min(bytes, maxBytes), truncated };
}
