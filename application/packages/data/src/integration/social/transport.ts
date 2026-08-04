/* =============================================================================
 * Social connectors — HTTP transport seam (F4.7). SERVER-ONLY.
 *
 * The ONLY place a Meta / LinkedIn / X / TikTok network call is made. A narrow
 * interface so every test injects a deterministic fake transport (no network, no SDK).
 * The real `FetchSocialTransport` does one hop over Node's global fetch with a hard
 * timeout and a bounded body; it returns raw status + body for the client to normalize.
 * Mirrors the F4.3/F4.4/F4.5/F4.6 transport seams exactly.
 * ========================================================================== */

export interface SocialHttpRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}
export interface SocialHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}
export interface SocialHttpTransport {
  request(req: SocialHttpRequest): Promise<SocialHttpResponse>;
}

/** Thrown only for TRANSPORT failures (network/timeout) — never for HTTP status. */
export class SocialTransportError extends Error {
  constructor(readonly kind: "network" | "timeout", message: string) {
    super(message);
    this.name = "SocialTransportError";
  }
}

const MAX_BODY_BYTES = 3_000_000;

/** The production transport: one fetch hop, hard timeout, bounded body. */
export function createFetchSocialTransport(): SocialHttpTransport {
  return {
    async request(req: SocialHttpRequest): Promise<SocialHttpResponse> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), req.timeoutMs);
      try {
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          redirect: "manual",
          signal: controller.signal,
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
        throw new SocialTransportError(isAbort ? "timeout" : "network", isAbort ? "request timed out" : "network error");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
