/* =============================================================================
 * Integration Platform — TEST SUPPORT (F4.1).
 *
 * A deterministic in-memory repository bundle, an in-memory ConnectorSecretStore
 * (secret VALUES never leave it), and compact FAKE connector adapters (api_key +
 * oauth2) that exercise the full matrix offline. Mirrors adapter semantics; used
 * by the application use-case tests. No network, no clock.
 * ========================================================================== */

import {
  connectorErr, connectorOk, ok,
  type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorSecretMetadata, type ConnectorSecretStore, type IntegrationRepositories, type RuntimeResult,
} from "@brightloop/domain";
import type {
  ConnectorAuditEvent, ConnectorEvent, ConnectorHealthSnapshot, ConnectorInstallation,
  ConnectorOAuthGrant, ConnectorPollingCursor, ConnectorSecretReference, ConnectorWebhookReceipt,
} from "@brightloop/schema";

const conflict = (): RuntimeResult<never> => ({ ok: false, code: "conflict", message: "version mismatch", detail: null });

/* ---- in-memory repositories ------------------------------------------------ */

export function createInMemoryIntegrationRepos(): IntegrationRepositories {
  const installations = new Map<string, ConnectorInstallation>();
  const secrets = new Map<string, ConnectorSecretReference>();
  const oauthGrants = new Map<string, ConnectorOAuthGrant>();
  const health: ConnectorHealthSnapshot[] = [];
  const events: ConnectorEvent[] = [];
  const webhooks: ConnectorWebhookReceipt[] = [];
  const cursors: ConnectorPollingCursor[] = [];
  const audit: ConnectorAuditEvent[] = [];

  return {
    installations: {
      create: async (r) => { installations.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", installations.get(id) ?? null),
      findByConnector: async (w, c) => ok("found", [...installations.values()].find((i) => i.workspaceId === w && i.connectorId === c) ?? null),
      listByWorkspace: async (w) => ok("found", [...installations.values()].filter((i) => i.workspaceId === w)),
      save: async (next, expected) => { const cur = installations.get(next.id); if (!cur || cur.version !== expected) return conflict(); installations.set(next.id, next); return ok("updated", next); },
    },
    secrets: {
      create: async (r) => { secrets.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", secrets.get(id) ?? null),
      listByInstallation: async (id) => ok("found", [...secrets.values()].filter((s) => s.connectorInstallationId === id)),
      save: async (next) => { secrets.set(next.id, next); return ok("updated", next); },
    },
    health: {
      append: async (r) => { health.push(r); return ok("created", r); },
      listByInstallation: async (id, limit) => ok("found", health.filter((h) => h.connectorInstallationId === id).slice(-limit).reverse()),
    },
    events: {
      append: async (r) => { events.push(r); return ok("created", r); },
      findByIdempotencyKey: async (key) => ok("found", events.find((e) => e.idempotencyKey === key) ?? null),
      listByInstallation: async (id, limit) => ok("found", events.filter((e) => e.connectorInstallationId === id).slice(-limit).reverse()),
    },
    webhooks: {
      append: async (r) => { webhooks.push(r); return ok("created", r); },
      findByIdempotencyKey: async (key) => ok("found", webhooks.find((w) => w.idempotencyKey === key) ?? null),
      listByInstallation: async (id, limit) => ok("found", webhooks.filter((w) => w.connectorInstallationId === id).slice(-limit).reverse()),
    },
    cursors: {
      append: async (r) => { cursors.push(r); return ok("created", r); },
      findByIdempotencyKey: async (key) => ok("found", cursors.find((c) => c.idempotencyKey === key) ?? null),
      latest: async (id) => ok("found", cursors.filter((c) => c.connectorInstallationId === id).sort((a, b) => b.sequence - a.sequence)[0] ?? null),
    },
    oauthGrants: {
      create: async (r) => { oauthGrants.set(r.id, r); return ok("created", r); },
      getById: async (id) => ok("found", oauthGrants.get(id) ?? null),
      findByState: async (state) => ok("found", [...oauthGrants.values()].find((g) => g.stateToken === state) ?? null),
      save: async (next, expected) => { const cur = oauthGrants.get(next.id); if (!cur || cur.version !== expected) return conflict(); oauthGrants.set(next.id, next); return ok("updated", next); },
    },
    audit: {
      append: async (r) => { audit.push(r); return ok("created", r); },
      listByInstallation: async (id, limit) => ok("found", audit.filter((a) => a.connectorInstallationId === id).slice(-limit).reverse()),
    },
  };
}

/* ---- in-memory secret store ------------------------------------------------ */

export function createInMemoryConnectorSecretStore(): ConnectorSecretStore & { peek(ref: string): string | null } {
  const map = new Map<string, { value: string; metadata: ConnectorSecretMetadata }>();
  return {
    async putSecret(ref, value, metadata) { map.set(ref, { value, metadata }); },
    async getSecret(ref) { return map.get(ref)?.value ?? null; },
    async rotateSecret(ref, value) { const cur = map.get(ref); const version = cur ? String(Number(cur.metadata.version) + 1) : "1"; map.set(ref, { value, metadata: cur ? { ...cur.metadata, version } : { connectorId: "", purpose: "credential", version, rotatedAt: null, expiresAt: null } }); return version; },
    async revokeSecret(ref) { map.delete(ref); },
    async validateSecretReference(ref) { return map.has(ref) ? { valid: true, reason: null } : { valid: false, reason: "not provisioned" }; },
    peek(ref) { return map.get(ref)?.value ?? null; },
  };
}

/* ---- compact fake adapters ------------------------------------------------- */

function fakeSig(secret: string, body: string): string {
  let h = 5381; const s = `${secret}::${body}`;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `fsig_${h.toString(16)}`;
}

function parseEvents(rawBody: string): CanonicalConnectorEvent[] {
  let parsed: unknown; try { parsed = JSON.parse(rawBody); } catch { return []; }
  const items = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown })?.events;
  if (!Array.isArray(items)) return [];
  const out: CanonicalConnectorEvent[] = [];
  for (const it of items) {
    if (it === null || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const externalId = typeof o["id"] === "string" ? o["id"] : "";
    if (externalId.length === 0) continue;
    out.push({ type: typeof o["type"] === "string" ? (o["type"] as string) : "record.changed", externalId, occurredAt: typeof o["at"] === "string" ? (o["at"] as string) : "1970-01-01T00:00:00.000Z", payload: {}, provenance: "fake" });
  }
  return out;
}

/** A deterministic test adapter (used for both api_key + oauth2 fakes). */
export function createTestConnectorAdapter(connectorId: string): ConnectorAdapter {
  const authed = (s: string | null) => s !== null && s.length > 0;
  return {
    connectorId,
    async validateConnection(input) { if (input.authMethod !== "none" && !authed(input.secret)) return connectorErr("authentication", "no secret"); return connectorOk({ reachable: true, authenticated: true, providerVersion: "test-1", latencyMs: 1 }); },
    async healthCheck(input) { return connectorOk({ level: input.authMethod === "none" || authed(input.secret) ? "healthy" : "unauthorized", providerVersion: "test-1", latencyMs: 1, detail: {} }); },
    async discoverCapabilities() { return connectorOk([{ operation: "list_records", supported: true }]); },
    buildAuthorizationUrl(input) { return connectorOk(`https://auth.test/authorize?state=${encodeURIComponent(input.state)}`); },
    async exchangeAuthorizationCode(input) { if (input.code.length === 0) return connectorErr("validation", "no code"); return connectorOk({ accessToken: `at-${input.code}`, refreshToken: `rt-${input.code}`, scopes: ["read"], expiresAt: null, tokenType: "bearer" }); },
    async refreshAccessToken(input) { return connectorOk({ accessToken: "at-refreshed", refreshToken: input.refreshToken, scopes: ["read"], expiresAt: null, tokenType: "bearer" }); },
    verifyWebhook(input) { if (input.signingSecret === null) return connectorErr("secret_unavailable", "no signing secret"); const valid = input.signature === fakeSig(input.signingSecret, input.rawBody); if (!valid) return connectorErr("signature_invalid", "bad signature"); const ev = parseEvents(input.rawBody); return connectorOk({ valid: true, externalEventId: ev[0]?.externalId ?? "evt" }); },
    translateWebhook(input) { return connectorOk(parseEvents(input.rawBody)); },
    async poll(input) { const start = input.cursor === null ? 0 : Number.parseInt(input.cursor, 10) || 0; const count = Math.min(input.limit, 2); const events: CanonicalConnectorEvent[] = Array.from({ length: count }, (_v, i) => ({ type: "record.changed", externalId: `poll-${start + i}`, occurredAt: "1970-01-01T00:00:00.000Z", payload: { index: start + i }, provenance: "fake" })); return connectorOk({ events, nextCursor: String(start + count) }); },
    async execute(input) { if (input.authMethod !== "none" && (input.secret === null || input.secret.length === 0)) return connectorErr("authentication", "no secret"); return connectorOk({ data: { operation: input.operation, echoed: input.input } }); },
  };
}

/** Compute the deterministic signature a caller must send for a given body/secret. */
export function testWebhookSignature(signingSecret: string, rawBody: string): string {
  return fakeSig(signingSecret, rawBody);
}

export function createTestConnectorAdapters(): ConnectorAdapterRegistry {
  return { "fake-connector": createTestConnectorAdapter("fake-connector"), "fake-oauth": createTestConnectorAdapter("fake-oauth") };
}
