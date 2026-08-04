/* =============================================================================
 * Integration Platform — F4.7 Social connectors (application tests).
 *
 * Verifies the four social connectors are installable OAuth2 production connectors with
 * a NORMALIZED capability vocabulary, drives read + write capability invocation through
 * the real use-cases end-to-end, exercises OAuth connect + transparent refresh/rotation
 * before invocation + revoked-token reconnect, the webhook ingestion pipeline (verify →
 * translate → idempotent persist → REPLAY duplicate), polling replay-safety, and
 * authorization (clients cannot invoke; cross-tenant is denied) + secret non-leak. A
 * deterministic stub social adapter stands in for the data-layer adapter so the
 * application package stays domain+schema only.
 * ========================================================================== */

import { describe, it, expect, beforeEach } from "vitest";
import {
  connectorErr, connectorOk, createRuntimeServices, InMemoryRuntimeRepository,
  type Actor, type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry, type ConnectorResult,
} from "@brightloop/domain";
import type { ConnectorSecretReference } from "@brightloop/schema";
import type { AppContext } from "../context.js";
import { ForbiddenError, RuntimeUnavailableError, ValidationError } from "../errors.js";
import { createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore } from "./testing.js";
import { installConnector, validateConnectorConnection } from "./installation-usecases.js";
import { beginConnectorOAuth, completeConnectorOAuth } from "./oauth-usecases.js";
import { invokeConnectorCapability } from "./invoke-usecases.js";
import { ingestConnectorWebhook, pollConnector } from "./ingestion-usecases.js";
import { listConnectorCatalogue, getInstallationDetail } from "./integration-read.js";

const T0 = "2026-08-12T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const CLIENT: Actor = { userId: "u_client", role: "client_admin", clientId: "cli_x" };
const WS = "ws_social";

/**
 * A deterministic stub social adapter: OAuth2 (authorize URL / exchange / refresh),
 * secret-gated execute that echoes, a webhook verified by exact signature==signingSecret
 * match translating the body id into ONE canonical social.post.created event, and a
 * cursor-based poll. Mirrors the framework contract the real data-layer adapter fulfils,
 * without a transport. `opts.denyScope` forces an authorization failure;
 * `opts.expiredExchange` returns an already-expired token so refresh must run.
 */
function stubSocialAdapter(connectorId: string, opts: { denyScope?: boolean; expiredExchange?: boolean } = {}): ConnectorAdapter {
  const authed = (s: string | null) => s !== null && s.length > 0;
  return {
    connectorId,
    async validateConnection(i) { return authed(i.secret) ? connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 }) : connectorErr("secret_unavailable", "no secret"); },
    async healthCheck(i) { return connectorOk({ level: authed(i.secret) ? "healthy" : "unauthorized", providerVersion: "v1", latencyMs: 0, detail: {} }); },
    async discoverCapabilities() { return connectorOk([]); },
    buildAuthorizationUrl(i) { return connectorOk(`https://auth.test/${connectorId}/authorize?state=${encodeURIComponent(i.state)}`); },
    async exchangeAuthorizationCode(i) { if (i.code.length === 0) return connectorErr("validation", "no code"); return connectorOk({ accessToken: `at-${i.code}`, refreshToken: `rt-${i.code}`, scopes: ["social"], expiresAt: opts.expiredExchange ? "2020-01-01T00:00:00.000Z" : null, tokenType: "bearer" }); },
    async refreshAccessToken(i) { return connectorOk({ accessToken: "at-refreshed", refreshToken: i.refreshToken, scopes: ["social"], expiresAt: "2027-01-01T00:00:00.000Z", tokenType: "bearer" }); },
    async execute(i) {
      if (!authed(i.secret)) return connectorErr("authentication", "no secret");
      if (opts.denyScope) return connectorErr("authorization", "missing scope");
      return connectorOk({ data: { operation: i.operation, ok: true } });
    },
    verifyWebhook(i) {
      const valid = i.signingSecret !== null && i.signature === i.signingSecret;
      let id = "";
      try { id = String((JSON.parse(i.rawBody) as Record<string, unknown>)["id"] ?? ""); } catch { id = ""; }
      return connectorOk({ valid, externalEventId: id.length > 0 ? id : "unknown" });
    },
    translateWebhook(i): ConnectorResult<CanonicalConnectorEvent[]> {
      let id = "";
      try { id = String((JSON.parse(i.rawBody) as Record<string, unknown>)["id"] ?? ""); } catch { id = ""; }
      if (id.length === 0) return connectorOk([]);
      return connectorOk([{ type: "social.post.created", externalId: id, occurredAt: T0, payload: { objectId: id }, provenance: `${connectorId}:webhook` }]);
    },
    async poll(i) {
      const start = i.cursor === null ? 0 : Number.parseInt(i.cursor, 10) || 0;
      const events: CanonicalConnectorEvent[] = Array.from({ length: Math.min(i.limit, 2) }, (_v, k) => ({ type: "social.post.published", externalId: `post-${start + k}`, occurredAt: T0, payload: {}, provenance: `${connectorId}:poll` }));
      return connectorOk({ events, nextCursor: String(start + events.length) });
    },
  };
}

