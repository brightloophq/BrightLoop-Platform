/* =============================================================================
 * Integration Platform — pure domain tests (F4.1). Deterministic, offline.
 * ========================================================================== */

import { describe, it, expect } from "vitest";
import {
  findConnector, isKnownConnector, isAvailableConnector, listConnectors,
  connectorSupportsTrigger, findConnectorCapability,
  canTransitionInstallation, isInstallationTerminal, canTransitionOAuthGrant, isOAuthGrantTerminal,
  validateConnectorConfig, isConfigComplete, resolveEnabledCapabilities,
  buildOAuthState, verifyOAuthState, normalizeScopes, isTokenExpired, scopesSatisfied,
  normalizeTranslatedEvents, isWellFormed, MAX_EVENTS_PER_TURN,
  sanitizeConnectorMetadata, hasNoConnectorSecrets, isSecretKey,
  statusFromHealth, healthFromFailure, normalizeConnectorFailure,
  installKey, connectorWebhookKey, pollKey, eventKey, oauthKey,
  buildConnectorInstallation, buildConnectorSecretReference,
} from "./index.js";
import type { CanonicalConnectorEvent } from "./index.js";

const FAKE = findConnector("fake-connector")!;

describe("connector registry", () => {
  it("holds the fake connector as available and examples as unavailable", () => {
    expect(isKnownConnector("fake-connector")).toBe(true);
    expect(isAvailableConnector("fake-connector")).toBe(true);
    expect(isAvailableConnector("example-oauth")).toBe(false);
    expect(isKnownConnector("gmail")).toBe(false); // no vendor implemented
  });
  it("descriptors are frozen and valid", () => {
    expect(Object.isFrozen(FAKE)).toBe(true);
    expect(FAKE.capabilities.length).toBeGreaterThan(0);
  });
  it("filters by category and resolves capabilities/triggers", () => {
    expect(listConnectors("custom").some((c) => c.id === "fake-connector")).toBe(true);
    expect(connectorSupportsTrigger("fake-connector", "webhook")).toBe(true);
    expect(connectorSupportsTrigger("fake-connector", "none")).toBe(false);
    expect(findConnectorCapability("fake-connector", "records.read")?.sideEffect).toBe("read");
  });
  it("registers the four Google Workspace production connectors (F4.2)", () => {
    for (const id of ["google-gmail", "google-calendar", "google-drive", "google-contacts"]) {
      const c = findConnector(id);
      expect(c, id).not.toBeNull();
      expect(c!.available).toBe(true);
      expect(c!.authMethod).toBe("oauth2");
      expect(c!.vendor).toBe("Google");
      expect(c!.scopes.length).toBeGreaterThan(0);
      expect(c!.capabilities.length).toBeGreaterThan(0);
    }
  });
  it("Gmail send is an external side effect; read is a read side effect", () => {
    expect(findConnectorCapability("google-gmail", "gmail.send")?.sideEffect).toBe("external");
    expect(findConnectorCapability("google-gmail", "gmail.read")?.sideEffect).toBe("read");
  });
  it("registers the three commerce connectors with normalized capabilities (F4.4)", () => {
    for (const id of ["shopify", "stripe", "paypal"]) {
      const c = findConnector(id);
      expect(c, id).not.toBeNull();
      expect(c!.available).toBe(true);
      expect(c!.authMethod).toBe("api_key");
      expect(c!.category).toBe("commerce");
      expect(c!.capabilities.length).toBeGreaterThan(0);
      // NORMALIZED: every commerce provider shares the same operation naming + health.
      expect(findConnectorCapability(id, "commerce.health")?.operation).toBe("commerce.health");
    }
    // Shared normalized refund capability across all three providers.
    for (const id of ["shopify", "stripe", "paypal"]) {
      expect(findConnectorCapability(id, "commerce.payments.refund")?.operation).toBe("commerce.payments.refund");
    }
    // Provider-specific normalized subsets: Stripe exposes subscriptions; PayPal does not.
    expect(findConnectorCapability("stripe", "commerce.subscriptions.read")).not.toBeNull();
    expect(findConnectorCapability("paypal", "commerce.subscriptions.read")).toBeNull();
    // Write operations that reach a provider are `external` side effects.
    expect(findConnectorCapability("stripe", "commerce.payments.refund")?.sideEffect).toBe("external");
    expect(findConnectorCapability("shopify", "commerce.products.read")?.sideEffect).toBe("read");
  });
});

