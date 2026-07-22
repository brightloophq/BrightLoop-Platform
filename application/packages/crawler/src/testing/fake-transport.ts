/* =============================================================================
 * Deterministic test doubles (Phase C · Sprint C3 §15) — no network, no DNS.
 *
 * `FakeHttpTransport` replays scripted responses keyed by URL; `FakeDnsResolver`
 * returns scripted addresses. Together they make every crawler test deterministic
 * and offline — the default suite NEVER opens a socket.
 * ========================================================================== */

import type { DnsResolver } from "../dns.js";
import type { HttpFetchResult, HttpRequest, HttpTransport, HttpTransportError } from "../transport.js";

export interface ScriptedResponse {
  status: number;
  headers?: Record<string, string>;
  contentType?: string | null;
  body?: string;
  redirectLocation?: string | null;
  bytes?: number;
  truncated?: boolean;
  durationMs?: number;
}

export type ScriptedRoute = ScriptedResponse | { error: HttpTransportError };

/** A transport that replays scripted responses by URL and records every call. */
export class FakeHttpTransport implements HttpTransport {
  readonly calls: string[] = [];
  constructor(private readonly routes: Record<string, ScriptedRoute>) {}

  async fetch(request: HttpRequest): Promise<HttpFetchResult> {
    this.calls.push(request.url);
    const route = this.routes[request.url];
    if (route === undefined) {
      return { ok: false, error: { kind: "connect", message: `no scripted route for ${request.url}` } };
    }
    if ("error" in route) return { ok: false, error: route.error };

    const contentType = route.contentType === undefined ? "text/html; charset=utf-8" : route.contentType;
    const headers = { ...(route.headers ?? {}) };
    if (contentType !== null && headers["content-type"] === undefined) headers["content-type"] = contentType;
    if (route.redirectLocation != null && headers["location"] === undefined) headers["location"] = route.redirectLocation;

    const body = route.body ?? "";
    return {
      ok: true,
      response: {
        requestedUrl: request.url,
        status: route.status,
        headers,
        contentType,
        bytes: route.bytes ?? body.length,
        body,
        truncated: route.truncated ?? false,
        redirectLocation: route.redirectLocation ?? headers["location"] ?? null,
        durationMs: route.durationMs ?? 0,
      },
    };
  }
}

/** A DNS resolver returning scripted addresses (default: a public address). */
export class FakeDnsResolver implements DnsResolver {
  constructor(
    private readonly map: Record<string, string[]> = {},
    private readonly fallback: string[] = ["93.184.216.34"],
  ) {}

  async resolve(host: string): Promise<string[]> {
    const hit = this.map[host];
    if (hit !== undefined) {
      if (hit.length === 0) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      return hit;
    }
    return this.fallback;
  }
}
