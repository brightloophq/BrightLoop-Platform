/* =============================================================================
 * Social connectors — ConnectorAdapter assembly (F4.7). SERVER-ONLY.
 *
 * ONE generic engine builds a framework `ConnectorAdapter` from a
 * `SocialProviderBinding` (Meta / LinkedIn / X / TikTok). Each call resolves an
 * AuthContext (base URL + Bearer + version headers) from the resolved OAuth token +
 * install config, then runs the work through a pre-authorized `call` closure. It
 * composes the OAuth flow (authorize URL, code exchange, refresh), a cheap probe
 * (validate/health), capability discovery, `execute` dispatch over the normalized
 * social.* operation map, polling + canonical event translation, and (Meta only)
 * webhook verify/translate. Provider-neutral out; no provider type or secret leaks past
 * this boundary. Disabled-safe: with no client creds an adapter still registers but
 * OAuth fails clearly and no token call is attempted.
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type BuildAuthorizationUrlInput, type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorConnectionInput, type ConnectorConnectionValidationResult, type ConnectorHealthResult,
  type ConnectorResult, type ExchangeCodeInput, type ExecuteOperationInput, type OperationOutput,
  type PollInput, type PollResult, type RefreshTokenInput, type TranslateWebhookInput, type VerifiedWebhook, type VerifyWebhookInput,
} from "@brightloop/domain";
import { callSocial, type SocialCall, type SocialConfig, type SocialProviderBinding, type ProviderCreds } from "./client.js";
import { healthForReason, reasonForCategory } from "./errors.js";
import { buildSocialAuthorizationUrl, exchangeSocialCode, refreshSocialToken } from "./oauth.js";
import { META_BINDING } from "./meta.js";
import { LINKEDIN_BINDING } from "./linkedin.js";
import { X_BINDING } from "./x.js";
import { TIKTOK_BINDING } from "./tiktok.js";
import type { OpInput } from "./helpers.js";

const BINDINGS: SocialProviderBinding[] = [META_BINDING, LINKEDIN_BINDING, X_BINDING, TIKTOK_BINDING];

/** Shared config + per-provider OAuth client credentials keyed by connector id. */
export interface SocialConnectorConfig extends SocialConfig {
  creds: Partial<Record<string, ProviderCreds>>;
}

function createSocialAdapter(cfg: SocialConnectorConfig, binding: SocialProviderBinding): ConnectorAdapter {
  const creds = cfg.creds[binding.connectorId] ?? null;
  const declaredOps = Object.keys(binding.ops);
  const callWith = (auth: { baseUrl: string; headers: Record<string, string> }): SocialCall => (spec) => callSocial(cfg, binding, auth, spec);

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
    base.buildAuthorizationUrl = (input: BuildAuthorizationUrlInput) => buildSocialAuthorizationUrl(cfg, binding, creds, input);
    base.exchangeAuthorizationCode = (input: ExchangeCodeInput) => exchangeSocialCode(cfg, binding, creds, input);
    base.refreshAccessToken = (input: RefreshTokenInput) => refreshSocialToken(cfg, binding, creds, input);
  }

  return base;
}

/** Build the four social connector adapters keyed by connector id. */
export function createSocialConnectorAdapters(cfg: SocialConnectorConfig): ConnectorAdapterRegistry {
  const registry: ConnectorAdapterRegistry = {};
  for (const binding of BINDINGS) registry[binding.connectorId] = createSocialAdapter(cfg, binding);
  return registry;
}

/**
 * Load the app-level social OAuth config from the environment. Client id/secret for each
 * provider are provisioned out-of-band (Meta App, LinkedIn App, X App, TikTok App —
 * TikTok's credential is a `client_key`); access + refresh tokens are per-install secrets
 * stored ONLY by reference. Client secrets are NEVER persisted.
 */
export function loadSocialConfig(env: NodeJS.ProcessEnv, transport: SocialConfig["transport"], now: () => string): SocialConnectorConfig {
  return {
    transport,
    now,
    defaultRedirectUri: env["CONNECTOR_OAUTH_REDIRECT_URI"] ?? "",
    timeoutMs: 15_000,
    creds: {
      meta: { clientId: env["META_CLIENT_ID"] ?? "", clientSecret: env["META_CLIENT_SECRET"] ?? "" },
      linkedin: { clientId: env["LINKEDIN_CLIENT_ID"] ?? "", clientSecret: env["LINKEDIN_CLIENT_SECRET"] ?? "" },
      x: { clientId: env["X_CLIENT_ID"] ?? "", clientSecret: env["X_CLIENT_SECRET"] ?? "" },
      tiktok: { clientId: env["TIKTOK_CLIENT_KEY"] ?? "", clientSecret: env["TIKTOK_CLIENT_SECRET"] ?? "" },
    },
  };
}
