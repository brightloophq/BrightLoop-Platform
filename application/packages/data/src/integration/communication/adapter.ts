/* =============================================================================
 * Communication connectors — ConnectorAdapter assembly (F4.3). SERVER-ONLY.
 *
 * ONE generic engine builds a framework `ConnectorAdapter` from a
 * `CommProviderBinding` (Slack/Teams/Discord). It composes the OAuth flow (for
 * OAuth bindings), a cheap probe (validate/health), capability discovery, polling +
 * normalized event translation, and an `execute` dispatcher over the binding's
 * operation map. Provider-neutral out; no provider type or secret leaks past this
 * boundary. Disabled-safe: with no client creds an OAuth adapter still registers but
 * authorization fails clearly and no token call is attempted.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorConnectionInput, type ConnectorConnectionValidationResult, type ConnectorHealthResult,
  type ConnectorResult, type ExchangeCodeInput, type ExecuteOperationInput, type OperationOutput,
  type PollInput, type PollResult, type RefreshTokenInput,
} from "@brightloop/domain";
import { callProvider, type CommCall, type CommConfig, type CommProviderBinding, type ProviderCreds } from "./client.js";
import { healthForReason, reasonForCategory } from "./errors.js";
import { buildCommAuthorizationUrl, exchangeCommCode, refreshCommToken } from "./oauth.js";
import { SLACK_BINDING } from "./slack.js";
import { TEAMS_BINDING } from "./teams.js";
import { DISCORD_BINDING } from "./discord.js";
import type { OpInput } from "./helpers.js";

const BINDINGS: CommProviderBinding[] = [SLACK_BINDING, TEAMS_BINDING, DISCORD_BINDING];

/** Shared config + per-provider OAuth client credentials keyed by connector id. */
export interface CommunicationConfig extends CommConfig {
  creds: Partial<Record<string, ProviderCreds>>;
}

function createCommAdapter(cfg: CommunicationConfig, binding: CommProviderBinding): ConnectorAdapter {
  const creds = cfg.creds[binding.connectorId] ?? null;
  const callFor = (token: string | null): CommCall => (spec) => callProvider(cfg, binding, token, spec);
  const declaredOps = Object.keys(binding.ops);

  const base: ConnectorAdapter = {
    connectorId: binding.connectorId,

    async validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>> {
      const res = await callFor(input.secret)({ method: "GET", url: binding.probeUrl });
      if (!res.ok) return connectorErr(res.category, res.message, res.code);
      return connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 });
    },

    async healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>> {
      const res = await callFor(input.secret)({ method: "GET", url: binding.probeUrl });
      const reason = res.ok ? "connected" : reasonForCategory(res.category);
      const level = res.ok ? "healthy" as const : healthForReason(reason);
      return connectorOk({ level, providerVersion: "v1", latencyMs: 0, detail: { reason } });
    },

    async discoverCapabilities() {
      return connectorOk(declaredOps.map((operation) => ({ operation, supported: true })));
    },

    async execute(input: ExecuteOperationInput): Promise<ConnectorResult<OperationOutput>> {
      const handler = binding.ops[input.operation];
      if (handler === undefined) return connectorErr("unsupported", `operation ${input.operation} is not supported`, "unsupported_operation");
      return handler(callFor(input.secret), input.input as OpInput, input.config as OpInput);
    },
  };

  if (binding.poll !== undefined) {
    base.poll = async (input: PollInput): Promise<ConnectorResult<PollResult>> =>
      binding.poll!(callFor(input.secret), input.config as OpInput, input.cursor, input.limit, cfg.now);
  }

  // OAuth methods are present ONLY for OAuth bindings with configured creds.
  if (binding.oauth !== undefined && creds !== null) {
    base.buildAuthorizationUrl = (input: BuildAuthorizationUrlInput) => buildCommAuthorizationUrl(cfg, binding, creds, input);
    base.exchangeAuthorizationCode = (input: ExchangeCodeInput) => exchangeCommCode(cfg, binding, creds, input);
    base.refreshAccessToken = (input: RefreshTokenInput) => refreshCommToken(cfg, binding, creds, input);
  }

  return base;
}

/** Build the three communication connector adapters keyed by connector id. */
export function createCommunicationConnectorAdapters(cfg: CommunicationConfig): ConnectorAdapterRegistry {
  const registry: ConnectorAdapterRegistry = {};
  for (const binding of BINDINGS) registry[binding.connectorId] = createCommAdapter(cfg, binding);
  return registry;
}

/**
 * Load the app-level communication OAuth config from the environment. Slack + Teams
 * client id/secret are provisioned out-of-band; Discord needs none (bot token is a
 * per-install secret). Client secrets are NEVER persisted.
 */
export function loadCommunicationConfig(env: NodeJS.ProcessEnv, transport: CommConfig["transport"], now: () => string): CommunicationConfig {
  return {
    transport,
    now,
    defaultRedirectUri: env["CONNECTOR_OAUTH_REDIRECT_URI"] ?? "",
    timeoutMs: 15_000,
    creds: {
      slack: { clientId: env["SLACK_CLIENT_ID"] ?? "", clientSecret: env["SLACK_CLIENT_SECRET"] ?? "" },
      "microsoft-teams": { clientId: env["MS_TEAMS_CLIENT_ID"] ?? "", clientSecret: env["MS_TEAMS_CLIENT_SECRET"] ?? "" },
    },
  };
}
