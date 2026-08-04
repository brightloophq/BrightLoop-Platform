/* =============================================================================
 * Commerce connectors — ConnectorAdapter assembly (F4.4). SERVER-ONLY.
 *
 * ONE generic engine builds a framework `ConnectorAdapter` from a
 * `CommerceProviderBinding` (Shopify/Stripe/PayPal). Each call first resolves an
 * AuthContext via the binding's `authorize` (a token exchange for PayPal), then runs
 * the requested work through a pre-authorized `call` closure. It composes a cheap
 * probe (validate/health), capability discovery, `execute` dispatch over the
 * normalized commerce.* operation map, polling + canonical event translation, and
 * webhook verify/translate. Provider-neutral out; no provider type or secret leaks
 * past this boundary. Disabled-safe: with no credential, auth fails clearly and no
 * work is attempted. All three connectors are api-key style (no user-redirect OAuth).
 * ========================================================================== */

import {
  connectorErr, connectorOk,
  type CanonicalConnectorEvent, type ConnectorAdapter, type ConnectorAdapterRegistry,
  type ConnectorConnectionInput, type ConnectorConnectionValidationResult, type ConnectorHealthResult,
  type ConnectorResult, type ExecuteOperationInput, type OperationOutput,
  type PollInput, type PollResult, type TranslateWebhookInput, type VerifiedWebhook, type VerifyWebhookInput,
} from "@brightloop/domain";
import { callCommerce, type AuthContext, type CommerceCall, type CommerceConfig, type CommerceProviderBinding } from "./client.js";
import { healthForReason, reasonForCategory } from "./errors.js";
import { SHOPIFY_BINDING } from "./shopify.js";
import { STRIPE_BINDING } from "./stripe.js";
import { PAYPAL_BINDING } from "./paypal.js";
import type { OpInput } from "./helpers.js";

const BINDINGS: CommerceProviderBinding[] = [SHOPIFY_BINDING, STRIPE_BINDING, PAYPAL_BINDING];

/** Shared config for the commerce connectors (transport + clock). */
export type CommerceConnectorConfig = CommerceConfig;

function createCommerceAdapter(cfg: CommerceConfig, binding: CommerceProviderBinding): ConnectorAdapter {
  const declaredOps = Object.keys(binding.ops);
  const authFor = (secret: string | null, config: OpInput) => binding.authorize(cfg, secret, config);
  const callWith = (auth: AuthContext): CommerceCall => (spec) => callCommerce(cfg, binding, auth, spec);

  const base: ConnectorAdapter = {
    connectorId: binding.connectorId,

    async validateConnection(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorConnectionValidationResult>> {
      const auth = await authFor(input.secret, input.config as OpInput);
      if (!auth.ok) return connectorErr(auth.category, auth.message, auth.code);
      if (binding.probePath.length > 0) {
        const probe = await callWith(auth.value)({ method: "GET", path: binding.probePath });
        if (!probe.ok) return connectorErr(probe.category, probe.message, probe.code);
      }
      return connectorOk({ reachable: true, authenticated: true, providerVersion: "v1", latencyMs: 0 });
    },

    async healthCheck(input: ConnectorConnectionInput): Promise<ConnectorResult<ConnectorHealthResult>> {
      const auth = await authFor(input.secret, input.config as OpInput);
      if (!auth.ok) {
        const reason = reasonForCategory(auth.category);
        return connectorOk({ level: healthForReason(reason), providerVersion: "v1", latencyMs: 0, detail: { reason } });
      }
      if (binding.probePath.length > 0) {
        const probe = await callWith(auth.value)({ method: "GET", path: binding.probePath });
        const reason = probe.ok ? "connected" : reasonForCategory(probe.category);
        return connectorOk({ level: probe.ok ? "healthy" : healthForReason(reason), providerVersion: "v1", latencyMs: 0, detail: { reason } });
      }
      return connectorOk({ level: "healthy", providerVersion: "v1", latencyMs: 0, detail: { reason: "connected" } });
    },

    async discoverCapabilities() {
      return connectorOk(declaredOps.map((operation) => ({ operation, supported: true })));
    },

    async execute(input: ExecuteOperationInput): Promise<ConnectorResult<OperationOutput>> {
      const handler = binding.ops[input.operation];
      if (handler === undefined) return connectorErr("unsupported", `operation ${input.operation} is not supported`, "unsupported_operation");
      const auth = await authFor(input.secret, input.config as OpInput);
      if (!auth.ok) return connectorErr(auth.category, auth.message, auth.code);
      return handler(callWith(auth.value), input.input as OpInput, input.config as OpInput);
    },
  };

  if (binding.poll !== undefined) {
    base.poll = async (input: PollInput): Promise<ConnectorResult<PollResult>> => {
      const auth = await authFor(input.secret, input.config as OpInput);
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

  return base;
}

/** Build the three commerce connector adapters keyed by connector id. */
export function createCommerceConnectorAdapters(cfg: CommerceConfig): ConnectorAdapterRegistry {
  const registry: ConnectorAdapterRegistry = {};
  for (const binding of BINDINGS) registry[binding.connectorId] = createCommerceAdapter(cfg, binding);
  return registry;
}

/**
 * Load the commerce connector config from the environment. Commerce connectors carry
 * NO app-level OAuth client credentials (Shopify uses a per-install Admin API token,
 * Stripe a per-install secret key, PayPal per-install client-credentials) — every
 * credential is a per-installation secret stored ONLY by reference. So this needs
 * just the shared transport + clock; it is provided for symmetry with the other
 * connector families and future config.
 */
export function loadCommerceConfig(_env: NodeJS.ProcessEnv, transport: CommerceConfig["transport"], now: () => string): CommerceConfig {
  return { transport, now, timeoutMs: 15_000 };
}