describe("installation lifecycle", () => {
  it("allows only declared transitions", () => {
    expect(canTransitionInstallation("pending_configuration", "configuring")).toBe(true);
    expect(canTransitionInstallation("validating", "connected")).toBe(true);
    expect(canTransitionInstallation("connected", "pending_configuration")).toBe(false);
    expect(canTransitionInstallation("revoked", "connected")).toBe(false);
  });
  it("revoked is terminal", () => {
    expect(isInstallationTerminal("revoked")).toBe(true);
    expect(isInstallationTerminal("connected")).toBe(false);
  });
});

describe("oauth grant lifecycle", () => {
  it("progresses pending → authorized → exchanged", () => {
    expect(canTransitionOAuthGrant("pending", "authorized")).toBe(true);
    expect(canTransitionOAuthGrant("authorized", "exchanged")).toBe(true);
    expect(canTransitionOAuthGrant("exchanged", "authorized")).toBe(false);
    expect(isOAuthGrantTerminal("exchanged")).toBe(true);
  });
});

describe("config validation + secret separation", () => {
  it("splits secret fields out of persisted config", () => {
    const r = validateConnectorConfig(FAKE, { workspaceRef: "w1", region: "us", apiKey: "sk-live-123" });
    expect(r.ok).toBe(true);
    expect(r.config).toEqual({ workspaceRef: "w1", region: "us" });
    expect(r.secrets).toEqual({ apiKey: "sk-live-123" });
    expect(r.config.apiKey).toBeUndefined();
  });
  it("flags missing required fields and bad enum/type", () => {
    const r = validateConnectorConfig(FAKE, { region: "mars" });
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.field)).toContain("workspaceRef");
    expect(r.issues.map((i) => i.field)).toContain("apiKey");
    expect(r.issues.find((i) => i.field === "region")?.message).toMatch(/one of/);
  });
  it("drops unknown keys and computes completeness", () => {
    const r = validateConnectorConfig(FAKE, { workspaceRef: "w1", apiKey: "k", evil: "x" });
    expect((r.config as Record<string, unknown>).evil).toBeUndefined();
    expect(isConfigComplete(FAKE, r)).toBe(true);
  });
  it("resolves enabled capabilities to declared ones only", () => {
    expect(resolveEnabledCapabilities(FAKE, ["records.read", "not.real"])).toEqual(["records.read"]);
  });
});

describe("oauth pure helpers", () => {
  it("builds and verifies state deterministically", () => {
    const s = buildOAuthState("inst_1", "nonce_abc");
    expect(s).toBe(buildOAuthState("inst_1", "nonce_abc"));
    expect(verifyOAuthState(s, s)).toBe(true);
    expect(verifyOAuthState(s, "other")).toBe(false);
    expect(verifyOAuthState("", "")).toBe(false);
  });
  it("normalizes scopes and checks satisfaction/expiry", () => {
    expect(normalizeScopes([" read ", "read", "write"])).toEqual(["read", "write"]);
    expect(scopesSatisfied(["read"], ["read", "write"])).toBe(true);
    expect(scopesSatisfied(["admin"], ["read"])).toBe(false);
    expect(isTokenExpired("2020-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(isTokenExpired(null, "2026-01-01T00:00:00.000Z")).toBe(false);
  });
});

describe("event translation", () => {
  const ev = (externalId: string, type = "message.received"): CanonicalConnectorEvent =>
    ({ externalId, type, occurredAt: "2026-08-02T00:00:00.000Z", payload: { hi: "there" }, provenance: "fake" });

  it("dedupes by (externalId, type) and drops malformed", () => {
    const turn = normalizeTranslatedEvents([ev("a"), ev("a"), ev("b"), { ...ev(""), externalId: "" }]);
    expect(turn.events.map((e) => e.externalId)).toEqual(["a", "b"]);
    expect(turn.dropped).toBe(2);
  });
  it("sanitizes secret material out of payloads", () => {
    const turn = normalizeTranslatedEvents([{ ...ev("c"), payload: { ok: 1, apiKey: "leak" } }]);
    expect(turn.events[0]!.payload.apiKey).toBeUndefined();
    expect(turn.events[0]!.payload.ok).toBe(1);
  });
  it("caps the batch", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_TURN + 10 }, (_v, i) => ev(String(i)));
    const turn = normalizeTranslatedEvents(many);
    expect(turn.events.length).toBe(MAX_EVENTS_PER_TURN);
    expect(turn.dropped).toBe(10);
  });
  it("isWellFormed requires id, type, occurredAt", () => {
    expect(isWellFormed(ev("x"))).toBe(true);
    expect(isWellFormed({ ...ev("x"), occurredAt: "" })).toBe(false);
  });
});

