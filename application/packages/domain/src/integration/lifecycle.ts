/* =============================================================================
 * Integration Platform — lifecycle state machines (F4.1). PURE.
 *
 * Every legal connector-installation and OAuth-grant transition is declared here;
 * anything else fails deterministically. Mirrors the F3 lifecycle pattern. No io.
 * ========================================================================== */

import type { ConnectorInstallationStatus, OAuthGrantStatus } from "@brightloop/schema";

function machine<S extends string>(edges: Record<S, readonly S[]>) {
  const can = (from: S, to: S): boolean => (edges[from] ?? []).includes(to);
  const isTerminal = (s: S): boolean => (edges[s] ?? []).length === 0;
  return { can, isTerminal, edges };
}

/* ---- connector installation lifecycle -------------------------------------- */

export const INSTALLATION_TRANSITIONS: Record<ConnectorInstallationStatus, readonly ConnectorInstallationStatus[]> = {
  // Installed but not yet configured (missing required config or credentials).
  pending_configuration: ["configuring", "disabled", "revoked"],
  // Config supplied; can move to validation.
  configuring: ["validating", "pending_configuration", "disabled", "revoked"],
  // Validating connectivity/auth against the provider.
  validating: ["connected", "degraded", "error", "disabled", "revoked"],
  // Live and healthy.
  connected: ["degraded", "error", "validating", "disabled", "revoked"],
  // Live but impaired (health degraded / throttled).
  degraded: ["connected", "error", "validating", "disabled", "revoked"],
  // Turned off by an operator; can be re-enabled (re-validated).
  disabled: ["validating", "pending_configuration", "revoked"],
  // A validation/health failure that needs attention; recoverable.
  error: ["validating", "configuring", "disabled", "revoked"],
  // Permanently torn down (credentials revoked). Terminal.
  revoked: [],
};
const installation = machine(INSTALLATION_TRANSITIONS);
export const canTransitionInstallation = (from: ConnectorInstallationStatus, to: ConnectorInstallationStatus): boolean => installation.can(from, to);
export const isInstallationTerminal = (s: ConnectorInstallationStatus): boolean => installation.isTerminal(s);

/* ---- OAuth grant lifecycle ------------------------------------------------- */

export const OAUTH_GRANT_TRANSITIONS: Record<OAuthGrantStatus, readonly OAuthGrantStatus[]> = {
  pending: ["authorized", "failed", "expired"],
  authorized: ["exchanged", "failed", "expired"],
  exchanged: [],
  failed: [],
  expired: [],
};
const oauth = machine(OAUTH_GRANT_TRANSITIONS);
export const canTransitionOAuthGrant = (from: OAuthGrantStatus, to: OAuthGrantStatus): boolean => oauth.can(from, to);
export const isOAuthGrantTerminal = (s: OAuthGrantStatus): boolean => oauth.isTerminal(s);