function socialRegistry(): ConnectorAdapterRegistry {
  return { meta: stubSocialAdapter("meta"), linkedin: stubSocialAdapter("linkedin"), x: stubSocialAdapter("x"), tiktok: stubSocialAdapter("tiktok") };
}

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters: ConnectorAdapterRegistry = socialRegistry();

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return { services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }), actor, ids, clock: () => T0, integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = socialRegistry();
  ctx = makeCtx(OWNER);
});

/** Install + OAuth-connect a social connector (token stored, status connected). */
async function connectSocial(connectorId: string, config: Record<string, unknown> = {}) {
  const inst = await installConnector(ctx, { workspaceId: WS, connectorId, config });
  const begin = await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/cb" });
  await completeConnectorOAuth(ctx, { state: begin.state, code: "c" });
  await validateConnectorConnection(ctx, inst.id);
  return inst;
}
async function oauthTokenRef(installationId: string): Promise<ConnectorSecretReference> {
  const r = await repos.secrets.listByInstallation(installationId);
  if (!r.ok) throw new Error("no refs");
  return r.value.find((x) => x.purpose === "oauth_token")!;
}

describe("marketplace — Meta / LinkedIn / X / TikTok are installable OAuth2 social connectors", () => {
  it("registers all four with normalized social capabilities", () => {
    const byId = Object.fromEntries(listConnectorCatalogue(makeCtx(OWNER)).map((c) => [c.id, c]));
    for (const id of ["meta", "linkedin", "x", "tiktok"]) {
      expect(byId[id]!.available, id).toBe(true);
      expect(byId[id]!.authMethod, id).toBe("oauth2");
      expect(byId[id]!.category, id).toBe("social");
      const keys = byId[id]!.capabilities.map((c) => c.key);
      for (const k of ["social.profile.read", "social.health"]) expect(keys, id).toContain(k);
    }
    // Provider-specific normalized subsets.
    expect(byId["meta"]!.capabilities.map((c) => c.key)).toContain("social.pages.list");
    expect(byId["linkedin"]!.capabilities.map((c) => c.key)).not.toContain("social.pages.list");
    expect(byId["x"]!.capabilities.map((c) => c.key)).toContain("social.search.read");
    expect(byId["tiktok"]!.capabilities.map((c) => c.key)).toContain("social.posts.publish");
  });
});

