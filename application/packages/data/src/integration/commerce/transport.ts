/* =============================================================================
 * Commerce connectors — HTTP transport seam (F4.4). SERVER-ONLY.
 *
 * The ONLY place a Shopify/Stripe/PayPal network call is made. A narrow interface
 * so every test injects a deterministic fake transport (no network, no SDK). The
 * real `FetchCommerceHttpTransport` does one hop over Node's global fetch with a
 * hard timeout, sends no ambient credentials/referrer, bounds the body, and returns
 * the raw status + body for the caller to normalize (it does not throw on HTTP
 * errors). Mirrors the F4.2/F4.3 transport shape exactly.
 * ========================================================================== */

export interface CommerceHttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  /** Serialized request body (already stringified). */
  body?: string;
  timeoutMs: number;
}

export interface CommerceHttpResponse {
  status: number;
  headers: Record<string, string>;
  /** Response body as text (bounded by the caller). Never a stream. */
  body: string;
}

export interface CommerceHttpTransport {
  request(req: CommerceHttpRequest): Promise<CommerceHttpResponse>;
}

/** Thrown only for TRANSPORT failures (network/timeout) — never for HTTP status. */
export class CommerceTransportError extends Error {
  constructor(readonly kind: "network" | "timeout", message: string) {
    super(message);
    this.name = "CommerceTransportError";
  }
}

const MAX_BODY_BYTES = 5_000_000;

/** The production transport: one fetch hop, hard timeout, bounded body. */
export function createFetchCommerceTransport(): CommerceHttpTransport {
  return {
    async request(req: CommerceHttpRequest): Promise<CommerceHttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          redirect: "manual",
          signal: controller.signal,
          // Never send ambient credentials or a referrer to the provider.
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        const reader = res.body?.getReader();
        let text = "";
        if (reader) {
          const decoder = new TextDecoder();
          let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BODY_BYTES) { controller.abort(); break; }
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
        } else {
          text = await res.text();
        }
        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        return { status: res.status, headers, body: text };
      } catch (err) {
        const isAbort = err instanceof Error && err.name === "AbortError";
        throw new CommerceTransportError(isAbort ? "timeout" : "network", isAbort ? "request timed out" : "network error");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
