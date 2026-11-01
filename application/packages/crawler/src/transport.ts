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
  /**
   * The machine code behind `kind`, when Node gave one.
   *
   * `kind` alone is too coarse to act on: UND_ERR_CONNECT_TIMEOUT (the TCP
   * connection never completed — the host is not answering us) and
   * UND_ERR_HEADERS_TIMEOUT (it accepted the connection and then sent nothing)
   * are both "timeout" and mean entirely different things. Empty when the
   * failure carried no code.
   */
  code: string;
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

/**
 * Why a fetch failed, read from the error Node actually throws.
 *
 * This used to inspect only the top-level `message`, which for `fetch` is the
 * fixed string "fetch failed" — undici puts the real failure on `cause`. So
 * none of the dns / tls / connect branches could ever match in production and
 * EVERY transport failure classified as `unknown`, which is what the crawl
 * surfaced: nine pages, nine "unknown", no reason to act on.
 *
 * The chain is walked because the real error can be nested more than one level,
 * and an `AggregateError` is unwrapped because a host with several A records
 * fails once PER ADDRESS — the aggregate's own message says nothing.
 *
 * `code` is consulted before `message`: `ENOTFOUND`/`UND_ERR_CONNECT_TIMEOUT`
 * are stable identifiers, while messages are prose and change between Node
 * releases.
 */
function collectCauses(cause: unknown, depth = 0): { code: string; message: string }[] {
  // Depth-capped: `cause` chains can be circular, and a runaway walk in the
  // crawler's hot path is a worse failure than an unclassified error.
  if (depth > 8 || cause === null || cause === undefined) return [];

  if (cause instanceof AggregateError) {
    const out = [{ code: readCode(cause), message: cause.message }];
    for (const inner of cause.errors ?? []) out.push(...collectCauses(inner, depth + 1));
    return out;
  }

  if (cause instanceof Error) {
    return [
      { code: readCode(cause), message: cause.message },
      ...collectCauses((cause as { cause?: unknown }).cause, depth + 1),
    ];
  }

  return [{ code: "", message: String(cause) }];
}

function readCode(error: unknown): string {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : "";
}

/** DNS could not resolve the host. */
const DNS_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "EAI_NODATA", "EAI_NONAME"]);
/** The certificate or handshake was rejected. */
const TLS_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "EPROTO",
]);
/** The connection itself never came up or was dropped. */
const CONNECT_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_SOCKET",
  "ERR_SOCKET_CONNECTION_TIMEOUT",
]);
/** Undici gave up waiting — distinct from our own AbortController timeout. */
const TIMEOUT_CODES = new Set([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "ETIMEDOUT",
]);

export function classifyError(cause: unknown): HttpTransportError {
  // Our own timeout is signalled by name, not by any message, and outranks the
  // rest: when we abort, whatever the socket reports afterwards is a
  // consequence of the abort rather than the reason for it.
  if (cause instanceof Error && cause.name === "AbortError") {
    // OUR abort, at the configured timeoutMs — distinct from undici giving up.
    return { kind: "timeout", message: "request timed out", code: "CRAWLER_TIMEOUT" };
  }

  const links = collectCauses(cause);

  for (const { code, message } of links) {
    const lower = message.toLowerCase();

    if (TIMEOUT_CODES.has(code) || lower.includes("timeout") || lower.includes("timed out")) {
      return { kind: "timeout", message: detail("request timed out", code, message), code };
    }
    if (DNS_CODES.has(code) || lower.includes("getaddrinfo") || lower.includes("enotfound") || lower.includes("eai_again")) {
      return { kind: "dns", message: detail("dns resolution failed", code, message), code };
    }
    if (TLS_CODES.has(code) || lower.includes("cert") || lower.includes("tls") || lower.includes("ssl") || lower.includes("handshake")) {
      return { kind: "tls", message: detail("tls handshake failed", code, message), code };
    }
    if (CONNECT_CODES.has(code) || lower.includes("econnrefused") || lower.includes("econnreset") || lower.includes("socket")) {
      return { kind: "connect", message: detail("connection failed", code, message), code };
    }
  }

  // Genuinely unrecognised. Carry the deepest real message rather than the
  // outer "fetch failed", so an operator has something to search for.
  const deepest = links.filter((l) => l.message && l.message !== "fetch failed").pop();
  return {
    kind: "unknown",
    message: deepest ? detail("fetch failed", deepest.code, deepest.message) : "fetch failed",
    code: deepest?.code ?? "",
  };
}

/** "dns resolution failed (ENOTFOUND: getaddrinfo ENOTFOUND example.com)" */
function detail(summary: string, code: string, message: string): string {
  const inner = code && message ? `${code}: ${message}` : code || message;
  return inner ? `${summary} (${inner})` : summary;
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
