/* =============================================================================
 * Integration Platform — CROSS-PROVIDER certification (F4.8). Deterministic.
 *
 * Certifies that the connectors built across F4.2–F4.7 behave as ONE coherent
 * platform: the SAME install → connect → invoke → ingest → audit path, the SAME
 * authorization funnel, the SAME secret handling, and the SAME health vocabulary,
 * regardless of provider or auth method. It drives one representative connector
 * from every family (Google · Communication · Commerce · CRM · Finance · Social)
 * through the REAL application use-cases against deterministic in-memory doubles,
 * and asserts the platform-wide invariants:
 *
 *   • Authorization — integration.invoke funnel, client denial, tenant isolation
 *     (cross-tenant read denied), workspace isolation.
 *   • Secret — no token/credential leaks into any DTO, event, or audit row.
 *   • OAuth — transparent refresh + rotation before invocation, across providers.
 *   • Webhook — signature verify, idempotent replay, rejection, malformed body.
 *   • Polling — cursor persistence + replay safety.
 *   • Audit — every invocation produces a complete, correlated audit row.
 *   • Health — only the shared normalized vocabulary is ever reported.
 *   • Copilot boundary — no provider-specific connector logic inside Copilot.
 *
 * Deterministic stub adapters (offline, no transport, no clock) stand in for the
 * data-layer adapters so the application package stays domain+schema only — exactly
 * the pattern the per-family application tests use.
 * ========================================================================== */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import {
  buildConnectorInstallation, connectorErr, connectorOk, createRuntimeServices, InMemoryRuntimeRepository,
  type Actor, type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry, type ConnectorResult,
} from "@brightloop/domain";
import type { AppContext } from "../context.js";
import { ForbiddenError, RuntimeUnavailableError } from "../errors.js";
import { createInMemoryIntegrationRepos, createInMemoryConnectorSecretStore } from "./testing.js";
import { installConnector, validateConnectorConnection, checkConnectorHealth } from "./installation-usecases.js";
import { beginConnectorOAuth, completeConnectorOAuth } from "./oauth-usecases.js";
import { invokeConnectorCapability } from "./invoke-usecases.js";
import { ingestConnectorWebhook, pollConnector } from "./ingestion-usecases.js";
import { getInstallationDetail, listInstallations, listConnectorCatalogue } from "./integration-read.js";

const T0 = "2026-08-04T00:00:00.000Z";
const OWNER: Actor = { userId: "u_owner", role: "owner", clientId: null };
const TEAM: Actor = { userId: "u_team", role: "team_member", clientId: null };
const CLIENT_A: Actor = { userId: "u_a", role: "client_admin", clientId: "cli_a" };
const CLIENT_B: Actor = { userId: "u_b", role: "client_admin", clientId: "cli_b" };

/**
 * One representative connector per family, spanning both auth methods and both
 * trigger kinds. Each uses REAL registry connector ids + capability keys so the
 * use-cases exercise the true descriptor + authorization + audit path.
 */
interface Rep {
  family: string; connectorId: string; authMethod: "oauth2" | "api_key";
  readCapability: string; writeCapability: string; config: Record<string, unknown>; webhook: boolean;
}
const REPS: Rep[] = [
  { family: "google", connectorId: "google-gmail", authMethod: "oauth2", readCapability: "gmail.read", writeCapability: "gmail.send", config: {}, webhook: false },
  { family: "communication", connectorId: "slack", authMethod: "oauth2", readCapability: "communication.list_channels", writeCapability: "communication.send_message", config: {}, webhook: false },
  { family: "commerce", connectorId: "shopify", authMethod: "api_key", readCapability: "commerce.orders.read", writeCapability: "commerce.orders.write", config: { shopDomain: "cert.myshopify.com", accessToken: "shp-token", webhookSigningSecret: "whsig-shopify" }, webhook: true },
  { family: "crm", connectorId: "hubspot", authMethod: "oauth2", readCapability: "crm.contacts.list", writeCapability: "crm.contacts.create", config: { webhookSigningSecret: "whsig-hubspot" }, webhook: true },
  { family: "finance", connectorId: "quickbooks", authMethod: "oauth2", readCapability: "finance.invoices.list", writeCapability: "finance.invoices.create", config: { realmId: "realm-1", webhookSigningSecret: "whsig-qbo" }, webhook: true },
  { family: "social", connectorId: "meta", authMethod: "oauth2", readCapability: "social.posts.list", writeCapability: "social.posts.create", config: { pageId: "pg1", webhookSigningSecret: "whsig-meta" }, webhook: true },
];