describe("redaction", () => {
  it("detects secret keys and strips them", () => {
    expect(isSecretKey("apiKey")).toBe(true);
    expect(isSecretKey("access_token")).toBe(true);
    expect(isSecretKey("region")).toBe(false);
    const clean = sanitizeConnectorMetadata({ region: "us", apiKey: "x", nested: { password: "p", ok: 1 } });
    expect(clean.apiKey).toBeUndefined();
    expect((clean.nested as Record<string, unknown>).password).toBeUndefined();
    expect(hasNoConnectorSecrets(clean)).toBe(true);
    expect(hasNoConnectorSecrets({ token: "x" })).toBe(false);
  });
});

describe("health + failure normalization", () => {
  it("maps health to installation status", () => {
    expect(statusFromHealth("healthy")).toBe("connected");
    expect(statusFromHealth("unauthorized")).toBe("error");
    expect(statusFromHealth("degraded")).toBe("degraded");
  });
  it("maps failure to health and retry disposition", () => {
    expect(healthFromFailure("authentication")).toBe("unauthorized");
    expect(healthFromFailure("network")).toBe("unavailable");
    expect(normalizeConnectorFailure("timeout").retryable).toBe(true);
    expect(normalizeConnectorFailure("authentication").retryable).toBe(false);
    expect(normalizeConnectorFailure("timeout").userMessage).not.toContain("secret");
  });
});

describe("idempotency keys are deterministic", () => {
  it("derives stable keys from natural identity", () => {
    expect(installKey("w", "fake-connector")).toBe("install:w:fake-connector");
    expect(connectorWebhookKey("i", "evt1")).toBe("webhook:i:evt1");
    expect(pollKey("i", null)).toBe("poll:i:genesis");
    expect(eventKey("i", "webhook", "e", "t")).toBe("event:i:webhook:e:t");
    expect(oauthKey("i", "st")).toBe("oauth:i:st");
  });
});

describe("builders produce safe, well-formed rows", () => {
  it("installation carries no secret material in config", () => {
    const inst = buildConnectorInstallation({
      id: "i1", workspaceId: "w", clientId: null, connectorId: "fake-connector",
      displayName: "My Fake", authMethod: "api_key", triggerKind: "webhook",
      config: { region: "us", apiKey: "should-be-dropped" }, enabledCapabilities: ["records.read"],
      secretReferenceId: "sref_1", createdByUserId: "u1", correlationId: "corr", now: "2026-08-02T00:00:00.000Z",
    });
    expect(inst.status).toBe("pending_configuration");
    expect(inst.version).toBe(1);
    expect(hasNoConnectorSecrets(inst.config)).toBe(true);
    expect(inst.config.apiKey).toBeUndefined();
  });
  it("secret reference stores only a ref + posture", () => {
    const ref = buildConnectorSecretReference({
      id: "s1", workspaceId: "w", clientId: null, connectorInstallationId: "i1",
      connectorId: "fake-connector", purpose: "credential", secretRef: "csec_1",
      createdByUserId: "u1", now: "2026-08-02T00:00:00.000Z",
    });
    expect(ref.secretRef).toBe("csec_1");
    expect(ref.validationState).toBe("unverified");
    expect(hasNoConnectorSecrets(ref.metadata)).toBe(true);
  });
});
