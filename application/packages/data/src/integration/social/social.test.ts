/* =============================================================================
 * Social connectors — data-layer tests (F4.7). Deterministic, offline.
 *
 * A scripted fake transport (no network) drives per-provider OAuth (authorize URL with
 * comma vs space scopes + client_id vs client_key, body vs HTTP-Basic exchange, refresh
 * rotation, expiry, revoked/missing failures), Bearer authorization + provider version
 * headers (LinkedIn-Version, X-Restli), health/validation + 7-state error classification
 * (incl. TikTok's HTTP-200 error envelope), the normalized social.* operations + execute
 * dispatch, Meta webhook signature verification (real HMAC-SHA256 hex vector) + event
 * translation, per-provider polling cursor advance, transport-failure mapping, and the
 * secret-non-leak guarantee. No live Meta/LinkedIn/X/TikTok call is ever made.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { findConnector } from "@brightloop/domain";
import type { SocialHttpRequest, SocialHttpResponse, SocialHttpTransport } from "./transport.js";
import { SocialTransportError } from "./transport.js";
import { classifyHttpStatus, healthForReason, reasonForCategory } from "./errors.js";
import { createSocialConnectorAdapters, type SocialConnectorConfig } from "./adapter.js";
import { META_BINDING, mapMetaChange } from "./meta.js";
import { verifyHmacSha256Hex, safeEqual } from "./webhook.js";

const NOW = "2026-08-12T00:00:00.000Z";
const CREDS = {
  meta: { clientId: "mc", clientSecret: "ms" },
  linkedin: { clientId: "lc", clientSecret: "ls" },
  x: { clientId: "xc", clientSecret: "xs" },
  tiktok: { clientId: "tkey", clientSecret: "tsec" },
};

function makeCfg(handler: (req: SocialHttpRequest) => SocialHttpResponse): { config: SocialConnectorConfig; calls: SocialHttpRequest[] } {
  const calls: SocialHttpRequest[] = [];
  const transport: SocialHttpTransport = { request: async (req) => { calls.push(req); return handler(req); } };
  return { config: { transport, now: () => NOW, defaultRedirectUri: "https://app.auxion.co/oauth/cb", timeoutMs: 1000, creds: CREDS }, calls };
}
const json = (status: number, obj: unknown): SocialHttpResponse => ({ status, headers: { "content-type": "application/json" }, body: JSON.stringify(obj) });
const adapters = (cfg: SocialConnectorConfig) => createSocialConnectorAdapters(cfg);

describe("error classification (7 health states)", () => {
  it("maps HTTP statuses onto the normalized taxonomy + reasons", () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(401)!.reason).toBe("expired");
    expect(classifyHttpStatus(401)!.category).toBe("authentication");
    expect(classifyHttpStatus(403)!.reason).toBe("permission_missing");
    expect(classifyHttpStatus(429)!.reason).toBe("rate_limited");
    expect(classifyHttpStatus(400)!.reason).toBe("configuration_error");
    expect(classifyHttpStatus(500)!.reason).toBe("disconnected");
  });
  it("reads a safe provider error code without leaking a message", () => {
    expect(classifyHttpStatus(400, { error: { code: 190, message: "secret detail", type: "OAuthException" } })!.code).toBe("err_190");
    expect(classifyHttpStatus(400, { errors: [{ code: 88, message: "secret" }] })!.code).toBe("x_88");
    expect(classifyHttpStatus(401, { code: "AUTH_FAIL" })!.code).toBe("AUTH_FAIL");
  });
  it("health level derives from reason", () => {
    expect(healthForReason("connected")).toBe("healthy");
    expect(healthForReason(reasonForCategory("authentication"))).toBe("unauthorized");
    expect(healthForReason(reasonForCategory("rate_limited"))).toBe("degraded");
    expect(healthForReason(reasonForCategory("provider_unavailable"))).toBe("unavailable");
  });
});

describe("authorization — Bearer auth + provider version headers", () => {
  it("Meta attaches Bearer + versioned Graph base", async () => {
    const { config, calls } = makeCfg(() => json(200, { id: "me-1", name: "Owner" }));
    const res = await adapters(config)["meta"]!.validateConnection({ connectorId: "meta", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(res.ok).toBe(true);
    expect(calls[0]!.url.startsWith("https://graph.facebook.com/v21.0/me")).toBe(true);
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
  });
  it("LinkedIn attaches Bearer + LinkedIn-Version + Restli headers", async () => {
    const { config, calls } = makeCfg(() => json(200, { sub: "li-1", name: "Member" }));
    await adapters(config)["linkedin"]!.validateConnection({ connectorId: "linkedin", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(calls[0]!.url).toBe("https://api.linkedin.com/v2/userinfo");
    expect(calls[0]!.headers["linkedin-version"]).toBe("202401");
    expect(calls[0]!.headers["x-restli-protocol-version"]).toBe("2.0.0");
  });
  it("X attaches Bearer against api v2", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: { id: "x-1", name: "Handle" } }));
    await adapters(config)["x"]!.validateConnection({ connectorId: "x", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(calls[0]!.url.startsWith("https://api.twitter.com/2/users/me")).toBe(true);
    expect(calls[0]!.headers["authorization"]).toBe("Bearer AT");
  });
  it("a missing access token is a secret_unavailable failure (no call)", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["meta"]!.execute!({ connectorId: "meta", operation: "social.pages.list", authMethod: "oauth2", config: {}, secret: null, input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("secret_unavailable");
    expect(calls.length).toBe(0);
  });
});

describe("OAuth 2.0 — authorize URL, exchange styles, refresh rotation, expiry", () => {
  it("Meta comma-joins scopes; state carried", () => {
    const { config } = makeCfg(() => json(200, {}));
    const url = adapters(config)["meta"]!.buildAuthorizationUrl!({ connectorId: "meta", scopes: ["pages_show_list", "instagram_basic"], state: "st8", redirectUri: "", config: {} });
    expect(url.ok).toBe(true);
    if (url.ok) {
      expect(url.value.startsWith("https://www.facebook.com/v21.0/dialog/oauth?")).toBe(true);
      expect(url.value).toContain("state=st8");
      expect(url.value).toContain("scope=pages_show_list%2Cinstagram_basic");
      expect(url.value).toContain("client_id=mc");
    }
  });
  it("TikTok uses client_key + comma scopes in the authorize URL", () => {
    const { config } = makeCfg(() => json(200, {}));
    const url = adapters(config)["tiktok"]!.buildAuthorizationUrl!({ connectorId: "tiktok", scopes: ["user.info.basic", "video.list"], state: "s", redirectUri: "", config: {} });
    expect(url.ok && url.value.includes("client_key=tkey")).toBe(true);
    expect(url.ok && url.value.includes("scope=user.info.basic%2Cvideo.list")).toBe(true);
  });
  it("Meta exchanges a code with client credentials in the body (no Basic)", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT1", refresh_token: "RT1", expires_in: 3600, token_type: "bearer", scope: "pages_show_list,instagram_basic" }));
    const res = await adapters(config)["meta"]!.exchangeAuthorizationCode!({ connectorId: "meta", code: "code123", state: "st", redirectUri: "https://app/cb", config: {} });
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.value.accessToken).toBe("AT1"); expect(res.value.refreshToken).toBe("RT1"); expect(res.value.expiresAt).toBe("2026-08-12T01:00:00.000Z"); expect(res.value.scopes).toEqual(["pages_show_list", "instagram_basic"]); }
    expect(calls[0]!.headers["authorization"]).toBeUndefined();
    expect(calls[0]!.body).toContain("client_id=mc");
    expect(calls[0]!.body).toContain("grant_type=authorization_code");
  });
  it("X exchanges a code with HTTP Basic client auth (no secret in body)", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT2", refresh_token: "RT2", expires_in: 7200 }));
    const res = await adapters(config)["x"]!.exchangeAuthorizationCode!({ connectorId: "x", code: "c", state: "s", redirectUri: "https://app/cb", config: {} });
    expect(res.ok && res.value.accessToken).toBe("AT2");
    const expectedBasic = `Basic ${Buffer.from("xc:xs").toString("base64")}`;
    expect(calls[0]!.headers["authorization"]).toBe(expectedBasic);
    expect(calls[0]!.body).not.toContain("xs");
    expect(calls[0]!.body).toContain("client_id=xc");
  });
  it("TikTok exchanges a code with client_key in the body", async () => {
    const { config, calls } = makeCfg(() => json(200, { access_token: "AT3", refresh_token: "RT3", expires_in: 86400 }));
    const res = await adapters(config)["tiktok"]!.exchangeAuthorizationCode!({ connectorId: "tiktok", code: "c", state: "s", redirectUri: "https://app/cb", config: {} });
    expect(res.ok && res.value.refreshToken).toBe("RT3");
    expect(calls[0]!.body).toContain("client_key=tkey");
  });
  it("refreshes + rotates the refresh token, and keeps the old one when the provider omits it", async () => {
    const rotate = makeCfg(() => json(200, { access_token: "N1", refresh_token: "R2", expires_in: 3600 }));
    const r1 = await adapters(rotate.config)["linkedin"]!.refreshAccessToken!({ connectorId: "linkedin", refreshToken: "R1", config: {} });
    expect(r1.ok && r1.value.refreshToken).toBe("R2");
    const keep = makeCfg(() => json(200, { access_token: "N2", expires_in: 1800 }));
    const r2 = await adapters(keep.config)["linkedin"]!.refreshAccessToken!({ connectorId: "linkedin", refreshToken: "R9", config: {} });
    expect(r2.ok && r2.value.refreshToken).toBe("R9");
  });
  it("an OAuth-less adapter (no client creds) omits the OAuth methods", () => {
    const { config } = makeCfg(() => json(200, {}));
    const noCreds: SocialConnectorConfig = { ...config, creds: {} };
    expect(adapters(noCreds)["meta"]!.buildAuthorizationUrl).toBeUndefined();
    expect(adapters(noCreds)["tiktok"]!.exchangeAuthorizationCode).toBeUndefined();
  });
});

describe("normalized operations — execute dispatch + neutral DTOs", () => {
  it("Meta lists Pages and normalizes them", async () => {
    const { config } = makeCfg(() => json(200, { data: [{ id: "pg1", name: "Acme Page", category: "Business", followers_count: 1200 }], paging: {} }));
    const res = await adapters(config)["meta"]!.execute!({ connectorId: "meta", operation: "social.pages.list", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const first = (res.value.data["results"] as Record<string, unknown>[])[0]!;
      expect(first["provider"]).toBe("meta");
      expect(first["externalId"]).toBe("pg1");
      expect(first["followerCount"]).toBe(1200);
    }
  });
  it("Meta creates a post with a provider-neutral input", async () => {
    const { config, calls } = makeCfg(() => json(200, { id: "pg1_99" }));
    const res = await adapters(config)["meta"]!.execute!({ connectorId: "meta", operation: "social.posts.create", authMethod: "oauth2", config: { pageId: "pg1" }, secret: "AT", input: { message: "Hello world" } });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.value.data["record"] as Record<string, unknown>)["status"]).toBe("published");
    expect(calls[0]!.url).toContain("/pg1/feed");
    expect(JSON.parse(calls[0]!.body!)["message"]).toBe("Hello world");
  });
  it("Meta posting without a pageId is a validation error (no call)", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["meta"]!.execute!({ connectorId: "meta", operation: "social.posts.create", authMethod: "oauth2", config: {}, secret: "AT", input: { message: "x" } });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("validation");
    expect(calls.length).toBe(0);
  });
  it("LinkedIn reads the member profile via userinfo", async () => {
    const { config } = makeCfg(() => json(200, { sub: "li-9", name: "Jane Member", picture: "https://cdn/x.png" }));
    const res = await adapters(config)["linkedin"]!.execute!({ connectorId: "linkedin", operation: "social.profile.read", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok && (res.value.data as Record<string, unknown>)["externalId"]).toBe("li-9");
  });
  it("X creates a tweet through the v2 endpoint", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: { id: "tw-1", text: "gm" } }));
    const res = await adapters(config)["x"]!.execute!({ connectorId: "x", operation: "social.posts.create", authMethod: "oauth2", config: {}, secret: "AT", input: { message: "gm" } });
    expect(res.ok && res.value.data["id"]).toBe("tw-1");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/2/tweets");
    expect(JSON.parse(calls[0]!.body!)["text"]).toBe("gm");
  });
  it("X searches recent tweets (X-only capability)", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: [{ id: "tw-2", text: "auxion" }], meta: { next_token: "nt" } }));
    const res = await adapters(config)["x"]!.execute!({ connectorId: "x", operation: "social.search.read", authMethod: "oauth2", config: {}, secret: "AT", input: { query: "auxion" } });
    expect(res.ok).toBe(true);
    if (res.ok) { expect((res.value.data["results"] as unknown[]).length).toBe(1); expect((res.value.data["pagination"] as Record<string, unknown>)["nextCursor"]).toBe("nt"); }
    expect(calls[0]!.url).toContain("/tweets/search/recent");
  });
  it("TikTok lists videos through the v2 list endpoint", async () => {
    const { config, calls } = makeCfg(() => json(200, { data: { videos: [{ id: "v1", title: "Clip", create_time: 1660000000, like_count: 5 }], has_more: true, cursor: "20" }, error: { code: "ok" } }));
    const res = await adapters(config)["tiktok"]!.execute!({ connectorId: "tiktok", operation: "social.posts.list", authMethod: "oauth2", config: {}, secret: "AT", input: { limit: 20 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const first = (res.value.data["results"] as Record<string, unknown>[])[0]!;
      expect(first["provider"]).toBe("tiktok");
      expect(first["externalId"]).toBe("v1");
      expect((res.value.data["pagination"] as Record<string, unknown>)["nextCursor"]).toBe("20");
    }
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toContain("/video/list/");
  });
  it("TikTok surfaces an HTTP-200 error envelope as a normalized failure", async () => {
    const { config } = makeCfg(() => json(200, { error: { code: "access_token_invalid", message: "secret" } }));
    const res = await adapters(config)["tiktok"]!.execute!({ connectorId: "tiktok", operation: "social.profile.read", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("authentication");
  });
  it("an unsupported operation is rejected before any call", async () => {
    const { config, calls } = makeCfg(() => json(200, {}));
    const res = await adapters(config)["linkedin"]!.execute!({ connectorId: "linkedin", operation: "social.insights.read", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("unsupported");
    expect(calls.length).toBe(0);
  });
});

describe("health + failure mapping", () => {
  it("a healthy probe reports healthy; a 429 degrades to rate_limited", async () => {
    const ok = makeCfg(() => json(200, { id: "me-1" }));
    const h1 = await adapters(ok.config)["meta"]!.healthCheck({ connectorId: "meta", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(h1.ok && h1.value.level).toBe("healthy");
    const limited = makeCfg(() => json(429, {}));
    const h2 = await adapters(limited.config)["x"]!.healthCheck({ connectorId: "x", authMethod: "oauth2", config: {}, secret: "AT" });
    expect(h2.ok && h2.value.level).toBe("degraded");
  });
  it("a transport failure surfaces as a normalized error, not a throw", async () => {
    const transport: SocialHttpTransport = { request: async () => { throw new SocialTransportError("timeout", "boom"); } };
    const cfg: SocialConnectorConfig = { transport, now: () => NOW, defaultRedirectUri: "", timeoutMs: 10, creds: CREDS };
    const res = await adapters(cfg)["linkedin"]!.execute!({ connectorId: "linkedin", operation: "social.profile.read", authMethod: "oauth2", config: {}, secret: "AT", input: {} });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("timeout");
  });
});

describe("webhooks — Meta HMAC-SHA256 hex verification + translation", () => {
  it("verifies a real X-Hub-Signature-256 vector and translates entry changes", () => {
    const secret = "app-secret";
    const rawBody = JSON.stringify({ object: "page", entry: [{ id: "pg1", time: 1660000000, changes: [{ field: "feed", value: { verb: "add", post_id: "pg1_123" } }] }] });
    const hex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    expect(verifyHmacSha256Hex(rawBody, `sha256=${hex}`, secret)).toBe(true);
    expect(verifyHmacSha256Hex(rawBody, hex, secret)).toBe(true); // bare hex accepted too
    expect(verifyHmacSha256Hex(rawBody, "sha256=deadbeef", secret)).toBe(false);

    const v = META_BINDING.webhook!.verify(rawBody, `sha256=${hex}`, secret);
    expect(v.ok && v.value.valid).toBe(true);
    if (v.ok) expect(v.value.externalEventId).toBe("feed-pg1_123-add");
    const t = META_BINDING.webhook!.translate(rawBody, () => NOW);
    expect(t.ok && t.value[0]!.type).toBe("social.post.published");
    expect(mapMetaChange("comments", "add")).toBe("social.comment.created");
    expect(mapMetaChange("feed", "remove")).toBe("social.post.deleted");
  });
  it("an invalid signature verifies false; a missing secret never passes", () => {
    expect(verifyHmacSha256Hex("body", "sig", null)).toBe(false);
    expect(verifyHmacSha256Hex("body", null, "secret")).toBe(false);
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("a", "ab")).toBe(false);
  });
});

describe("polling — cursor advance", () => {
  it("Meta polls the page feed and advances the after cursor", async () => {
    const { config } = makeCfg(() => json(200, { data: [{ id: "pg1_1", is_published: true }, { id: "pg1_2", is_published: true }], paging: { cursors: { after: "AFTER2" }, next: "https://graph/next" } }));
    const poll = adapters(config)["meta"]!.poll!;
    const first = await poll({ connectorId: "meta", authMethod: "oauth2", config: { pageId: "pg1" }, secret: "AT", cursor: null, limit: 25 });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.events.length).toBe(2); expect(first.value.events[0]!.type).toBe("social.post.published"); expect(first.value.nextCursor).toBe("AFTER2"); }
  });
  it("Meta polling without a pageId is a configuration error", async () => {
    const { config } = makeCfg(() => json(200, {}));
    const poll = adapters(config)["meta"]!.poll!;
    const res = await poll({ connectorId: "meta", authMethod: "oauth2", config: {}, secret: "AT", cursor: null, limit: 25 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.category).toBe("config_invalid");
  });
  it("X polls author tweets and advances the pagination token", async () => {
    const { config } = makeCfg(() => json(200, { data: [{ id: "tw-1", created_at: "2026-08-11T00:00:00Z" }], meta: { next_token: "PAGE2" } }));
    const poll = adapters(config)["x"]!.poll!;
    const first = await poll({ connectorId: "x", authMethod: "oauth2", config: { userId: "x-1" }, secret: "AT", cursor: null, limit: 10 });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.events.length).toBe(1); expect(first.value.nextCursor).toBe("PAGE2"); }
  });
  it("TikTok polls videos and advances the cursor", async () => {
    const { config } = makeCfg(() => json(200, { data: { videos: [{ id: "v1", create_time: 1660000000 }], has_more: true, cursor: "40" }, error: { code: "ok" } }));
    const poll = adapters(config)["tiktok"]!.poll!;
    const first = await poll({ connectorId: "tiktok", authMethod: "oauth2", config: {}, secret: "AT", cursor: null, limit: 10 });
    expect(first.ok).toBe(true);
    if (first.ok) { expect(first.value.events[0]!.type).toBe("social.post.published"); expect(first.value.nextCursor).toBe("40"); }
  });
});

describe("secret non-leakage", () => {
  it("an operation result carries no token or secret material", async () => {
    const { config } = makeCfg(() => json(200, { data: { id: "me", name: "Owner" } }));
    const res = await adapters(config)["x"]!.execute!({ connectorId: "x", operation: "social.profile.read", authMethod: "oauth2", config: {}, secret: "super-secret-token", input: {} });
    expect(res.ok).toBe(true);
    expect(JSON.stringify(res)).not.toContain("super-secret-token");
  });
});

describe("registry wiring", () => {
  it("all four social connectors are available social-category descriptors", () => {
    for (const id of ["meta", "linkedin", "x", "tiktok"]) {
      const c = findConnector(id);
      expect(c!.available).toBe(true);
      expect(c!.category).toBe("social");
    }
  });
});