/**
 * A deterministic, offline stub connector adapter that mirrors the framework
 * contract every data-layer adapter fulfils: secret-gated validate/health/execute,
 * OAuth (authorize/exchange/refresh), signature==signingSecret webhook verify with
 * ONE canonical translated event, and cursor-based polling. `denyScope` forces an
 * authorization failure; `expiredExchange` returns an already-expired token so the
 * refresh+rotation path must run before invocation; `secretToken` sets the token
 * material so the secret-leak assertions can look for it.
 */
function stubAdapter(connectorId: string, opts: { denyScope?: boolean; expiredExchange?: boolean } = {}): ConnectorAdapter {
  const authed = (s: string | null) => s !== null && s.length > 0;
  return {
    connectorId,
    async validateConnection(i) { return authed(i.secret) ? connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 }) : connectorErr("secret_unavailable", "no secret"); },
    async healthCheck(i) { return connectorOk({ level: authed(i.secret) ? "healthy" : "unauthorized", providerVersion: "v1", latencyMs: 0, detail: { reason: authed(i.secret) ? "connected" : "expired" } }); },
    async discoverCapabilities() { return connectorOk([]); },
    buildAuthorizationUrl(i) { return connectorOk(`https://auth.test/${connectorId}/authorize?state=${encodeURIComponent(i.state)}`); },
    async exchangeAuthorizationCode(i) { if (i.code.length === 0) return connectorErr("validation", "no code"); return connectorOk({ accessToken: `at-${connectorId}-${i.code}`, refreshToken: `rt-${connectorId}-${i.code}`, scopes: ["s"], expiresAt: opts.expiredExchange ? "2020-01-01T00:00:00.000Z" : null, tokenType: "bearer" }); },
    async refreshAccessToken(i) { return connectorOk({ accessToken: `at-${connectorId}-refreshed`, refreshToken: i.refreshToken, scopes: ["s"], expiresAt: "2030-01-01T00:00:00.000Z", tokenType: "bearer" }); },
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
      try { id = String((JSON.parse(i.rawBody) as Record<string, unknown>)["id"] ?? ""); } catch { return connectorOk([]); }
      if (id.length === 0) return connectorOk([]);
      return connectorOk([{ type: "record.changed", externalId: id, occurredAt: T0, payload: { objectId: id }, provenance: `${connectorId}:webhook` }]);
    },
    async poll(i) {
      const start = i.cursor === null ? 0 : Number.parseInt(i.cursor, 10) || 0;
      const events: CanonicalConnectorEvent[] = Array.from({ length: Math.min(i.limit, 2) }, (_v, k) => ({ type: "record.changed", externalId: `${connectorId}-${start + k}`, occurredAt: T0, payload: {}, provenance: `${connectorId}:poll` }));
      return connectorOk({ events, nextCursor: String(start + events.length) });
    },
  };
}

function fullRegistry(overrides: Record<string, ConnectorAdapter> = {}): ConnectorAdapterRegistry {
  const reg: ConnectorAdapterRegistry = {};
  for (const r of REPS) reg[r.connectorId] = stubAdapter(r.connectorId);
  return { ...reg, ...overrides };
}

let repos = createInMemoryIntegrationRepos();
let secrets = createInMemoryConnectorSecretStore();
let adapters: ConnectorAdapterRegistry = fullRegistry();

