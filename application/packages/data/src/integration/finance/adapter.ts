/* =============================================================================
 * Finance connectors — ConnectorAdapter assembly (F4.6). SERVER-ONLY.
 *
 * ONE generic engine builds a framework `ConnectorAdapter` from a
 * `FinanceProviderBinding` (QuickBooks Online / Xero). Each call resolves an AuthContext
 * (base URL + Bearer headers + tenancy header) from the resolved OAuth token + install
 * config, then runs the work through a pre-authorized `call` closure. It composes the
 * OAuth flow (authorize URL, code exchange, refresh), a cheap probe (validate/health),
 * capability discovery, `execute` dispatch over the normalized finance.* operation map,
 * polling + canonical event translation, and webhook verify/translate. Provider-neutral
 * out; no provider type or secret leaks past this boundary. Disabled-safe: with no
 * client creds an adapter still registers but OAuth fails clearly and no token call is
 * attempted.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorConnectionInput, type ConnectorConnectionValidationResult, type ConnectorHealthResult,
  type ConnectorResult, type ExchangeCodeInput, type ExecuteOperationInput, type OperationOutput,
  type PollInput, type PollResult, type RefreshTokenInput, type TranslateWebhookInput, type VerifiedWebhook, type VerifyWebhookInput,
} from "@brightloop/domain";
import { callFinance, type FinanceCall, type FinanceConfig, type FinanceProviderBinding, type ProviderCreds } from "./client.js";
import { healthForReason, reasonForCategory } from "./errors.js";
import { buildFinanceAuthorizationUrl, exchangeFinanceCode, refreshFinanceToken } from "./oauth.js";
import { QUICKBOOKS_BINDING } from "./quickbooks.js";
import { XERO_BINDING } from "./xero.js";
import type { OpInput } from "./helpers.js";

const BINDINGS: FinanceProviderBinding[] = [QUICKBOOKS_BINDING, XERO_BINDING];

/** Shared config + per-provider OAuth client credentials keyed by connector id. */
export interface FinanceConnectorConfig extends FinanceConfig {
  creds: Partial<Record<string, ProviderCreds>>;
}

function createFinanceAdapter(cfg: FinanceConnectorConfig, binding: FinanceProviderBinding): ConnectorAdapter {
  const creds = cfg.creds[binding.connectorId] ?? null;
  const declaredOps = Object.keys(binding.ops);
  const callWith = (auth: { baseUrl: string; headers: Record<string, string> }): FinanceCall => (spec) => callFinance(cfg, binding, auth, spec);

  const base: ConnectorAdapter = {
    connectorId: binding.connectorId,

    async validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>> {
      const auth = binding.authorize(input.secret, input.config as OpInput);
      if (!auth.ok) return connectorErr(auth.category, auth.message, auth.code);
      const probe = await callWith(auth.value)({ method: "GET", path: binding.probePath });
      if (!probe.ok) return connectorErr(probe.category, probe.message, probe.code);
      return connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 });
    },

    async healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>> {
      const auth = binding.authorize(input.secret, input.config as OpInput);
      if (!auth.ok) {
        const reason = reasonForCategory(auth.category);
        return connectorOk({ level: healthForReason(reason), providerVersion: "v1", latencyMs: 0, detail: { reason } });
      }
      const probe = await callWith(auth.value)({ method: "GET", path: binding.probePath });
      const reason = probe.ok ? "connected" : reasonForCategory(probe.category);
      return connectorOk({ level: probe.ok ? "healthy" : healthForReason(reason), providerVersion: "v1", latencyMs: 0, detail: { reason } });
    },

    async discoverCapabilities() {
      return connectorOk(declaredOps.map((operation) => ({ operation, supported: true })));
    },

    async execute(input: ExecuteOperationInput): Promise<ConnectorResult<OperationOutput>> {
      const handler = binding.ops[input.operation];
      if (handler === undefined) return connectorErr("unsupported", `operation ${input.operation} is not supported`, "unsupported_operation");
      const auth = binding.authorize(input.secret, input.config as OpInput);
      if (!auth.ok) return connectorErr(auth.category, auth.message, auth.code);
      return handler(callWith(auth.value), input.input as OpInput, input.config as OpInput);
    },
  };

  if (binding.poll !== undefined) {
    base.poll = async (input: PollInput): Promise<ConnectorResult<PollResult>> => {
      const auth = binding.authorize(input.secret, input.config as OpInput);
      if (!auth.ok) return connectorErr(auth.category, auth.message, auth.code);
      return binding.poll!(callWith(auth.value), input.config as OpInput, input.cursor, input.limit, cfg.now);
    };
  }

  if (binding.webhook !== undefined) {
    base.verifyWebhook = (input: VerifyWebhookInput): ConnectorResult<VerifiedWebhook> =>
      binding.webhook!.verify(input.rawBody, input.signature, input.signingSecret);
    base.translateWebhook = (input: TranslateWebhookInput): ConnectorResult<CanonicalConnectorEvent[]> =>
      binding.webhook!.translate(input.rawBody, cfg.now);
  }

  // OAuth methods are present ONLY when app-level client creds are configured.
  if (creds !== null) {
    base.buildAuthorizationUrl = (input: BuildAuthorizationUrlInput) => buildFinanceAuthorizationUrl(cfg, binding, creds, input);
    base.exchangeAuthorizationCode = (input: ExchangeCodeInput) => exchangeFinanceCode(cfg, binding, creds, input);
    base.refreshAccessToken = (input: RefreshTokenInput) => refreshFinanceToken(cfg, binding, creds, input);
  }

  return base;
}

/** Build the two finance connector adapters keyed by connector id. */
export function createFinanceConnectorAdapters(cfg: FinanceConnectorConfig): ConnectorAdapterRegistry {
  const registry: ConnectorAdapterRegistry = {};
  for (const binding of BINDINGS) registry[binding.connectorId] = createFinanceAdapter(cfg, binding);
  return registry;
}

/**
 * Load the app-level finance OAuth config from the environment. Client id/secret for each
 * provider are provisioned out-of-band (Intuit / Xero connected apps); access + refresh
 * tokens are per-install secrets stored ONLY by reference. Client secrets are NEVER
 * persisted.
 */
export function loadFinanceConfig(env: NodeJS.ProcessEnv, transport: FinanceConfig["transport"], now: () => string): FinanceConnectorConfig {
  return {
    transport,
    now,
    defaultRedirectUri: env["CONNECTOR_OAUTH_REDIRECT_URI"] ?? "",
    timeoutMs: 15_000,
    creds: {
      quickbooks: { clientId: env["QUICKBOOKS_CLIENT_ID"] ?? "", clientSecret: env["QUICKBOOKS_CLIENT_SECRET"] ?? "" },
      xero: { clientId: env["XERO_CLIENT_ID"] ?? "", clientSecret: env["XERO_CLIENT_SECRET"] ?? "" },
    },
  };
}
