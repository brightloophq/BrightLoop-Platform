/* =============================================================================
 * Communication connectors — data-layer tests (F4.3). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives OAuth (Slack/Teams), bot auth
 * (Discord), error/health classification (incl. Slack body-`ok`), validation,
 * capability coverage across all three bindings, representative normalized
 * operations, event translation → canonical Auxion events, secret non-leak, and
 * transport failures.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { findConnector } from "@brightloop/domain";
import type { CommHttpRequest, CommHttpResponse, CommHttpTransport } from "./transport.js";
import { CommTransportError } from "./transport.js";
import { classifyHttpStatus, classifySlack, healthForReason, reasonForCategory } from "./errors.js";
import { createCommunicationConnectorAdapters, type CommunicationConfig } from "./adapter.js";
import { SLACK_BINDING } from "./slack.js";
import { TEAMS_BINDING } from "./teams.js";
import { DISCORD_BINDING } from "./discord.js";

const NOW = "2026-08-04T00:00:00.000Z";

function makeTransport(handler: (req: CommHttpRequest) => CommHttpResponse): { transport: CommHttpTransport; calls: CommHttpRequest[] } {
  const calls: CommHttpRequest[] = [];
  return { transport: { request: async (req) => { calls.push(req); return handler(req); } }, calls };
}
const json = (status: number, obj: unknown): CommHttpResponse => ({ status, headers: {}, body: JSON.stringify(obj) });
function cfg(handler: (req: CommHttpRequest) => CommHttpResponse): { config: CommunicationConfig; calls: CommHttpRequest[] } {
  const { transport, calls } = makeTransport(handler);
  return {
    config: { transport, now: () => NOW, defaultRedirectUri: "https://app/cb", timeoutMs: 1000, creds: { slack: { clientId: "scid", clientSecret: "scs" }, "microsoft-teams": { clientId: "tcid", clientSecret: "tcs" } } },
    calls,
  };
}
const adapters = (handler: (req: CommHttpRequest) => CommHttpResponse) => { const { config, calls } = cfg(handler); return { reg: createCommunicationConnectorAdapters(config), calls }; };

describe("error + health classification (7 states)", () => {
  it("HTTP status → normalized category + reason", () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(401)!.reason).toBe("expired");
    expect(classifyHttpStatus(403)!.reason).toBe("permission_missing");
    expect(classifyHttpStatus(429)!.reason).toBe("rate_limited");
    expect(classifyHttpStatus(400)!.reason).toBe("configuration_error");
    expect(classifyHttpStatus(503)!.reason).toBe("disconnected");
  });
  it("Slack body ok:false → mapped by error string", () => {
    expect(classifySlack(200, { ok: true })).toBeNull();
    expect(classifySlack(200, { ok: false, error: "invalid_auth" })!.reason).toBe("expired");
    expect(classifySlack(200, { ok: false, error: "missing_scope" })!.reason).toBe("permission_missing");
    expect(classifySlack(200, { ok: false, error: "ratelimited" })!.reason).toBe("rate_limited");
    expect(classifySlack(429, {})!.reason).toBe("rate_limited");
  });
  it("reason ↔ level mapping", () => {
    expect(healthForReason("connected")).toBe("healthy");
    expect(healthForReason("expired")).toBe("unauthorized");
    expect(healthForReason("rate_limited")).toBe("degraded");
    expect(healthForReason("disconnected")).toBe("unavailable");
    expect(reasonForCategory("authentication")).toBe("expired");
    expect(reasonForCategory("rate_limited")).toBe("rate_limited");
  });
});

describe("OAuth (Slack + Teams) — reused framework flow", () => {
  it("Slack builds a consent URL with scope + state; Discord has NO oauth methods", () => {
    const { reg } = adapters(() => json(200, {}));
    const slack = reg["slack"]!;
    const url = slack.buildAuthorizationUrl!({ connectorId: "slack", state: "st1", scopes: ["chat:write", "channels:read"], redirectUri: "", config: {} });
    expect(url.ok).toBe(true);
    if (url.ok) { expect(url.value).toContain("client_id=scid"); expect(url.value).toContain("scope=chat%3Awrite"); expect(url.value).toContain("state=st1"); }
    expect(reg["discord"]!.buildAuthorizationUrl).toBeUndefined();
    expect(reg["discord"]!.exchangeAuthorizationCode).toBeUndefined();
  });
  it("Teams exchanges a code + refreshes, computing expiry", async () => {
    const { reg, calls } = adapters(() => json(200, { access_token: "at1", refresh_token: "rt1", expires_in: 3600, token_type: "Bearer" }));
    const teams = reg["microsoft-teams"]!;
    const ex = await teams.exchangeAuthorizationCode!({ connectorId: "microsoft-teams", code: "c1", state: "s", redirectUri: "https://app/cb", config: {} });
    expect(ex.ok).toBe(true);
    if (ex.ok) { expect(ex.value.accessToken).toBe("at1"); expect(ex.value.expiresAt).toBe("2026-08-04T01:00:00.000Z"); }
    expect(calls[0]!.body).toContain("client_secret=tcs");
    const rf = await teams.refreshAccessToken!({ connectorId: "microsoft-teams", refreshToken: "rt-old", config: {} });
    expect(rf.ok && rf.value.accessToken).toBe("at1");
  });
});

describe("validate + health per provider", () => {
  it("Slack validates via auth.test body ok", async () => {
    const { reg } = adapters(() => json(200, { ok: true, team_id: "T1", team: "Acme" }));
    const h = await reg["slack"]!.healthCheck({ connectorId: "slack", authMethod: "oauth2", config: {}, secret: "xoxb" });
    expect(h.ok && h.value.level).toBe("healthy");
  });
  it("Slack expired token → unauthorized health", async () => {
    const { reg } = adapters(() => json(200, { ok: false, error: "token_revoked" }));
    const h = await reg["slack"]!.healthCheck({ connectorId: "slack", authMethod: "oauth2", config: {}, secret: "xoxb" });
    expect(h.ok).toBe(true);
    if (h.ok) { expect(h.value.level).toBe("unauthorized"); expect(h.value.detail["reason"]).toBe("expired"); }
  });
  it("Discord validates with a BOT authorization header", async () => {
    const { reg, calls } = adapters(() => json(200, { id: "botid", username: "auxbot" }));
    const v = await reg["discord"]!.validateConnection({ connectorId: "discord", authMethod: "api_key", config: {}, secret: "bottoken" });
    expect(v.ok).toBe(true);
    expect(calls[0]!.headers["authorization"]).toBe("Bot bottoken");
  });
  it("Teams 403 → permission_missing/degraded... actually unauthorized", async () => {
    const { reg } = adapters(() => json(403, { error: { code: "Forbidden" } }));
    const h = await reg["microsoft-teams"]!.healthCheck({ connectorId: "microsoft-teams", authMethod: "oauth2", config: {}, secret: "at" });
    expect(h.ok && h.value.detail["reason"]).toBe("permission_missing");
  });
});

describe("capability coverage — every declared operation has a handler", () => {
  const bindings = { slack: SLACK_BINDING, "microsoft-teams": TEAMS_BINDING, discord: DISCORD_BINDING };
  for (const [id, binding] of Object.entries(bindings)) {
    it(`${id} implements all declared capabilities`, () => {
      const descriptor = findConnector(id)!;
      for (const cap of descriptor.capabilities) expect(binding.ops[cap.operation], `${id}:${cap.operation}`).toBeDefined();
    });
  }
  it("all providers share the normalized send/reply/list vocabulary", () => {
    for (const b of [SLACK_BINDING, TEAMS_BINDING, DISCORD_BINDING]) {
      expect(b.ops["communication.send_message"]).toBeDefined();
      expect(b.ops["communication.list_channels"]).toBeDefined();
    }
  });
});

describe("normalized operations hit the right endpoint", () => {
  it("Slack send → chat.postMessage, normalized id", async () => {
    const { reg, calls } = adapters(() => json(200, { ok: true, ts: "1.2", channel: "C1" }));
    const r = await reg["slack"]!.execute!({ connectorId: "slack", operation: "communication.send_message", authMethod: "oauth2", config: {}, secret: "xoxb", input: { channelId: "C1", text: "hi" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.data).toEqual({ messageId: "1.2", channelId: "C1" });
    expect(calls[0]!.url).toContain("/chat.postMessage");
  });
  it("Teams send → Graph channel messages", async () => {
    const { reg, calls } = adapters(() => json(201, { id: "m1" }));
    const r = await reg["microsoft-teams"]!.execute!({ connectorId: "microsoft-teams", operation: "communication.send_message", authMethod: "oauth2", config: { teamId: "T1", channelId: "19:abc" }, secret: "at", input: { text: "hi" } });
    expect(r.ok && r.value.data["messageId"]).toBe("m1");
    expect(calls[0]!.url).toContain("/teams/T1/channels/19%3Aabc/messages");
  });
  it("Discord list_containers handles a top-level array", async () => {
    const { reg } = adapters(() => json(200, [{ id: "g1", name: "Guild" }]));
    const r = await reg["discord"]!.execute!({ connectorId: "discord", operation: "communication.list_containers", authMethod: "api_key", config: {}, secret: "bottoken", input: {} });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.value.data["containers"] as { id: string }[])[0]!.id).toBe("g1");
  });
  it("an unsupported operation is rejected", async () => {
    const { reg } = adapters(() => json(200, { ok: true }));
    const r = await reg["slack"]!.execute!({ connectorId: "slack", operation: "communication.nope", authMethod: "oauth2", config: {}, secret: "xoxb", input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe("unsupported");
  });
});

describe("event translation (provider → canonical Auxion)", () => {
  it("Slack poll → communication.message.created", async () => {
    const { reg } = adapters(() => json(200, { ok: true, messages: [{ ts: "1.1", user: "U1" }, { ts: "1.2", user: "U2", thread_ts: "1.1" }] }));
    const r = await reg["slack"]!.poll!({ connectorId: "slack", authMethod: "oauth2", config: { channelId: "C1" }, secret: "xoxb", cursor: null, limit: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.events[0]!.type).toBe("communication.message.created"); expect(r.value.events[1]!.type).toBe("communication.message.replied"); }
  });
  it("Discord poll reply → communication.message.replied", async () => {
    const { reg } = adapters(() => json(200, [{ id: "d1", author: { id: "A1" }, timestamp: NOW, message_reference: { message_id: "d0" } }]));
    const r = await reg["discord"]!.poll!({ connectorId: "discord", authMethod: "api_key", config: { channelId: "C9" }, secret: "bottoken", cursor: null, limit: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.events[0]!.type).toBe("communication.message.replied");
  });
  it("Teams poll → communication.message.created + advances cursor", async () => {
    const { reg } = adapters(() => json(200, { value: [{ id: "t1", createdDateTime: NOW, from: { user: { id: "U1" } } }] }));
    const r = await reg["microsoft-teams"]!.poll!({ connectorId: "microsoft-teams", authMethod: "oauth2", config: { teamId: "T1", channelId: "19:abc" }, secret: "at", cursor: null, limit: 10 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.events[0]!.type).toBe("communication.message.created"); expect(r.value.nextCursor).toBe("t1"); }
  });
  it("poll with no configured channel yields no events", async () => {
    const { reg, calls } = adapters(() => json(200, { ok: true }));
    const r = await reg["slack"]!.poll!({ connectorId: "slack", authMethod: "oauth2", config: {}, secret: "xoxb", cursor: null, limit: 10 });
    expect(r.ok && r.value.events.length).toBe(0);
    expect(calls.length).toBe(0);
  });
});

describe("secret handling + transport failures", () => {
  it("a missing token never reaches the network", async () => {
    const { reg, calls } = adapters(() => json(200, { ok: true }));
    const r = await reg["slack"]!.execute!({ connectorId: "slack", operation: "communication.list_channels", authMethod: "oauth2", config: {}, secret: null, input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe("secret_unavailable");
    expect(calls.length).toBe(0);
  });
  it("no token/secret leaks into a normalized output", async () => {
    const { reg } = adapters(() => json(200, { ok: true, ts: "1.2", channel: "C1", access_token: "LEAK", authorization: "Bearer LEAK" }));
    const r = await reg["slack"]!.execute!({ connectorId: "slack", operation: "communication.send_message", authMethod: "oauth2", config: {}, secret: "xoxb", input: { channelId: "C1", text: "x" } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.stringify(r.value.data)).not.toContain("LEAK");
  });
  it("transport network/timeout maps to the normalized taxonomy", async () => {
    const transport: CommHttpTransport = { request: async () => { throw new CommTransportError("timeout", "x"); } };
    const config: CommunicationConfig = { transport, now: () => NOW, defaultRedirectUri: "r", creds: {} };
    const reg = createCommunicationConnectorAdapters(config);
    const r = await reg["discord"]!.execute!({ connectorId: "discord", operation: "communication.list_containers", authMethod: "api_key", config: {}, secret: "bottoken", input: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.category).toBe("timeout");
  });
});
