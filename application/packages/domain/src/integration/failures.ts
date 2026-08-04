/* =============================================================================
 * Integration Platform — failure normalization + retry disposition (F4.1). PURE.
 *
 * Turns a normalized ConnectorFailureCategory into a safe user message and a
 * bounded retry decision. Never surfaces a provider message/secret. No io.
 * ========================================================================== */

import type { ConnectorFailureCategory } from "@brightloop/schema";

export interface NormalizedConnectorFailure {
  category: ConnectorFailureCategory;
  retryable: boolean;
  /** Safe, generic prose for the operator — never a provider body or secret. */
  userMessage: string;
}

const MESSAGES: Record<ConnectorFailureCategory, string> = {
  authentication: "The connector could not authenticate. Check the credential and re-validate.",
  authorization: "The connector is not authorized for this operation.",
  validation: "The request to the provider was invalid.",
  unsupported: "The provider does not support this operation.",
  conflict: "The provider reported a conflicting state.",
  timeout: "The provider timed out. This can be retried.",
  throttled: "The provider throttled the request. Back off and retry.",
  rate_limited: "The provider rate-limited the request. Back off and retry.",
  provider_unavailable: "The provider is temporarily unavailable. This can be retried.",
  network: "A network error reached the provider. This can be retried.",
  signature_invalid: "The webhook signature did not verify. The event was rejected.",
  secret_unavailable: "The connector secret reference is unavailable.",
  config_invalid: "The connector configuration is invalid.",
  unknown: "The connector operation failed for an unknown reason.",
};

const RETRYABLE: ReadonlySet<ConnectorFailureCategory> = new Set<ConnectorFailureCategory>([
  "timeout", "throttled", "rate_limited", "provider_unavailable", "network",
]);

/** Normalize a category into a safe message + retry disposition. */
export function normalizeConnectorFailure(category: ConnectorFailureCategory): NormalizedConnectorFailure {
  return { category, retryable: RETRYABLE.has(category), userMessage: MESSAGES[category] ?? MESSAGES.unknown };
}