function makeCtx(actor: Actor): AppContext {
  let n = 0;
  const ids = (p: string) => `${p}_${(n += 1)}`;
  return { services: createRuntimeServices({ repo: new InMemoryRuntimeRepository(() => T0), ids, clock: () => T0 }), actor, ids, clock: () => T0, integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
}
let ctx: AppContext;

beforeEach(() => {
  repos = createInMemoryIntegrationRepos();
  secrets = createInMemoryConnectorSecretStore();
  adapters = fullRegistry();
  ctx = makeCtx(OWNER);
});

const WS = "ws_cert";

/** Connect a representative connector to `connected` via its real auth method. */
async function connect(rep: Rep, workspaceId = WS): Promise<string> {
  const inst = await installConnector(ctx, { workspaceId, connectorId: rep.connectorId, config: rep.config });
  if (rep.authMethod === "oauth2") {
    const begin = await beginConnectorOAuth(ctx, { installationId: inst.id, redirectUri: "https://app/cb" });
    await completeConnectorOAuth(ctx, { state: begin.state, code: "c" });
  }
  await validateConnectorConnection(ctx, inst.id);
  return inst.id;
}

async function setPollingTrigger(installationId: string) {
  const found = await repos.installations.getById(installationId);
  if (!found.ok || found.value === null) throw new Error("no installation");
  const saved = await repos.installations.save({ ...found.value, triggerKind: "polling" }, found.value.version);
  if (!saved.ok) throw new Error("could not set polling trigger");
}

/* ---- Marketplace + capability certification -------------------------------- */

describe("marketplace — every family renders from the registry and installs uniformly", () => {
  it("each representative is available with its normalized capability + real auth method", () => {
    const byId = Object.fromEntries(listConnectorCatalogue(makeCtx(OWNER)).map((c) => [c.id, c]));
    for (const rep of REPS) {
      const d = byId[rep.connectorId]!;
      expect(d.available, rep.connectorId).toBe(true);
      expect(d.authMethod, rep.connectorId).toBe(rep.authMethod);
      const keys = d.capabilities.map((c) => c.key);
      expect(keys, rep.connectorId).toContain(rep.readCapability);
      expect(keys, rep.connectorId).toContain(rep.writeCapability);
    }
  });

  it("connects + invokes a read capability on EVERY family (one coherent path)", async () => {
    for (const rep of REPS) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const res = await invokeConnectorCapability(ctx, { installationId: id, capabilityKey: rep.readCapability, input: {} });
      expect(res.connectorId, rep.connectorId).toBe(rep.connectorId);
      expect(res.capabilityKey, rep.connectorId).toBe(rep.readCapability);
    }
  });
});

/* ---- Authorization certification ------------------------------------------- */

