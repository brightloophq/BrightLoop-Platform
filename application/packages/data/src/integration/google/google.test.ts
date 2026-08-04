/* =============================================================================
 * Google connectors — data-layer tests (F4.2). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives OAuth, health/validation, error
 * classification, per-service operations, execute dispatch, polling + event
 * translation, and the secret-non-leak guarantee.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { findConnector } from "@brightloop/domain";
import type { GoogleAdapterConfig } from "./client.js";
import type { GoogleHttpRequest, GoogleHttpResponse, GoogleHttpTransport } from "./transport.js";
import { GoogleTransportError } from "./transport.js";
import { classifyGoogleError, googleHealth } from "./errors.js";
import { buildGoogleAuthorizationUrl, exchangeGoogleCode, refreshGoogleToken } from "./oauth.js";
import { createGoogleConnectorAdapters } from "./adapter.js";
import { GMAIL_OPS } from "./gmail.js";
import { CALENDAR_OPS } from "./calendar.js";
import { DRIVE_OPS } from "./drive.js";
import { CONTACTS_OPS } from "./contacts.js";

const NOW = "2026-08-07T00:00:00.000Z";

function makeTransport(handler: (req: GoogleHttpRequest) => GoogleHttpResponse): { transport: GoogleHttpTransport; calls: GoogleHttpRequest[] } {
  const calls: GoogleHttpRequest[] = [];
  return { transport: { request: async (req) => { calls.push(req); return handler(req); } }, calls };
}
const json = (status: number, obj: unknown): GoogleHttpResponse => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
function cfg(handler: (req: GoogleHttpRequest) => GoogleHttpResponse): { config: GoogleAdapterConfig; calls: GoogleHttpRequest[] } {
  const { transport, calls } = makeTransport(handler);
  return { config: { clientId: "cid", clientSecret: "csec", defaultRedirectUri: "https://app/cb", transport, now: () => NOW, timeoutMs: 1000 }, calls };
}

describe("error classification (7 health states)", () => {
  it("maps Google statuses onto the normalized taxonomy", () => {
    expect(classifyGoogleError(401).reason).toBe("expired");
    expect(classifyGoogleError(401).category).toBe("authentication");
    expect(classifyGoogleError(403, JSON.stringify({ error: { errors: [{ reason: "insufficientPermissions" }] } })).reason).toBe("permission_missing");
    expect(classifyGoogleError(403, JSON.stringify({ error: { errors: [{ reason: "rateLimitExceeded" }] } })).reason).toBe("rate_limited");
    expect(classifyGoogleError(429).reason).toBe("rate_limited");
    expect(classifyGoogleError(400).reason).toBe("configuration_error");
    expect(classifyGoogleError(500).reason).toBe("disconnected");
  });
  it("googleHealth maps to a framework level", () => {
    expect(googleHealth(true).level).toBe("healthy");
    expect(googleHealth(false, 401).level).toBe("unauthorized");
    expect(googleHealth(false, 429).level).toBe("degraded");
    expect(googleHealth(false, 500).level).toBe("unavailable");
  });
});

describe("OAuth 2.0 authorization code flow", () => {
  it("builds a consent URL with offline access + forced consent", () => {
    const { config } = cfg(() => json(200, {}));
    const res = buildGoogleAuthorizationUrl(config, { connectorId: "google-gmail", state: "st_1", scopes: ["a", "b"], redirectUri: "", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value).toContain("client_id=cid");
      expect(res.value).toContain("access_type=offline");
      expect(res.value).toContain("prompt=consent");
      expect(res.value).toContain("state=st_1");
      expect(res.value).toContain("redirect_uri=https%3A%2F%2Fapp%2Fcb");
    }
  });
  it("exchanges a code for a bundle with computed expiry", async () => {
    const { config, calls } = cfg(() => json(200, { access_token: "at1", refresh_token: "rt1", expires_in: 3600, scope: "a b", token_type: "Bearer" }));
    const res = await exchangeGoogleCode(config, { connectorId: "google-gmail", code: "code1", state: "st", redirectUri: "https://app/cb", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.accessToken).toBe("at1");
      expect(res.value.refreshToken).toBe("rt1");
      expect(res.value.expiresAt).toBe("2026-08-07T01:00:00.000Z");
      expect(res.value.scopes).toEqual(["a", "b"]);
    }
    // client secret was sent to the token endpoint, never elsewhere
    expect(calls[0]!.body).toContain("client_secret=csec");
  });
  it("refreshes a token, keeping the old refresh token when none is re-issued", async () => {
    const { config } = cfg(() => json(200, { access_token: "at2", expires_in: 3600, token_type: "Bearer" }));
    const res = await refreshGoogleToken(config, { connectorId: "google-gmail", refreshToken: "rt-old", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.accessToken).toBe("at2"); expect(res.value.refreshToken).toBe("rt-old"); }
  });
  it("rejects an empty code / refresh token without calling the network", async () => {
    const { config, calls } = cfg(() => json(200, {}));
    const a = await exchangeGoogleCode(config, { connectorId: "google-gmail", code: "", state: "s", redirectUri: "", config: {} });
    const b = await refreshGoogleToken(config, { connectorId: "google-gmail", refreshToken: "", config: {} });
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    expect(calls.length).toBe(0);
  });
});

describe("adapter: validate + health + discover", () => {
  it("validates when the probe succeeds and reports healthy", async () => {
    const { config } = cfg(() => json(200, { emailAddress: "x@y.z" }));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const v = await gmail.validateConnection({ connectorId: "google-gmail", authMethod: "oauth2", config: {}, secret: "at" });
    expect(v.ok).toBe(true);
    const h = await gmail.healthCheck({ connectorId: "google-gmail", authMethod: "oauth2", config: {}, secret: "at" });
    expect(h.ok && h.value.level).toBe("healthy");
  });
  it("reports expired/permission_missing/rate_limited health from probe failures", async () => {
    for (const [status, level, reason] of [[401, "unauthorized", "expired"], [403, "unauthorized", "permission_missing"], [429, "degraded", "rate_limited"]] as const) {
      const { config } = cfg(() => json(status, { error: { status } }));
      const drive = createGoogleConnectorAdapters(config)["google-drive"]!;
      const h = await drive.healthCheck({ connectorId: "google-drive", authMethod: "oauth2", config: {}, secret: "at" });
      expect(h.ok).toBe(true);
      if (h.ok) { expect(h.value.level).toBe(level); expect(h.value.detail["reason"]).toBe(reason); }
    }
  });
  it("discovers every declared capability", async () => {
    const { config } = cfg(() => json(200, {}));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.discoverCapabilities({ connectorId: "google-gmail", authMethod: "oauth2", config: {}, secret: "at" });
    expect(res.ok && res.value.every((c) => c.supported)).toBe(true);
  });
});

describe("capability coverage — every declared operation has an executable handler", () => {
  const maps: Record<string, Record<string, unknown>> = { "google-gmail": GMAIL_OPS, "google-calendar": CALENDAR_OPS, "google-drive": DRIVE_OPS, "google-contacts": CONTACTS_OPS };
  for (const connectorId of Object.keys(maps)) {
    it(`${connectorId} implements all capabilities`, () => {
      const descriptor = findConnector(connectorId)!;
      for (const cap of descriptor.capabilities) expect(maps[connectorId]![cap.operation], `${connectorId}:${cap.operation}`).toBeDefined();
    });
  }
});

describe("operations hit the right endpoint and normalize output", () => {
  it("gmail.send posts a base64url message and returns id/threadId", async () => {
    const { config, calls } = cfg(() => json(200, { id: "m1", threadId: "t1" }));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.execute!({ connectorId: "google-gmail", operation: "gmail.send", authMethod: "oauth2", config: {}, secret: "at", input: { to: "a@b.c", subject: "hi", body: "yo" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.data).toEqual({ id: "m1", threadId: "t1" });
    expect(calls[0]!.url).toContain("/messages/send");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toContain("raw");
  });
  it("calendar.events.create posts an event body", async () => {
    const { config, calls } = cfg(() => json(200, { id: "e1", status: "confirmed", htmlLink: "h" }));
    const cal = createGoogleConnectorAdapters(config)["google-calendar"]!;
    const res = await cal.execute!({ connectorId: "google-calendar", operation: "calendar.events.create", authMethod: "oauth2", config: { calendarId: "primary" }, secret: "at", input: { summary: "Sync", start: "2026-08-08T09:00:00Z", end: "2026-08-08T10:00:00Z", attendees: ["x@y.z"] } });
    expect(res.ok && res.value.data["id"]).toBe("e1");
    expect(calls[0]!.url).toContain("/calendars/primary/events");
    expect(calls[0]!.body).toContain("attendees");
  });
  it("drive.files.list returns normalized files", async () => {
    const { config } = cfg(() => json(200, { files: [{ id: "f1", name: "Doc", mimeType: "text/plain", size: "10" }] }));
    const drive = createGoogleConnectorAdapters(config)["google-drive"]!;
    const res = await drive.execute!({ connectorId: "google-drive", operation: "drive.files.list", authMethod: "oauth2", config: {}, secret: "at", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value.data["files"] as unknown[])[0]).toMatchObject({ id: "f1", name: "Doc" });
  });
  it("contacts.list returns normalized people", async () => {
    const { config } = cfg(() => json(200, { connections: [{ resourceName: "people/1", names: [{ displayName: "Ada" }], emailAddresses: [{ value: "ada@x.z" }] }] }));
    const contacts = createGoogleConnectorAdapters(config)["google-contacts"]!;
    const res = await contacts.execute!({ connectorId: "google-contacts", operation: "contacts.list", authMethod: "oauth2", config: {}, secret: "at", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value.data["contacts"] as { displayName: string }[])[0]!.displayName).toBe("Ada");
  });
  it("an unsupported operation is rejected", async () => {
    const { config } = cfg(() => json(200, {}));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.execute!({ connectorId: "google-gmail", operation: "gmail.nope", authMethod: "oauth2", config: {}, secret: "at", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("unsupported");
  });
});

describe("event translation (Google → Auxion, no vendor events exposed)", () => {
  it("gmail poll yields email.received events", async () => {
    const { config } = cfg(() => json(200, { messages: [{ id: "gm1", threadId: "t1" }, { id: "gm2", threadId: "t2" }] }));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.poll!({ connectorId: "google-gmail", authMethod: "oauth2", config: { userId: "me" }, secret: "at", cursor: null, limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.events.every((e) => e.type === "email.received")).toBe(true); expect(res.value.events[0]!.externalId).toBe("gm1"); }
  });
  it("calendar poll yields calendar.event.changed and advances the syncToken", async () => {
    const { config } = cfg(() => json(200, { items: [{ id: "ev1", status: "confirmed", updated: NOW }], nextSyncToken: "sync-2" }));
    const cal = createGoogleConnectorAdapters(config)["google-calendar"]!;
    const res = await cal.poll!({ connectorId: "google-calendar", authMethod: "oauth2", config: {}, secret: "at", cursor: null, limit: 10 });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.events[0]!.type).toBe("calendar.event.changed"); expect(res.value.nextCursor).toBe("sync-2"); }
  });
});

describe("secret handling + transport failures", () => {
  it("a missing access token never reaches the network", async () => {
    const { config, calls } = cfg(() => json(200, {}));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.execute!({ connectorId: "google-gmail", operation: "gmail.labels.list", authMethod: "oauth2", config: {}, secret: null, input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("secret_unavailable");
    expect(calls.length).toBe(0);
  });
  it("no token or secret appears in a normalized output", async () => {
    const { config } = cfg(() => json(200, { id: "m1", threadId: "t1", access_token: "LEAK", authorization: "Bearer LEAK" }));
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.execute!({ connectorId: "google-gmail", operation: "gmail.send", authMethod: "oauth2", config: {}, secret: "at", input: { to: "a@b.c" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect(JSON.stringify(res.value.data)).not.toContain("LEAK");
  });
  it("transport network/timeout errors map to the normalized taxonomy", async () => {
    const transport: GoogleHttpTransport = { request: async () => { throw new GoogleTransportError("timeout", "x"); } };
    const config: GoogleAdapterConfig = { clientId: "c", clientSecret: "s", defaultRedirectUri: "r", transport, now: () => NOW };
    const gmail = createGoogleConnectorAdapters(config)["google-gmail"]!;
    const res = await gmail.execute!({ connectorId: "google-gmail", operation: "gmail.labels.list", authMethod: "oauth2", config: {}, secret: "at", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("timeout");
  });
});
