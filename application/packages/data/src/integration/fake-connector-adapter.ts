/* =============================================================================
 * Fake Connector adapter (F4.1) — the framework's reference implementation.
 *
 * A fully DETERMINISTIC, OFFLINE connector that exercises every seam of the
 * Integration Platform: connection validation, health, capability discovery, the
 * OAuth abstraction (authorize URL / code exchange / refresh), webhook signature
 * verification + translation, and cursor-based polling. It makes NO network call
 * and holds NO vendor SDK — it is the connector every test and the marketplace
 * demo run against. Real integrations implement the same `ConnectorAdapter` port
 * in their own data-layer adapter; NONE are implemented here (no Gmail/Slack/etc.).
 *
 * Signatures use a small deterministic HMAC-like scheme (djb2 over secret+body) so
 * the fake is dependency-free and reproducible; a real adapter would use a proper
 * cryptographic HMAC from its own transport module.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type CanonicalConnectorEvent, type ConnectorAdapter,
  type ConnectorAdapterRegistry, type ConnectorCapabilityResult, type ConnectorConnectionInput,
  type ConnectorConnectionValidationResult, type ConnectorHealthResult, type ConnectorResult,
  type ExchangeCodeInput, type OAuthTokenBundle, type PollInput, type PollResult,
  type RefreshTokenInput, type TranslateWebhookInput, type VerifiedWebhook, type VerifyWebhookInput,
} from "@brightloop/domain";

const PROVIDER_VERSION = "fake-1.0.0";

/** Deterministic, non-cryptographic signature (djb2) — for the FAKE connector only. */
function fakeSignature(secret: string, body: string): string {
  let h = 5381;
  const s = `${secret}::${body}`;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return `fsig_${h.toString(16)}`;
}

/** Parse a fake JSON body into a bounded event list, tolerating malformed input. */
function parseFakeEvents(rawBody: string, source: "webhook" | "polling"): CanonicalConnectorEvent[] {
  let parsed: unknown;
  try { parsed = JSON.parse(rawBody); } catch { return []; }
  const items = Array.isArray(parsed) ? parsed : (parsed as { events?: unknown })?.events;
  if (!Array.isArray(items)) return [];
  const out: CanonicalConnectorEvent[] = [];
  for (const it of items) {
    if (it === null || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const externalId = typeof o["id"] === "string" ? o["id"] : "";
    if (externalId.length === 0) continue;
    out.push({
      type: typeof o["type"] === "string" ? (o["type"] as string) : "record.changed",
      externalId,
      occurredAt: typeof o["at"] === "string" ? (o["at"] as string) : "1970-01-01T00:00:00.000Z",
      payload: (o["data"] !== null && typeof o["data"] === "object" && !Array.isArray(o["data"])) ? (o["data"] as Record<string, unknown>) : {},
      provenance: `fake:${source}`,
    });
  }
  return out;
}

/** Build a Fake Connector adapter bound to a connector id. */
export function createFakeConnectorAdapter(connectorId: string): ConnectorAdapter {
  const authed = (secret: string | null): boolean => secret !== null && secret.length > 0;

  return {
    connectorId,

    async validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>> {
      if (input.authMethod !== "none" && !authed(input.secret)) {
        return connectorErr("authentication", "missing credential", "no_secret");
      }
      return connectorOk({ reachable: true, authenticated: input.authMethod === "none" || authed(input.secret), providerVersion: PROVIDER_VERSION, latencyMs: 4 });
    },

    async healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>> {
      const level = input.authMethod === "none" || authed(input.secret) ? "healthy" as const : "unauthorized" as const;
      return connectorOk({ level, providerVersion: PROVIDER_VERSION, latencyMs: 3, detail: { probe: "ok" } });
    },

    async discoverCapabilities(_input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorCapabilityResult[]>> {
      return connectorOk([
        { operation: "list_records", supported: true },
        { operation: "upsert_record", supported: true },
        { operation: "subscribe", supported: true },
        { operation: "list_items", supported: true },
      ]);
    },

    /* -- OAuth -- */
    buildAuthorizationUrl(input: BuildAuthorizationUrlInput): ConnectorResult<string> {
      const scopes = input.scopes.join("+");
      const url = `https://auth.fake.invalid/authorize?client=fake&state=${encodeURIComponent(input.state)}&redirect_uri=${encodeURIComponent(input.redirectUri)}&scope=${encodeURIComponent(scopes)}`;
      return connectorOk(url);
    },
    async exchangeAuthorizationCode(input: ExchangeCodeInput): Promise<ConnectorResult<OAuthTokenBundle>> {
      if (input.code.length === 0) return connectorErr("validation", "empty authorization code", "no_code");
      return connectorOk({ accessToken: `fake-access-${input.code}`, refreshToken: `fake-refresh-${input.code}`, scopes: ["read", "offline_access"], expiresAt: null, tokenType: "bearer" });
    },
    async refreshAccessToken(input: RefreshTokenInput): Promise<ConnectorResult<OAuthTokenBundle>> {
      if (input.refreshToken.length === 0) return connectorErr("authorization", "empty refresh token", "no_refresh");
      return connectorOk({ accessToken: `fake-access-refreshed`, refreshToken: input.refreshToken, scopes: ["read", "offline_access"], expiresAt: null, tokenType: "bearer" });
    },

    /* -- webhook -- */
    verifyWebhook(input: VerifyWebhookInput): ConnectorResult<VerifiedWebhook> {
      if (input.signingSecret === null) return connectorErr("secret_unavailable", "no signing secret", null);
      const expected = fakeSignature(input.signingSecret, input.rawBody);
      const valid = input.signature !== null && input.signature === expected;
      if (!valid) return connectorErr("signature_invalid", "webhook signature did not verify", "bad_signature");
      // The external event id is the first event's id (or a body-derived id).
      const events = parseFakeEvents(input.rawBody, "webhook");
      const externalEventId = events[0]?.externalId ?? fakeSignature("evt", input.rawBody);
      return connectorOk({ valid: true, externalEventId });
    },
    translateWebhook(input: TranslateWebhookInput): ConnectorResult<CanonicalConnectorEvent[]> {
      return connectorOk(parseFakeEvents(input.rawBody, "webhook"));
    },

    /* -- polling -- */
    async poll(input: PollInput): Promise<ConnectorResult<PollResult>> {
      if (input.authMethod !== "none" && !authed(input.secret)) return connectorErr("authentication", "missing credential", "no_secret");
      // Deterministic: advance the cursor by one page; emit `limit`-bounded events.
      const start = input.cursor === null ? 0 : Number.parseInt(input.cursor, 10) || 0;
      const count = Math.min(input.limit, 2); // small, deterministic page
      const events: CanonicalConnectorEvent[] = Array.from({ length: count }, (_v, i) => ({
        type: "record.changed",
        externalId: `poll-${start + i}`,
        occurredAt: "1970-01-01T00:00:00.000Z",
        payload: { index: start + i },
        provenance: "fake:polling",
      }));
      const nextCursor = String(start + count);
      return connectorOk({ events, nextCursor });
    },
  };
}

/**
 * The default connector adapter registry: the two live FAKE connectors. Real
 * integrations register their own adapters here later. NONE are shipped now.
 */
export function createDefaultConnectorAdapters(): ConnectorAdapterRegistry {
  return {
    "fake-connector": createFakeConnectorAdapter("fake-connector"),
    "fake-oauth": createFakeConnectorAdapter("fake-oauth"),
  };
}