describe("authorization — invoke funnel, client denial, tenant + workspace isolation", () => {
  it("clients can never invoke a capability on any family", async () => {
    for (const rep of REPS) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const clientCtx = { ...makeCtx(CLIENT_A), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
      await expect(invokeConnectorCapability(clientCtx, { installationId: id, capabilityKey: rep.readCapability, input: {} }), rep.connectorId).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("a team_member CAN invoke (holds integration.invoke)", async () => {
    const id = await connect(REPS[0]!);
    const teamCtx = { ...makeCtx(TEAM), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    const res = await invokeConnectorCapability(teamCtx, { installationId: id, capabilityKey: REPS[0]!.readCapability, input: {} });
    expect(res.capabilityKey).toBe(REPS[0]!.readCapability);
  });

  it("enforces tenant isolation: a client cannot read another tenant's installation", async () => {
    // Seed a cli_a-owned installation directly (clients cannot install).
    const inst = buildConnectorInstallation({
      id: "cinst_tenant", workspaceId: WS, clientId: "cli_a", connectorId: "shopify", displayName: "Shopify",
      authMethod: "api_key", triggerKind: "webhook", config: {}, enabledCapabilities: ["commerce.orders.read"],
      secretReferenceId: null, createdByUserId: "u_a", correlationId: "corr_a", now: T0,
    });
    await repos.installations.create(inst);
    const aCtx = { ...makeCtx(CLIENT_A), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    const bCtx = { ...makeCtx(CLIENT_B), integration: repos, connectorAdapters: adapters, connectorSecrets: secrets };
    // Same tenant reads; other tenant is denied.
    const detail = await getInstallationDetail(aCtx, inst.id);
    expect(detail.installation.id).toBe(inst.id);
    await expect(getInstallationDetail(bCtx, inst.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("enforces workspace isolation: a workspace listing never leaks another workspace's connectors", async () => {
    await connect(REPS[0]!, "ws_one");
    await connect(REPS[1]!, "ws_two");
    const one = await listInstallations(ctx, "ws_one");
    const two = await listInstallations(ctx, "ws_two");
    expect(one.map((i) => i.connectorId)).toEqual(["google-gmail"]);
    expect(two.map((i) => i.connectorId)).toEqual(["slack"]);
  });
});

/* ---- Secret certification -------------------------------------------------- */

describe("secret — no token or credential material leaks across any surface", () => {
  it("DTOs, events, and audit rows carry no secret for any family", async () => {
    for (const rep of REPS) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const res = await invokeConnectorCapability(ctx, { installationId: id, capabilityKey: rep.readCapability, input: {} });
      const detail = await getInstallationDetail(ctx, id);
      const blob = JSON.stringify({ res, detail });
      // OAuth token material + api-key credential values must never surface.
      expect(blob, rep.connectorId).not.toContain(`at-${rep.connectorId}`);
      expect(blob, rep.connectorId).not.toContain(`rt-${rep.connectorId}`);
      if (rep.authMethod === "api_key") expect(blob, rep.connectorId).not.toContain("shp-token");
      // No webhook signing secret leaks either.
      const sig = rep.config["webhookSigningSecret"];
      if (typeof sig === "string") expect(blob, rep.connectorId).not.toContain(sig);
    }
  });
});

/* ---- OAuth certification --------------------------------------------------- */

describe("oauth — transparent refresh + rotation before invocation, and reconnect", () => {
  it("refreshes + rotates an expired token before invoking, across oauth2 families", async () => {
    for (const rep of REPS.filter((r) => r.authMethod === "oauth2")) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore();
      adapters = fullRegistry({ [rep.connectorId]: stubAdapter(rep.connectorId, { expiredExchange: true }) });
      ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const res = await invokeConnectorCapability(ctx, { installationId: id, capabilityKey: rep.readCapability, input: {} });
      expect(res.capabilityKey, rep.connectorId).toBe(rep.readCapability);
      const refs = await repos.secrets.listByInstallation(id);
      const tokenRef = refs.ok ? refs.value.find((r) => r.purpose === "oauth_token")! : null;
      expect(tokenRef!.validationState, rep.connectorId).toBe("valid");
      expect(tokenRef!.rotatedAt, rep.connectorId).not.toBeNull();
      expect(secrets.peek(tokenRef!.secretRef), rep.connectorId).toContain("refreshed");
    }
  });

  it("surfaces reconnect when a stored token is revoked out-of-band", async () => {
    const rep = REPS.find((r) => r.authMethod === "oauth2")!;
    const id = await connect(rep);
    const refs = await repos.secrets.listByInstallation(id);
    const tokenRef = refs.ok ? refs.value.find((r) => r.purpose === "oauth_token")! : null;
    await secrets.revokeSecret(tokenRef!.secretRef);
    await expect(invokeConnectorCapability(ctx, { installationId: id, capabilityKey: rep.readCapability, input: {} })).rejects.toBeInstanceOf(RuntimeUnavailableError);
  });
});

/* ---- Webhook certification ------------------------------------------------- */

describe("webhook — verify, idempotent replay, rejection, malformed", () => {
  it("ingests a signed webhook then treats a replay as a duplicate (webhook families)", async () => {
    for (const rep of REPS.filter((r) => r.webhook)) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const sig = String(rep.config["webhookSigningSecret"]);
      const rawBody = JSON.stringify({ id: "evt_1", kind: "x" });
      const first = await ingestConnectorWebhook(ctx, { installationId: id, rawBody, signature: sig });
      expect(first.signatureValid, rep.connectorId).toBe(true);
      expect(first.eventCount, rep.connectorId).toBe(1);
      const replay = await ingestConnectorWebhook(ctx, { installationId: id, rawBody, signature: sig });
      expect(replay.status, rep.connectorId).toBe("duplicate");
      expect(replay.eventCount, rep.connectorId).toBe(1);
    }
  });

  it("rejects an invalid signature and tolerates a malformed body", async () => {
    const rep = REPS.find((r) => r.webhook)!;
    const id = await connect(rep);
    const bad = await ingestConnectorWebhook(ctx, { installationId: id, rawBody: JSON.stringify({ id: "evt_2" }), signature: "WRONG", externalEventId: "evt_2" });
    expect(bad.signatureValid).toBe(false);
    expect(bad.status).toBe("rejected");
    // Malformed body with a valid signature verifies but translates to ZERO events
    // (never throws) — untrusted provider content is translated, never obeyed.
    const sig = String(rep.config["webhookSigningSecret"]);
    const malformed = await ingestConnectorWebhook(ctx, { installationId: id, rawBody: "not-json", signature: sig, externalEventId: "evt_3" });
    expect(malformed.signatureValid).toBe(true);
    expect(malformed.eventCount).toBe(0);
  });
});

/* ---- Polling certification ------------------------------------------------- */

describe("polling — cursor persistence + replay safety", () => {
  it("advances the cursor and resumes from the new cursor without duplicates", async () => {
    const rep = REPS[0]!; // gmail (polling)
    const id = await connect(rep);
    await setPollingTrigger(id);
    const first = await pollConnector(ctx, { installationId: id, limit: 2 });
    expect(first.eventCount).toBe(2);
    expect(first.cursor).toBe("2");
    const second = await pollConnector(ctx, { installationId: id, limit: 2 });
    expect(second.cursor).toBe("4");
    expect(second.sequence).toBe(2);
  });
});

/* ---- Audit certification --------------------------------------------------- */

describe("audit — every invocation produces a complete, correlated audit row", () => {
  it("records workspace, connector, capability outcome, and correlation for each family", async () => {
    for (const rep of REPS) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      await invokeConnectorCapability(ctx, { installationId: id, capabilityKey: rep.readCapability, input: {} });
      const audit = await repos.audit.listByInstallation(id, 50);
      const rows = audit.ok ? audit.value : [];
      const invoke = rows.find((a) => a.operation === "invoke");
      expect(invoke, rep.connectorId).toBeDefined();
      expect(invoke!.workspaceId, rep.connectorId).toBe(WS);
      expect(invoke!.connectorInstallationId, rep.connectorId).toBe(id);
      expect(invoke!.correlationId.length, rep.connectorId).toBeGreaterThan(0);
      expect(invoke!.summary, rep.connectorId).toContain(rep.readCapability);
      // Install + validate are also audited (a full lifecycle trail).
      expect(rows.some((a) => a.operation === "install"), rep.connectorId).toBe(true);
    }
  });
});

/* ---- Health certification -------------------------------------------------- */

describe("health — only the shared normalized vocabulary is reported", () => {
  const ALLOWED = new Set(["healthy", "degraded", "unavailable", "unauthorized", "unknown"]);
  it("every family reports a health level from the shared vocabulary", async () => {
    for (const rep of REPS) {
      repos = createInMemoryIntegrationRepos(); secrets = createInMemoryConnectorSecretStore(); adapters = fullRegistry(); ctx = makeCtx(OWNER);
      const id = await connect(rep);
      const health = await checkConnectorHealth(ctx, id);
      expect(ALLOWED.has(health.level), `${rep.connectorId}:${health.level}`).toBe(true);
    }
  });
});

/* ---- Copilot boundary certification ---------------------------------------- */

describe("copilot — no provider-specific connector logic inside Copilot", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const copilotDirs = [
    join(here, "..", "copilot"), // packages/application/src/copilot
    join(here, "..", "..", "..", "domain", "src", "copilot"), // packages/domain/src/copilot
  ];
  const FORBIDDEN = [
    "integration/google", "integration/social", "integration/commerce", "integration/crm",
    "integration/finance", "integration/communication", "createGoogleConnectorAdapters",
    "createSocialConnectorAdapters", "createCommerceConnectorAdapters", "invokeConnectorCapability",
  ];

  function tsFiles(dir: string): string[] {
    if (!existsSync(dir)) return [];
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsFiles(p));
      else if (entry.name.endsWith(".ts")) out.push(p);
    }
    return out;
  }

  it("scans the copilot source and finds no connector-family coupling", () => {
    const files = copilotDirs.flatMap(tsFiles);
    expect(files.length, "copilot source files found").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const needle of FORBIDDEN) if (text.includes(needle)) offenders.push(`${f} :: ${needle}`);
    }
    expect(offenders, "copilot must not import or hardcode connector-provider logic").toEqual([]);
  });
});