describe("capability invocation (read + write)", () => {
  it("invokes a read capability and records an audit row", async () => {
    const inst = await connectSocial("meta", { pageId: "pg1" });
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.list", input: { pageId: "pg1" } });
    expect(res.connectorId).toBe("meta");
    expect(res.capabilityKey).toBe("social.posts.list");
    const detail = await getInstallationDetail(ctx, inst.id);
    expect(detail.recentAudit.some((a) => a.operation === "invoke")).toBe(true);
  });
  it("invokes a write capability (create) for an authorized owner", async () => {
    const inst = await connectSocial("linkedin", { organizationId: "urn:li:organization:1" });
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.create", input: { message: "Hello" } });
    expect(res.capabilityKey).toBe("social.posts.create");
  });
  it("a client actor cannot invoke a social capability", async () => {
    const inst = await connectSocial("meta", { pageId: "pg1" });
    const clientCtx = { ...makeCtx(CLIENT), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    await expect(invokeConnectorCapability(clientCtx, { installationId: inst.id, capabilityKey: "social.posts.list", input: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("a missing provider scope surfaces as a permission error", async () => {
    adapters = { ...adapters, x: stubSocialAdapter("x", { denyScope: true }) };
    ctx = makeCtx(OWNER);
    const inst = await connectSocial("x");
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.create", input: { message: "gm" } })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("OAuth token lifecycle — refresh, rotation, reconnect", () => {
  it("transparently refreshes + rotates an expired access token before invoking", async () => {
    adapters = { ...adapters, meta: stubSocialAdapter("meta", { expiredExchange: true }) };
    ctx = makeCtx(OWNER);
    const inst = await connectSocial("meta", { pageId: "pg1" });
    const ref = await oauthTokenRef(inst.id);

    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.list", input: {} });
    expect(res.capabilityKey).toBe("social.posts.list");

    const after = secrets.peek(ref.secretRef);
    expect(after).toContain("at-refreshed");
    const updated = await oauthTokenRef(inst.id);
    expect(updated.validationState).toBe("valid");
    expect(updated.rotatedAt).not.toBeNull();
  });
  it("surfaces reconnect when the stored token is revoked out-of-band", async () => {
    const inst = await connectSocial("tiktok");
    const ref = await oauthTokenRef(inst.id);
    await secrets.revokeSecret(ref.secretRef);
    await expect(invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.list", input: {} })).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });
});

describe("webhook ingestion — verify, translate, idempotent replay", () => {
  it("ingests a signed Meta webhook then treats a replay as a duplicate", async () => {
    const inst = await connectSocial("meta", { pageId: "pg1", webhookSigningSecret: "whsig" });
    const rawBody = JSON.stringify({ id: "evt_1", field: "feed" });
    const first = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody, signature: "whsig" });
    expect(first.signatureValid).toBe(true);
    expect(first.eventCount).toBe(1);
    const replay = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody, signature: "whsig" });
    expect(replay.status).toBe("duplicate");
    expect(replay.eventCount).toBe(1);
  });
  it("rejects a webhook with an invalid signature", async () => {
    const inst = await connectSocial("meta", { pageId: "pg1", webhookSigningSecret: "whsig" });
    const res = await ingestConnectorWebhook(ctx, { installationId: inst.id, rawBody: JSON.stringify({ id: "evt_2" }), signature: "WRONG", externalEventId: "evt_2" });
    expect(res.signatureValid).toBe(false);
    expect(res.status).toBe("rejected");
  });
});

/** Provision an already-connected installation for polling (webhook+polling
 * connectors install webhook-first; an operator can run them as a polling source). */
async function setPollingTrigger(installationId: string) {
  const found = await repos.installations.getById(installationId);
  if (!found.ok || found.value === null) throw new Error("no installation");
  const next = { ...found.value, triggerKind: "polling" as const };
  const saved = await repos.installations.save(next, found.value.version);
  if (!saved.ok) throw new Error("could not set polling trigger");
}

describe("polling — replay safety", () => {
  it("advances the cursor and resumes from the new cursor", async () => {
    const inst = await connectSocial("linkedin", { organizationId: "urn:li:organization:1" });
    await setPollingTrigger(inst.id);
    const first = await pollConnector(ctx, { installationId: inst.id, limit: 2 });
    expect(first.eventCount).toBe(2);
    expect(first.cursor).toBe("2");
    const second = await pollConnector(ctx, { installationId: inst.id, limit: 2 });
    expect(second.cursor).toBe("4");
    expect(second.sequence).toBe(2);
  });
});

describe("secret non-leakage", () => {
  it("an operation result carries no token or secret material", async () => {
    const inst = await connectSocial("meta", { pageId: "pg1" });
    const res = await invokeConnectorCapability(ctx, { installationId: inst.id, capabilityKey: "social.posts.list", input: {} });
    const detail = await getInstallationDetail(ctx, inst.id);
    const blob = JSON.stringify({ res, detail });
    expect(blob).not.toContain("at-c");
    expect(blob).not.toContain("rt-c");
  });
});
